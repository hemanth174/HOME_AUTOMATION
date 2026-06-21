'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function AlarmExecutor() {
  // We use refs to hold the latest data so the interval doesn't need to be recreated,
  // which prevents missing ticks or stale closures.
  const dataRef = useRef({ user: null, devices: [], alarms: [], schedules: [] });
  // Keep track of recently run schedules to avoid triggering the same schedule multiple times in a minute
  const recentSchedulesRef = useRef(new Map()); // scheduleId -> timestamp

  useEffect(() => {
    let active = true;

    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      
      const [devRes, alarmRes, schedRes] = await Promise.all([
        supabase.from('devices').select('id, name, is_on').eq('user_id', user.id),
        supabase.from('alarms').select('id, trigger_at, action, fired, device_id').eq('user_id', user.id).eq('fired', false),
        supabase.from('schedules').select('id, time, days, action, device_id, enabled').eq('user_id', user.id).eq('enabled', true)
      ]);

      if (!active) return;

      dataRef.current = {
        user,
        devices: devRes.data || [],
        alarms: alarmRes.data || [],
        schedules: schedRes.data || [],
      };

      // Subscribe to realtime changes so our executor always has live state
      const channels = supabase.channel('executor-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${user.id}` }, (payload) => {
          if (payload.eventType === 'UPDATE') {
            dataRef.current.devices = dataRef.current.devices.map(d => d.id === payload.new.id ? payload.new : d);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alarms', filter: `user_id=eq.${user.id}` }, async () => {
          const res = await supabase.from('alarms').select('id, trigger_at, action, fired, device_id').eq('user_id', user.id).eq('fired', false);
          dataRef.current.alarms = res.data || [];
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `user_id=eq.${user.id}` }, async () => {
          const res = await supabase.from('schedules').select('id, time, days, action, device_id, enabled').eq('user_id', user.id).eq('enabled', true);
          dataRef.current.schedules = res.data || [];
        })
        .subscribe();

      return channels;
    };

    let channelsPromise = initData();

    // The core execution loop
    const interval = setInterval(async () => {
      const { user, devices, alarms, schedules } = dataRef.current;
      if (!user) return;

      const now = new Date();
      const currentDay = now.getDay();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const pad = (n) => String(n).padStart(2, '0');
      const timeString24h = `${pad(currentHour)}:${pad(currentMinute)}`; // e.g. "08:30"

      // 1. Check Schedules
      for (const schedule of schedules) {
        if (!schedule.enabled) continue;
        if (!schedule.days.includes(currentDay)) continue;

        // Schedule time is usually "HH:MM:00" in Postgres, slice first 5 chars
        const schedTime = schedule.time.substring(0, 5); 
        if (schedTime === timeString24h) {
          const lastRun = recentSchedulesRef.current.get(schedule.id);
          // If we haven't run this schedule in the last 60 seconds
          if (!lastRun || (now.getTime() - lastRun > 60000)) {
            recentSchedulesRef.current.set(schedule.id, now.getTime());
            await executeAction(user, devices, schedule.device_id, schedule.action, `Schedule: ${schedTime}`);
          }
        }
      }

      // 2. Check Alarms
      for (const alarm of alarms) {
        if (alarm.fired) continue;
        const triggerTime = new Date(alarm.trigger_at).getTime();
        
        // Allow a slight buffer (e.g. 5 seconds) so it fires exactly on time or slightly after
        if (now.getTime() >= triggerTime) {
          // Optimistically mark as fired locally so we don't trigger it again next loop
          dataRef.current.alarms = dataRef.current.alarms.map(a => a.id === alarm.id ? { ...a, fired: true } : a);
          
          // Mark fired in DB
          await supabase.from('alarms').update({ fired: true }).eq('id', alarm.id);
          
          // Execute state-aware action
          await executeAction(user, devices, alarm.device_id, alarm.action, 'Alarm');
        }
      }

      // Cleanup old entries in recentSchedulesRef (older than 2 minutes)
      for (const [id, timestamp] of recentSchedulesRef.current.entries()) {
        if (now.getTime() - timestamp > 120000) {
          recentSchedulesRef.current.delete(id);
        }
      }

    }, 10000); // Check every 10 seconds

    return () => {
      active = false;
      clearInterval(interval);
      channelsPromise.then(chan => chan && supabase.removeChannel(chan));
    };
  }, []);

  // Executes a hardware action (ON/OFF) checking live feedback
  const executeAction = async (user, devices, deviceId, targetAction, sourceName) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    // STATE-AWARE CHECK: Only execute if the device is not already in the target state
    if (device.is_on === targetAction) {
      // It's already in the correct state, just skip the hardware command but still notify
      window.dispatchEvent(new CustomEvent('show-global-toast', {
        detail: `Skipped ${sourceName}: ${device.name} is already ${targetAction ? 'ON' : 'OFF'}`,
      }));
      return;
    }

    // Update the device state
    const { error } = await supabase
      .from('devices')
      .update({ is_on: targetAction, last_changed: new Date().toISOString() })
      .eq('id', deviceId);

    if (!error) {
      // Log activity
      const { error: logError } = await supabase.from('activity_logs').insert({
        user_id: user.id,
        device_id: device.id,
        device_name: device.name,
        action: `turned ${targetAction ? 'ON' : 'OFF'}`,
        triggered_by: sourceName,
      });
      if (logError) console.warn('Activity log error:', logError);

      // Global Notification
      window.dispatchEvent(new CustomEvent('show-global-toast', {
        detail: `Executed ${sourceName}: ${device.name} turned ${targetAction ? 'ON' : 'OFF'}`,
      }));
    }
  };

  return null; // Headless component
}
