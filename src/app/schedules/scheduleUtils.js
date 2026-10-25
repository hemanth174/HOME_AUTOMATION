export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatTime(timeStr) {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

export function formatDays(daysArr) {
  if (!daysArr || daysArr.length === 0) return "No days selected";
  if (daysArr.length === 7) return "Every day";
  if ([1, 2, 3, 4, 5].every((d) => daysArr.includes(d)) && daysArr.length === 5) return "Weekdays (Mon – Fri)";
  if ([0, 6].every((d) => daysArr.includes(d)) && daysArr.length === 2) return "Weekends (Sat & Sun)";
  return daysArr.map((d) => DAY_NAMES[d]).join(", ");
}

export function formatNextRun(daysArr, timeStr) {
  if (!daysArr?.length) return null;
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(h, m, 0, 0);
    if (daysArr.includes(candidate.getDay()) && candidate > now) {
      return candidate.toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
    }
  }
  return null;
}

export function getNextScheduleOccurrenceLocal(schedule, from = new Date()) {
  if (!Array.isArray(schedule?.days) || !schedule.days.length || !schedule.time) {
    return null;
  }
  const [hour, minute] = String(schedule.time).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const days = new Set(schedule.days.map(Number));
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate > from && days.has(candidate.getDay())) return candidate;
  }
  return null;
}

export function validateTime(h24) {
  if (!h24) return { valid: false, error: "Please select a time." };
  const [hStr, mStr] = h24.split(":");
  const h = parseInt(hStr, 10), m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return { valid: false, error: "Invalid time. Please pick a valid hour and minute." };
  return { valid: true, error: "" };
}

export function groupByBoard(devices) {
  return devices.reduce((groups, device) => {
    const board = device.boards?.name || "Unknown Board";
    (groups[board] ||= []).push(device);
    return groups;
  }, {});
}
