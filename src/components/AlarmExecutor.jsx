'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { setLocalDeviceState } from '@/lib/localApi';
import useLocalConnection from '@/hooks/useLocalConnection';


// Per-origin schedule claims prevent duplicate execution when the dashboard is open
// in multiple tabs. Web Locks serialize the claim where supported.
const localScheduleClaims = new Map();

async function claimScheduleOccurrence(key, occurrence) {
  const claim = () => {
    if (localScheduleClaims.get(key) === occurrence) return false;
    try {
      if (localStorage.getItem(key) === occurrence) {
        localScheduleClaims.set(key, occurrence);
        return false;
      }
      localStorage.setItem(key, occurrence);
    } catch {
      // Keep an in-memory fallback if browser storage is unavailable.
    }
    localScheduleClaims.set(key, occurrence);
    return true;
  };

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(`claim:${key}`, { mode: 'exclusive' }, claim);
  }
  return claim();
}

function releaseScheduleOccurrence(key, occurrence) {
  if (localScheduleClaims.get(key) === occurrence) localScheduleClaims.delete(key);
  try {
    if (localStorage.getItem(key) === occurrence) localStorage.removeItem(key);
  } catch {
    // The next in-memory pass can retry if storage is unavailable.
  }
}

function scheduleOccurrenceKey(now, time) {
  const pad = (number) => String(number).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${date}T${time}`;
}

export default function AlarmExecutor() {
  const { isLocalConnected } = useLocalConnection();
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
        supabase.from('devices').select('id, name, relay_index, board_id, is_on, boards(board_identifier)').eq('user_id', user.id),
        supabase.from('alarms').select('id, trigger_at, action, fired, device_id').eq('user_id', user.id).eq('fired', false),
        supabase.from('schedules').select('id, time, days, action, device_id, enabled').eq('user_id', user.id).eq('enabled', true)
      ]);

      if (!active) return;

      const deviceRows = devRes.data || [];
      const boardIdentifierById = Object.fromEntries(
        deviceRows
          .filter((device) => device.board_id && device.boards?.board_identifier)
          .map((device) => [device.board_id, device.boards.board_identifier]),
      );

      dataRef.current = {
        user,
        devices: deviceRows.map((device) => ({
          ...device,
          // node_id lives on boards.board_identifier, not on devices.
          node_id: device.boards?.board_identifier || null,
        })),
        alarms: alarmRes.data || [],
        schedules: schedRes.data || [],
      };

      // Subscribe to realtime changes so our executor always has live state
      const channels = supabase.channel('executor-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${user.id}` }, (payload) => {
          if (payload.eventType === 'UPDATE') {
            dataRef.current.devices = dataRef.current.devices.map((device) =>
              device.id === payload.new.id
                ? {
                    ...device,
                    ...payload.new,
                    // Realtime row payloads don't include joined board fields.
                    node_id: boardIdentifierById[payload.new.board_id] || device.node_id || null,
                  }
                : device,
            );
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

    // Serialize ticks so a slow Supabase response cannot overlap another
    // schedule/alarm pass and trigger duplicate actions in the same tab.
    let tickInFlight = false;
    const interval = setInterval(async () => {
      if (tickInFlight) return;
      tickInFlight = true;
      try {
        const { user, devices, alarms, schedules } = dataRef.current;
        if (!user) return;

        const now = new Date();
        const currentDay = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const pad = (number) => String(number).padStart(2, '0');
        const timeString24h = `${pad(currentHour)}:${pad(currentMinute)}`;

        // 1. Check recurring schedules. Store a per-day slot claim so opening
        // the same dashboard in another tab does not run that occurrence twice.
        for (const schedule of schedules) {
          if (!schedule.enabled || !Array.isArray(schedule.days) ||
              !schedule.days.includes(currentDay) || !schedule.time) continue;

          const schedTime = String(schedule.time).slice(0, 5);
          if (schedTime !== timeString24h) continue;

          const lastRun = recentSchedulesRef.current.get(schedule.id);
          if (lastRun && now.getTime() - lastRun <= 60000) continue;

          const occurrence = scheduleOccurrenceKey(now, schedTime);
          const claimKey = `vika:schedule:${user.id}:${schedule.id}`;
          const claimed = await claimScheduleOccurrence(claimKey, occurrence);
          if (!claimed) continue;

          recentSchedulesRef.current.set(schedule.id, now.getTime());
          const executed = await executeAction(
            user, devices, schedule.device_id, schedule.action, `Schedule: ${schedTime}`,
          );
          if (!executed) {
            recentSchedulesRef.current.delete(schedule.id);
            releaseScheduleOccurrence(claimKey, occurrence);
          }
        }

        // 2. Claim due alarms atomically. Only the client that changes fired
        // from false to true receives a row and is allowed to execute it.
        for (const alarm of alarms) {
          if (alarm.fired) continue;
          const triggerTime = new Date(alarm.trigger_at).getTime();
          if (!Number.isFinite(triggerTime) || now.getTime() < triggerTime) continue;

          const { data: claimedRows, error: claimError } = await supabase
            .from('alarms')
            .update({ fired: true })
            .eq('id', alarm.id)
            .eq('user_id', user.id)
            .eq('fired', false)
            .select('id');

          if (claimError) {
            console.warn('Could not claim due alarm:', claimError);
            continue;
          }
          if (!claimedRows?.length) continue;

          dataRef.current.alarms = dataRef.current.alarms.filter((item) => item.id !== alarm.id);
          const executed = await executeAction(user, devices, alarm.device_id, alarm.action, 'Alarm');
          if (!executed) {
            // Permit retry if neither local dispatch nor cloud persistence worked.
            const { error: resetError } = await supabase
              .from('alarms')
              .update({ fired: false })
              .eq('id', alarm.id)
              .eq('user_id', user.id)
              .eq('fired', true);
            if (!resetError) {
              dataRef.current.alarms = [
                ...dataRef.current.alarms,
                { ...alarm, fired: false },
              ];
            } else {
              console.warn('Failed to reset an alarm after unsuccessful execution:', resetError);
            }
          }
        }

        // Avoid retaining obsolete in-memory guards.
        for (const [id, timestamp] of recentSchedulesRef.current.entries()) {
          if (now.getTime() - timestamp > 120000) recentSchedulesRef.current.delete(id);
        }
      } catch (error) {
        console.warn('Alarm/schedule executor pass failed:', error);
      } finally {
        tickInFlight = false;
      }
    }, 10000); // Check every 10 seconds
    return () => {
      active = false;
      clearInterval(interval);
      channelsPromise.then(chan => chan && supabase.removeChannel(chan));
    };
  }, [isLocalConnected]);

  // Executes a hardware action (ON/OFF) checking live feedback
  const executeAction = async (user, devices, deviceId, targetAction, sourceName) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return false;

    // STATE-AWARE CHECK: Only execute if the device is not already in the target state
    if (device.is_on === targetAction) {
      // It's already in the correct state, just skip the hardware command but still notify
      window.dispatchEvent(new CustomEvent('show-global-toast', {
        detail: `Skipped ${sourceName}: ${device.name} is already ${targetAction ? 'ON' : 'OFF'}`,
      }));
      return true;
    }

    // Update the local relay first when the ESP32 mesh is available. Cloud
    // persistence still follows so both planes converge.
    let localDispatched = false;
    if (isLocalConnected) {
      try {
        await setLocalDeviceState(device.relay_index, targetAction, device.node_id);
        localDispatched = true;
      } catch (error) {
        console.warn('Local automation command failed; continuing with cloud sync:', error);
      }
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
    }

    if (!error || localDispatched) {
      window.dispatchEvent(new CustomEvent('show-global-toast', {
        detail: `Executed ${sourceName}: ${device.name} turned ${targetAction ? 'ON' : 'OFF'}`,
      }));
      return true;
    }
    return false;
  };

  return null; // Headless component
}
