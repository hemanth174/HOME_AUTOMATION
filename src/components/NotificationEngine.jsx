'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { publishClientNotification } from '@/lib/clientNotifications';
import { showBrowserNotification } from '@/lib/browserNotifications';
import { isBoardRecentlyOnline } from '@/lib/boardPresence';
import {
  getDeviceRunHoursToday,
  getDeviceWattage,
} from '@/app/analytics/helpers';

const DEFAULTS = {
  notifications_enabled: true,
  notify_energy: true,
  energy_device_kwh_threshold: 3,
  notify_ghost: true,
  ghost_summary_hour: 20,
  tariff_per_kwh: 8,
  currency: 'INR',
};

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

function localDateKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function money(value, currency) {
  return `${CURRENCY_SYMBOLS[currency] || ''}${Number(value || 0).toFixed(2)}`;
}

export default function NotificationEngine({ user }) {
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    const channel = supabase.channel(`alarm-browser-alerts-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'alarms', filter: `user_id=eq.${user.id}`,
      }, async ({ new: alarm }) => {
        if (!active || !alarm?.fired || alarm.deleted_at) return;
        const { data: settings, error: settingsError } = await supabase.from('user_settings')
          .select('notifications_enabled,notify_alarm').eq('user_id', user.id).maybeSingle();
        if (!active || settingsError || settings?.notifications_enabled === false || settings?.notify_alarm === false) return;
        const { data: device } = await supabase.from('devices').select('name')
          .eq('id', alarm.device_id).eq('user_id', user.id).maybeSingle();
        if (!active) return;
        const body = `${device?.name || 'Device'} turned ${alarm.action ? 'ON' : 'OFF'}.`;
        const dedupeKey = `alarm:${alarm.id}`;
        const result = await publishClientNotification({
          userId: user.id, type: 'alarm', title: 'Alarm fired', body,
          url: '/alarms', dedupeKey, data: { alarm_id: alarm.id, device_id: alarm.device_id },
        });
        if (result?.status === 'duplicate') {
          await showBrowserNotification({ title: 'Alarm fired', body, tag: dedupeKey, url: '/alarms' });
        }
      }).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    let running = false;

    const run = async () => {
      if (!active || running) return;
      running = true;
      try {
        const [{ data: settings }, { data: devices }, { data: boards }] = await Promise.all([
          supabase
            .from('user_settings')
            .select(
              'notifications_enabled, notify_energy, energy_device_kwh_threshold, notify_ghost, ghost_summary_hour, tariff_per_kwh, currency',
            )
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('devices')
            .select('id, board_id, name, is_on, last_changed')
            .eq('user_id', user.id).is('deleted_at', null),
          supabase.from('boards').select('id, last_seen')
            .eq('user_id', user.id).is('deleted_at', null),
        ]);

        if (!active || !devices?.length) return;
        const prefs = { ...DEFAULTS, ...(settings || {}) };
        if (prefs.notifications_enabled === false) return;

        const now = new Date();
        const liveBoards = new Set((boards || []).filter((board) => isBoardRecentlyOnline(board, now)).map((board) => board.id));
        const liveDevices = devices.filter((device) => liveBoards.has(device.board_id));
        if (!liveDevices.length) return;
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const { data: logs } = await supabase
          .from('activity_logs')
          .select('device_id, action, created_at')
          .eq('user_id', user.id)
          .gte('created_at', startOfToday.toISOString())
          .lte('created_at', now.toISOString())
          .order('created_at', { ascending: true });

        if (!active) return;
        const dateKey = localDateKey(now);
        const stats = liveDevices.map((device) => {
          const runHours = getDeviceRunHoursToday(device, logs || []);
          const kwh = (getDeviceWattage(device.name || '') * runHours) / 1000;
          return { device, runHours, kwh };
        });

        if (prefs.notify_energy !== false) {
          const threshold = Math.max(
            0.001,
            Number(prefs.energy_device_kwh_threshold) || 3,
          );
          for (const { device, kwh } of stats) {
            if (kwh < threshold) continue;
            const cost = kwh * Number(prefs.tariff_per_kwh || 0);
            void publishClientNotification({
              userId: user.id,
              type: 'energy',
              title: 'High energy usage',
              body: `${device.name} used ${kwh.toFixed(2)} kWh today (limit ${threshold.toFixed(2)} kWh, about ${money(cost, prefs.currency)}).`,
              url: '/analytics',
              dedupeKey: `energy:${device.id}:${dateKey}`,
              data: {
                device_id: device.id,
                kwh: Number(kwh.toFixed(3)),
                threshold,
                date: dateKey,
              },
            });
          }
        }

        if (
          prefs.notify_ghost !== false &&
          now.getHours() === Number(prefs.ghost_summary_hour)
        ) {
          const idle = stats.filter(
            (item) => item.runHours <= 0 && item.kwh <= 0,
          );
          if (idle.length) {
            const names = idle.slice(0, 5).map((item) => item.device.name);
            const remainder = idle.length - names.length;
            void publishClientNotification({
              userId: user.id,
              type: 'ghost',
              title: 'Idle devices today',
              body: `${idle.length} device${idle.length === 1 ? '' : 's'} used no energy today: ${names.join(', ')}${remainder > 0 ? ` and ${remainder} more` : ''}.`,
              url: '/analytics',
              dedupeKey: `ghost:${dateKey}`,
              data: {
                date: dateKey,
                device_ids: idle.map((item) => item.device.id),
              },
            });
          }
        }
      } catch {
        // The server cron still owns notifications while the app is closed.
      } finally {
        running = false;
      }
    };

    const startTimer = setTimeout(run, 10000);
    // The server cron is authoritative for closed-app notifications. This
    // client pass only covers an open/offline app, so a slower refresh avoids
    // repeatedly reading settings, devices, and the full activity log.
    const interval = setInterval(run, 10 * 60 * 1000);
    const handleOnline = () => void run();
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      active = false;
      clearTimeout(startTimer);
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [user?.id]);

  return null;
}
