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

// `trigger_at` is stored as a UTC instant and the device/client also use a
// bounded catch-up window. Five minutes tolerates delayed cron invocations
// without resurrecting alarms that expired hours or days ago.
const ALARM_LOOKBACK_MS = 5 * 60 * 1000;
// The external per-minute trigger normally lands on time. Five minutes keeps
// schedules reliable when a trigger is skipped or delayed; schedule_runs makes
// repeated catch-up passes idempotent.
const SCHEDULE_LOOKBACK_MS = 5 * 60 * 1000;
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

async function runAlarms(admin, getSettings, now, stats) {
  // Only alarms inside the catch-up window are loaded. Older unfired alarms are
  // intentionally left untouched so the UI can keep showing them as expired
  // instead of firing them hours or days late.
  const { data: alarms, error } = await admin
    .from('alarms')
    .select('id, user_id, trigger_at, action, device_id, devices(name)')
    .eq('fired', false)
    .gte('trigger_at', new Date(now.getTime() - ALARM_LOOKBACK_MS).toISOString())
    .lte('trigger_at', now.toISOString());

  if (error) {
    stats.errors.push(`alarms: ${error.message}`);
    return;
  }

  for (const alarm of alarms || []) {
    try {
      // Claim atomically so this cron, the browser executor, and the ESP32
      // never act on the same alarm. Only the winner gets a row back.
      const { data: claimedRows, error: claimError } = await admin
        .from('alarms')
        .update({ fired: true })
        .eq('id', alarm.id)
        .eq('user_id', alarm.user_id)
        .eq('fired', false)
        .select('id');

      if (claimError) {
        stats.errors.push(`alarm ${alarm.id} claim: ${claimError.message}`);
        continue;
      }
      if (!claimedRows?.length) continue;

      // Execute the relay change in the cloud so the ESP32 reconciles it on
      // its next poll even when no browser is open.
      const { data: updated, error: updateError } = await admin
        .from('devices')
        .update({ is_on: Boolean(alarm.action), last_changed: now.toISOString() })
        .eq('id', alarm.device_id)
        .eq('user_id', alarm.user_id)
        .select('id');

      if (updateError || !updated?.length) {
        // Release the claim so another executor can retry this alarm.
        await admin
          .from('alarms')
          .update({ fired: false })
          .eq('id', alarm.id)
          .eq('user_id', alarm.user_id);
        stats.errors.push(
          `alarm ${alarm.id} device update: ${updateError?.message || 'device not found'}`,
        );
        continue;
      }

      const deviceName = alarm.devices?.name || 'Device';
      const { error: logError } = await admin.from('activity_logs').insert({
        user_id: alarm.user_id,
        device_id: alarm.device_id,
        device_name: deviceName,
        action: `turned ${alarm.action ? 'ON' : 'OFF'}`,
        triggered_by: 'Alarm (server)',
      });
      if (logError) {
        stats.errors.push(`alarm ${alarm.id} activity log: ${logError.message}`);
      }

      stats.alarmRuns += 1;

      // Notifications are optional; execution above must happen regardless.
      const settings = getSettings(alarm.user_id);
      if (!settings.notifications_enabled || !settings.notify_alarm) continue;
      const result = await dispatchNotification(admin, {
        userId: alarm.user_id,
        type: 'alarm',
        title: 'Alarm fired',
        body: `${deviceName} turned ${alarm.action ? 'ON' : 'OFF'}.`,
        url: '/alarms',
        dedupeKey: `alarm:${alarm.id}`,
        data: { alarm_id: alarm.id, device_id: alarm.device_id },
      });
      if (result) stats.alarms += 1;
    } catch (caught) {
      stats.errors.push(`alarm ${alarm.id}: ${caught.message}`);
    }
  }
}

async function claimScheduleRun(admin, schedule, occurrence) {
  const { data: claimed, error } = await admin
    .from('schedule_runs')
    .upsert(
      {
        user_id: schedule.user_id,
        schedule_id: schedule.id,
        occurrence_at: occurrence.toISOString(),
        source: 'server',
      },
      { onConflict: 'schedule_id,occurrence_at', ignoreDuplicates: true },
    )
    .select('id');

  if (error) throw new Error(error.message);
  return claimed?.[0] || null;
}

