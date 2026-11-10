export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function normalizeDays(daysArr) {
  if (!Array.isArray(daysArr)) return [];
  return [...new Set(daysArr.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

export function formatTime(timeStr) {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

export function formatDays(daysArr) {
  const days = normalizeDays(daysArr);
  if (days.length === 0) return "No days selected";
  if (days.length === 7) return "Every day";
  if ([1, 2, 3, 4, 5].every((d) => days.includes(d)) && days.length === 5) return "Weekdays (Mon – Fri)";
  if ([0, 6].every((d) => days.includes(d)) && days.length === 2) return "Weekends (Sat & Sun)";
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

export function toDateInputValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function validateScheduleDate(value) {
  const date = parseDateInput(value);
  if (!date) return { valid: false, error: "Please pick a valid date." };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  if (target < today) return { valid: false, error: "Date must be today or later." };
  return { valid: true, error: "", date: target };
}

export function formatScheduleDate(value) {
  const date = parseDateInput(value);
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function weekdayFromDate(value) {
  const date = parseDateInput(value);
  return date ? date.getDay() : null;
}

export function formatNextRun(daysArr, timeStr, runDate = null) {
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  if (runDate) {
    const date = parseDateInput(runDate);
    if (!date) return null;
    date.setHours(h, m, 0, 0);
    if (date <= now) return null;
    return date.toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  }
  const days = normalizeDays(daysArr);
  if (!days.length) return null;
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(h, m, 0, 0);
    if (days.includes(candidate.getDay()) && candidate > now) {
      return candidate.toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
    }
  }
  return null;
}

export function getNextScheduleOccurrenceLocal(schedule, from = new Date()) {
  if (!schedule?.time) return null;
  const [hour, minute] = String(schedule.time).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  if (schedule.run_date) {
    const date = parseDateInput(schedule.run_date);
    if (!date) return null;
    date.setHours(hour, minute, 0, 0);
    return date > from ? date : null;
  }

  if (!Array.isArray(schedule?.days) || !schedule.days.length) return null;
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
