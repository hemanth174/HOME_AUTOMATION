import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  dispatchNotification,
  formatKwh,
  formatMoney,
  getDeviceKwhToday,
  getLocalDayBounds,
  getNextScheduleOccurrence,
  normalizeNotificationSettings,
} from '@/lib/serverNotifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALARM_LOOKBACK_MS = 2 * 60 * 1000;
const SCHEDULE_LOOKBACK_MS = 2 * 60 * 1000;
const ENERGY_INTERVAL_MINUTES = 5;

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
  const { data: alarms, error } = await admin
    .from('alarms')
    .select('id, user_id, trigger_at, action, device_id, devices(name)')
    .gte('trigger_at', new Date(now.getTime() - ALARM_LOOKBACK_MS).toISOString())
    .lte('trigger_at', now.toISOString());

  if (error) {
    stats.errors.push(`alarms: ${error.message}`);
    return;
  }

  for (const alarm of alarms || []) {
    try {
      const settings = getSettings(alarm.user_id);
      if (!settings.notifications_enabled || !settings.notify_alarm) continue;
      const deviceName = alarm.devices?.name || 'Device';
      const action = alarm.action ? 'ON' : 'OFF';
      const result = await dispatchNotification(admin, {
        userId: alarm.user_id,
        type: 'alarm',
        title: 'Alarm fired',
        body: `${deviceName} turned ${action}.`,
        url: '/alarms',
        dedupeKey: `alarm:${alarm.id}`,
        data: { alarm_id: alarm.id, device_id: alarm.device_id },
      });
      if (result) stats.alarms += 1;
    } catch (error) {
      stats.errors.push(`alarm ${alarm.id}: ${error.message}`);
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
  return true;
}

async function runSchedules(admin, getSettings, now, stats) {
  const { data: schedules, error } = await admin
    .from('schedules')
    .select('id, user_id, time, days, action, device_id, enabled, devices(name)')
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

      const executionFrom = new Date(now.getTime() - SCHEDULE_LOOKBACK_MS);
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
    scheduleRuns: 0,
    energy: 0,
    ghost: 0,
    errors: [],
  };

  const { data: settingsRows, error: settingsError } = await admin
    .from('user_settings')
    .select(
      'user_id, timezone, notifications_enabled, notify_alarm, notify_schedule, schedule_lead_minutes, notify_energy, energy_device_kwh_threshold, notify_ghost, ghost_summary_hour, tariff_per_kwh, currency',
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

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    ...stats,
  });
}