async function executeSchedule(admin, schedule, claim, stats) {
  const now = new Date();
  const { data: updated, error } = await admin
    .from('devices')
    .update({ is_on: Boolean(schedule.action), last_changed: now.toISOString() })
    .eq('id', schedule.device_id)
    .eq('user_id', schedule.user_id)
    .select('id');

  if (error || !updated?.length) {
    await admin.from('schedule_runs').delete().eq('id', claim.id);
    if (error) throw new Error(error.message);
    return false;
  }

  const deviceName = schedule.devices?.name || 'Device';
  const { error: logError } = await admin.from('activity_logs').insert({
    user_id: schedule.user_id,
    device_id: schedule.device_id,
    device_name: deviceName,
    action: `turned ${schedule.action ? 'ON' : 'OFF'}`,
    triggered_by: 'Schedule (server)',
  });
  if (logError) {
    stats.errors.push(`schedule ${schedule.id} activity log: ${logError.message}`);
  }

  await admin
    .from('schedule_runs')
    .update({ executed_at: now.toISOString() })
    .eq('id', claim.id);

  // A one-time schedule must not fire again after its date has passed.
  if (schedule.run_date) {
    await admin
      .from('schedules')
      .update({ enabled: false })
      .eq('id', schedule.id)
      .eq('user_id', schedule.user_id);
  }
  return true;
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

      // Offset by one second so occurrences exactly at the lookback boundary
      // are still returned by the strictly-greater comparison.
      const executionFrom = new Date(now.getTime() - SCHEDULE_LOOKBACK_MS - 1000);
      const executionOccurrence = getNextScheduleOccurrence(schedule, executionFrom, timeZone);
      if (
        executionOccurrence &&
        executionOccurrence.getTime() <= now.getTime() &&
        now.getTime() - executionOccurrence.getTime() <= SCHEDULE_LOOKBACK_MS
      ) {
        const claim = await claimScheduleRun(admin, schedule, executionOccurrence);
        if (claim) {
          const executed = await executeSchedule(admin, schedule, claim, stats);
          if (executed) stats.scheduleRuns += 1;
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
    .select('board_id, user_id, last_direct_seen_at, last_mesh_seen_at, last_seen_at, revoked_at, boards(name, board_identifier)')
    .is('revoked_at', null);

  if (error) {
    stats.errors.push(`device offline checks: ${error.message}`);
    return;
  }

  for (const config of configs || []) {
    // A mesh gateway can keep a board reachable even when the board is not
    // making a direct cloud check-in, so use whichever authenticated signal is
    // newest before deciding that the board is unavailable.
    const lastSeenAt = [
      config.last_direct_seen_at,
      config.last_mesh_seen_at,
      config.last_seen_at,
    ]
      .filter(Boolean)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
    if (!lastSeenAt || !isDeviceOffline(lastSeenAt, now, DEVICE_OFFLINE_AFTER_MS)) continue;

    const settings = getSettings(config.user_id);
    if (!settings.notifications_enabled || !settings.notify_device_offline) continue;

    const board = Array.isArray(config.boards) ? config.boards[0] : config.boards;
    const boardName = board?.name || board?.board_identifier || 'ESP32 board';
    try {
      const result = await dispatchNotification(admin, {
        userId: config.user_id,
        type: 'device_offline',
        title: `${boardName} is offline`,
        body: `${boardName} has not checked in for ${formatOfflineDuration(lastSeenAt, now)}. It may have lost power or its network connection.`,
        url: '/boards',
        // lastSeenAt remains fixed during one outage, so this is sent once per
        // outage and a later outage gets a new key after the next heartbeat.
        dedupeKey: `device-offline:${config.board_id}:${lastSeenAt}`,
        data: {
          board_id: config.board_id,
          board_identifier: board?.board_identifier || null,
          last_seen_at: lastSeenAt,
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
    alarmRuns: 0,
    scheduleNotifications: 0,
    scheduleRuns: 0,
    energy: 0,
    ghost: 0,
    deviceOffline: 0,
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

  await runAlarms(admin, getSettings, now, stats);
  await runSchedules(admin, getSettings, now, stats);
  await runDailyChecks(admin, getSettings, devices || [], now, stats);
  await runDeviceOfflineChecks(admin, getSettings, now, stats);

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    ...stats,
  });
}
