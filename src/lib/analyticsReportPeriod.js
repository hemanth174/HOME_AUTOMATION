import { getTimeZoneParts, zonedTimeToUtc } from '@/lib/serverNotifications';

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function reportPeriodDue(now, timeZone, frequency) {
  const local = getTimeZoneParts(now, timeZone);
  const today = new Date(Date.UTC(local.year, local.month - 1, local.day));
  let start;
  let end;
  if (frequency === 'weekly') {
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    if (daysSinceMonday > 2) return null;
    const thisMonday = new Date(today);
    thisMonday.setUTCDate(thisMonday.getUTCDate() - daysSinceMonday);
    start = new Date(thisMonday);
    start.setUTCDate(start.getUTCDate() - 7);
    end = new Date(thisMonday);
    end.setUTCDate(end.getUTCDate() - 1);
  } else if (frequency === 'monthly') {
    if (local.day > 3) return null;
    start = new Date(Date.UTC(local.year, local.month - 2, 1));
    end = new Date(Date.UTC(local.year, local.month - 1, 0));
  } else {
    return null;
  }
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    frequency,
    startDate: dateKey(start),
    endDate: dateKey(end),
    startAt: zonedTimeToUtc(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), 0, 0, timeZone).toISOString(),
    endAt: zonedTimeToUtc(endExclusive.getUTCFullYear(), endExclusive.getUTCMonth() + 1, endExclusive.getUTCDate(), 0, 0, timeZone).toISOString(),
  };
}
