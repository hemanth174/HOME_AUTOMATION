import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  DEVICE_OFFLINE_AFTER_MS,
  dispatchNotification,
  formatKwh,
  formatMoney,
  getDeviceKwhToday,
  getLocalDayBounds,
  getNextScheduleOccurrence,
  isDeviceOffline,
  normalizeNotificationSettings,
} from '@/lib/serverNotifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// This cron sends notifications only. The local MQTT backend owns timed relay
// execution and the devices table remains the source for cloud fallback.
const ENERGY_INTERVAL_MINUTES = 5;

function formatOfflineDuration(lastSeenAt, now) {
  const ageMs = Math.max(0, now.getTime() - new Date(lastSeenAt).getTime());
  const minutes = Math.max(1, Math.floor(ageMs / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function formatScheduleTime(time) {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function groupByUser(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row?.user_id) continue;
    const current = groups.get(row.user_id) || [];
    current.push(row);
    groups.set(row.user_id, current);
  }
  return groups;
}

async function notifyFiredAlarms(admin, getSettings, now, stats) {
  const { data: alarms, error } = await admin.from('alarms')
    .select('id,user_id,device_id,action,trigger_at,devices(name)')
    .eq('fired', true)
    .gte('trigger_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString())
    .lte('trigger_at', now.toISOString());
  if (error) {
    stats.errors.push(`alarm notifications: ${error.message}`);
    return;
  }
  for (const alarm of alarms || []) {
    const settings = getSettings(alarm.user_id);
    if (!settings.notifications_enabled || !settings.notify_alarm) continue;
    try {
      const result = await dispatchNotification(admin, {
        userId: alarm.user_id,
        type: 'alarm',
        title: 'Alarm fired',
        body: `${alarm.devices?.name || 'Device'} turned ${alarm.action ? 'ON' : 'OFF'}.`,
        url: '/alarms',
        dedupeKey: `alarm:${alarm.id}`,
        data: { alarm_id: alarm.id, device_id: alarm.device_id },
      });
      if (result) stats.alarms += 1;
    } catch (caught) {
      stats.errors.push(`alarm notification ${alarm.id}: ${caught.message}`);
    }
  }
}

async function runSchedules(admin, getSettings, now, stats) {
  const { data: schedules, error } = await admin
    .from('schedules')
    .select('id, user_id, time, days, action, device_id, enabled, run_date, devices(name)')
    .eq('enabled', true);

  if (error) {
    stats.errors.push(`schedules: ${error.message}`);
    return;
  }

  for (const schedule of schedules || []) {
    try {
      const settings = getSettings(schedule.user_id);
      const timeZone = settings.timezone;

      const alertFrom = new Date(now.getTime() - 30 * 1000);
      const alertOccurrence = getNextScheduleOccurrence(schedule, alertFrom, timeZone);
      if (alertOccurrence) {
        const delta = alertOccurrence.getTime() - now.getTime();
        if (
          settings.notifications_enabled &&
          settings.notify_schedule &&
          delta >= -30 * 1000 &&
          delta <= settings.schedule_lead_minutes * 60 * 1000
        ) {
          const deviceName = schedule.devices?.name || 'Device';
          const action = schedule.action ? 'ON' : 'OFF';
          const when = formatScheduleTime(schedule.time);
          const result = await dispatchNotification(admin, {
            userId: schedule.user_id,
            type: 'schedule',
            title: 'Upcoming schedule',
            body: `${deviceName} will turn ${action} at ${when}.`,
            url: '/schedules',
            dedupeKey: `schedule-before:${schedule.id}:${alertOccurrence.toISOString()}`,
            data: {
              schedule_id: schedule.id,
              device_id: schedule.device_id,
              occurrence_at: alertOccurrence.toISOString(),
            },
          });
          if (result) stats.scheduleNotifications += 1;
        }
      }

    } catch (error) {
      stats.errors.push(`schedule ${schedule.id}: ${error.message}`);
    }
  }
}

async function runDailyChecks(admin, getSettings, devices, now, stats) {
  if (!devices?.length) return;

  const energyDue =
    Math.floor(now.getTime() / 60000) % ENERGY_INTERVAL_MINUTES === 0;
  const devicesByUser = groupByUser(devices);

  for (const [userId, userDevices] of devicesByUser.entries()) {
    try {
      const settings = getSettings(userId);
      if (!settings.notifications_enabled) continue;

      const bounds = getLocalDayBounds(now, settings.timezone);
      const ghostDue =
        settings.notify_ghost && bounds.localHour === settings.ghost_summary_hour;
      const energyDueForUser = settings.notify_energy && energyDue;
      if (!ghostDue && !energyDueForUser) continue;

      const deviceIds = userDevices.map((device) => device.id);
      const { data: logs, error: logError } = await admin
        .from('activity_logs')
        .select('device_id, action, created_at')
        .in('device_id', deviceIds)
        .gte('created_at', bounds.start.toISOString())
        .lte('created_at', now.toISOString())
        .order('created_at', { ascending: true });

      if (logError) {
        stats.errors.push(`activity logs ${userId}: ${logError.message}`);
        continue;
      }

      const statsByDevice = new Map();
      for (const device of userDevices) {
        statsByDevice.set(
          device.id,
          getDeviceKwhToday(device, logs || [], bounds.start, bounds.end),
        );
      }

      if (energyDueForUser) {
        for (const device of userDevices) {
          const usage = statsByDevice.get(device.id);
          if (usage.kwh < settings.energy_device_kwh_threshold) continue;
          const cost = usage.kwh * settings.tariff_per_kwh;
          const result = await dispatchNotification(admin, {
            userId,
            type: 'energy',
            title: 'High energy usage',
            body: `${device.name} used ${formatKwh(usage.kwh)} kWh today (limit ${formatKwh(settings.energy_device_kwh_threshold)} kWh, about ${formatMoney(cost, settings.currency)}).`,
            url: '/analytics',
            dedupeKey: `energy:${device.id}:${bounds.dateKey}`,
            data: {
              device_id: device.id,
              kwh: Number(usage.kwh.toFixed(3)),
              threshold: settings.energy_device_kwh_threshold,
              date: bounds.dateKey,
            },
          });
          if (result) stats.energy += 1;
        }
      }

      if (ghostDue) {
        const idleDevices = userDevices.filter((device) => {
          const usage = statsByDevice.get(device.id);
          return usage && usage.runHours <= 0 && usage.kwh <= 0;
        });
        if (idleDevices.length) {
          const names = idleDevices.slice(0, 5).map((device) => device.name);
          const remainder = idleDevices.length - names.length;
          const result = await dispatchNotification(admin, {
            userId,
            type: 'ghost',
            title: 'Idle devices today',
            body: `${idleDevices.length} device${idleDevices.length === 1 ? '' : 's'} used no energy today: ${names.join(', ')}${remainder > 0 ? ` and ${remainder} more` : ''}.`,
            url: '/analytics',
            dedupeKey: `ghost:${bounds.dateKey}`,
            data: {
              date: bounds.dateKey,
              device_ids: idleDevices.map((device) => device.id),
            },
          });
          if (result) stats.ghost += 1;
        }
      }
    } catch (error) {
      stats.errors.push(`daily checks ${userId}: ${error.message}`);
    }
  }
}

async function runDeviceOfflineChecks(admin, getSettings, now, stats) {
  const { data: configs, error } = await admin
    .from('device_runtime_configs')
    .select('board_id, user_id, last_direct_seen_at, last_mesh_seen_at, last_seen_at, revoked_at, boards(name, board_identifier, last_seen)')
    .is('revoked_at', null);

  if (error) {
    stats.errors.push(`device offline checks: ${error.message}`);
    return;
  }

  for (const config of configs || []) {
    const board = Array.isArray(config.boards) ? config.boards[0] : config.boards;
    // The WSS gateway refreshes boards.last_seen; direct and mesh check-ins
    // update the runtime timestamps. Use the freshest signal for this board.
    const lastSeenAt = [
      board?.last_seen,
      config.last_direct_seen_at,
      config.last_mesh_seen_at,
      config.last_seen_at,
    ]
      .filter(Boolean)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
    if (!lastSeenAt) continue;

    const settings = getSettings(config.user_id);
    if (!settings.notifications_enabled || !settings.notify_device_offline) continue;

    const boardName = board?.name || board?.board_identifier || 'ESP32 board';
    // A timestamp can briefly advance during a failing connection. Track the
    // last alert state so one outage does not create a new alert on every gap.
    const { data: recentAlerts, error: historyError } = await admin
      .from('user_notifications')
      .select('id, type, created_at')
      .eq('user_id', config.user_id)
      .in('type', ['device_offline', 'device_online'])
      .contains('data', { board_id: config.board_id })
      .order('created_at', { ascending: false })
      .limit(1);
    if (historyError) {
      stats.errors.push(`device alert history ${config.board_id}: ${historyError.message}`);
      continue;
    }
    const lastAlert = recentAlerts?.[0];
    if (!isDeviceOffline(lastSeenAt, now, DEVICE_OFFLINE_AFTER_MS)) {
      const seenAgeMs = now.getTime() - new Date(lastSeenAt).getTime();
      if (seenAgeMs < 0 || seenAgeMs > 60_000) continue;
      if (lastAlert?.type !== 'device_offline' ||
          new Date(lastSeenAt).getTime() <= new Date(lastAlert.created_at).getTime()) continue;

      try {
        const result = await dispatchNotification(admin, {
          userId: config.user_id,
          type: 'device_online',
          title: `${boardName} is back online`,
          body: `${boardName} has reconnected and is responding again.`,
          url: '/boards',
          dedupeKey: `device-online:${config.board_id}:${lastAlert.id}`,
          data: {
            board_id: config.board_id,
            board_identifier: board?.board_identifier || null,
            offline_notification_id: lastAlert.id,
            reconnected_at: lastSeenAt,
          },
        });
        if (result) stats.deviceOnline += 1;
      } catch (caught) {
        stats.errors.push(`device recovery ${config.board_id}: ${caught.message}`);
      }
      continue;
    }

    if (lastAlert?.type === 'device_offline') continue;
    // A slow, overlapping cron run may hold a stale presence snapshot after
    // another run has already reported this board back online.
    if (lastAlert?.type === 'device_online' &&
        now.getTime() - new Date(lastAlert.created_at).getTime() < DEVICE_OFFLINE_AFTER_MS) continue;

    const { data: currentConfig, error: currentError } = await admin
      .from('device_runtime_configs')
      .select('last_direct_seen_at, last_mesh_seen_at, last_seen_at, boards(last_seen)')
      .eq('board_id', config.board_id)
      .maybeSingle();
    if (currentError || !currentConfig) {
      stats.errors.push(`device presence recheck ${config.board_id}: ${currentError?.message || 'missing configuration'}`);
      continue;
    }
    const currentBoard = Array.isArray(currentConfig.boards) ? currentConfig.boards[0] : currentConfig.boards;
    const currentLastSeenAt = [
      currentBoard?.last_seen,
      currentConfig.last_direct_seen_at,
      currentConfig.last_mesh_seen_at,
      currentConfig.last_seen_at,
    ].filter(Boolean).sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
    if (!isDeviceOffline(currentLastSeenAt, new Date(), DEVICE_OFFLINE_AFTER_MS)) continue;
    try {
      const result = await dispatchNotification(admin, {
        userId: config.user_id,
        type: 'device_offline',
        title: `${boardName} is offline`,
        body: `${boardName} has not checked in for ${formatOfflineDuration(currentLastSeenAt, new Date())}. It may have lost power or its network connection.`,
        url: '/boards',
        // The latest check-in stays fixed during one outage, so this is sent
        // once per outage and a later outage gets a new key after recovery.
        dedupeKey: `device-offline:${config.board_id}:${currentLastSeenAt}`,
        data: {
          board_id: config.board_id,
          board_identifier: board?.board_identifier || null,
          last_seen_at: currentLastSeenAt,
          detected_at: now.toISOString(),
          offline_after_ms: DEVICE_OFFLINE_AFTER_MS,
        },
      });
      if (result) stats.deviceOffline += 1;
    } catch (caught) {
      stats.errors.push(`device offline ${config.board_id}: ${caught.message}`);
    }
  }
}

export async function GET(request) {
  if (
    process.env.CRON_SECRET &&
    request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: 'Admin service is not configured' },
      { status: 503 },
    );
  }

  const now = new Date();
  const stats = {
    alarms: 0,
    scheduleNotifications: 0,
    energy: 0,
    ghost: 0,
    deviceOffline: 0,
    deviceOnline: 0,
    errors: [],
  };

  const { data: settingsRows, error: settingsError } = await admin
    .from('user_settings')
    .select(
      'user_id, timezone, notifications_enabled, notify_alarm, notify_schedule, notify_device_offline, schedule_lead_minutes, notify_energy, energy_device_kwh_threshold, notify_ghost, ghost_summary_hour, tariff_per_kwh, currency',
    );

  if (settingsError) {
    return NextResponse.json(
      { error: `Could not load notification settings: ${settingsError.message}` },
      { status: 500 },
    );
  }

  const settingsByUser = new Map(
    (settingsRows || []).map((row) => [
      row.user_id,
      normalizeNotificationSettings(row),
    ]),
  );
  const getSettings = (userId) =>
    settingsByUser.get(userId) ||
    normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);

  const { data: devices, error: devicesError } = await admin
    .from('devices')
    .select('id, user_id, name, is_on, last_changed');

  if (devicesError) {
    stats.errors.push(`devices: ${devicesError.message}`);
  }

  await notifyFiredAlarms(admin, getSettings, now, stats);
  await runSchedules(admin, getSettings, now, stats);
  await runDailyChecks(admin, getSettings, devices || [], now, stats);
  await runDeviceOfflineChecks(admin, getSettings, now, stats);

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    ...stats,
  });
}
