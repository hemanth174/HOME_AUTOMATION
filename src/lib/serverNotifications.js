import { getDeviceWattage } from '@/app/analytics/helpers';
import { sendPushToUser } from '@/lib/pushServer';

export const DEFAULT_NOTIFICATION_SETTINGS = {
  timezone: 'Asia/Kolkata',
  notifications_enabled: true,
  notify_alarm: true,
  notify_schedule: true,
  schedule_lead_minutes: 5,
  notify_energy: true,
  energy_device_kwh_threshold: 3,
  notify_ghost: true,
  ghost_summary_hour: 20,
  tariff_per_kwh: 8,
  currency: 'INR',
};

export function normalizeNotificationSettings(row) {
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...(row || {}) };
  return {
    ...settings,
    timezone: settings.timezone || DEFAULT_NOTIFICATION_SETTINGS.timezone,
    schedule_lead_minutes: Math.min(
      60,
      Math.max(0, Number(settings.schedule_lead_minutes) || 0),
    ),
    energy_device_kwh_threshold: Math.max(
      0.001,
      Number(settings.energy_device_kwh_threshold) || 3,
    ),
    ghost_summary_hour: Math.min(
      23,
      Math.max(0, Number(settings.ghost_summary_hour) || 0),
    ),
  };
}

export function getTimeZoneParts(date, timeZone = 'Asia/Kolkata') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  let timestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = getTimeZoneOffsetMs(new Date(timestamp), timeZone);
    const next = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset;
    if (next === timestamp) break;
    timestamp = next;
  }
  return new Date(timestamp);
}

function addLocalDays(year, month, day, delta) {
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

export function getLocalDateKey(date, timeZone = 'Asia/Kolkata') {
  const parts = getTimeZoneParts(date, timeZone);
  const pad = (value) => String(value).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function getLocalDayBounds(now, timeZone = 'Asia/Kolkata') {
  const parts = getTimeZoneParts(now, timeZone);
  const start = zonedTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    0,
    0,
    timeZone,
  );
  const next = addLocalDays(parts.year, parts.month, parts.day, 1);
  const end = zonedTimeToUtc(next.year, next.month, next.day, 0, 0, timeZone);
  return {
    start,
    end,
    dateKey: getLocalDateKey(now, timeZone),
    localHour: parts.hour,
  };
}

function parseScheduleTime(time) {
  const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function getNextScheduleOccurrence(schedule, from, timeZone = 'Asia/Kolkata') {
  const time = parseScheduleTime(schedule?.time);
  const days = Array.isArray(schedule?.days)
    ? new Set(schedule.days.map((day) => Number(day)))
    : null;
  if (!time || !days?.size) return null;

  const localNow = getTimeZoneParts(from, timeZone);
  for (let offset = 0; offset <= 8; offset += 1) {
    const localDate = addLocalDays(
      localNow.year,
      localNow.month,
      localNow.day,
      offset,
    );
    const weekday = new Date(
      Date.UTC(localDate.year, localDate.month - 1, localDate.day),
    ).getUTCDay();
    if (!days.has(weekday)) continue;

    const candidate = zonedTimeToUtc(
      localDate.year,
      localDate.month,
      localDate.day,
      time.hour,
      time.minute,
      timeZone,
    );
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  return null;
}

function isOnAction(action) {
  return /on|activate/i.test(String(action || ''));
}

export function getDeviceRunHours(device, deviceLogs, startMs, endMs) {
  const windowEnd = Math.min(Date.now(), endMs.getTime());
  if (windowEnd <= startMs) return 0;

  const logs = (deviceLogs || [])
    .filter((log) => log.device_id === device.id)
    .map((log) => ({ ...log, time: new Date(log.created_at).getTime() }))
    .filter((log) => Number.isFinite(log.time) && log.time <= windowEnd)
    .sort((left, right) => left.time - right.time);

  if (logs.length === 0) {
    if (!device.is_on) return 0;
    const lastChanged = device.last_changed
      ? new Date(device.last_changed).getTime()
      : startMs;
    const activeStart = Math.max(
      Number.isFinite(lastChanged) ? lastChanged : startMs,
      startMs,
    );
    return Math.max(0, (windowEnd - activeStart) / (1000 * 60 * 60));
  }

  let totalMs = 0;
  let currentlyOn = false;
  let lastOnTime = null;

  if (logs[0]?.time >= startMs && !isOnAction(logs[0]?.action)) {
    currentlyOn = true;
    lastOnTime = startMs;
  }

  for (const log of logs) {
    if (log.time < startMs) continue;
    if (isOnAction(log.action)) {
      if (!currentlyOn) {
        currentlyOn = true;
        lastOnTime = log.time;
      }
    } else if (currentlyOn) {
      currentlyOn = false;
      if (lastOnTime !== null) {
        totalMs += Math.max(0, log.time - lastOnTime);
      }
      lastOnTime = null;
    }
  }

  if (currentlyOn && lastOnTime !== null) {
    totalMs += Math.max(0, windowEnd - lastOnTime);
  }

  return totalMs / (1000 * 60 * 60);
}

export function getDeviceKwhToday(device, deviceLogs, dayStart, dayEnd) {
  const runHours = getDeviceRunHours(device, deviceLogs, dayStart, dayEnd);
  const kwh = (getDeviceWattage(device.name || '') * runHours) / 1000;
  return { runHours, kwh };
}

export function formatKwh(value) {
  return Number(value || 0).toFixed(2);
}

export function formatMoney(value, currency = 'INR') {
  const symbols = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  const symbol = symbols[currency] || '';
  return `${symbol}${Number(value || 0).toFixed(2)}`;
}

export async function dispatchNotification(admin, payload) {
  const {
    userId,
    type,
    title,
    body,
    url = '/',
    dedupeKey,
    data = {},
  } = payload;

  if (!admin || !userId || !type || !title || !body || !dedupeKey) {
    return null;
  }

  const { data: insertedRows, error } = await admin
    .from('user_notifications')
    .upsert(
      {
        user_id: userId,
        type,
        title,
        body,
        url,
        dedupe_key: dedupeKey,
        data,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    )
    .select('id, created_at');

  if (error) throw new Error(`Could not persist notification: ${error.message}`);
  const notification = insertedRows?.[0];
  if (!notification) return null;

  const push = await sendPushToUser(admin, userId, {
    title,
    body,
    url,
    tag: dedupeKey,
    type,
    data,
  });

  return { notification, push };
}
