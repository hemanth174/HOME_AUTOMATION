export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function buildISO(year, month, day, h12, minute, ampm) {
  const y = parseInt(year, 10), mo = parseInt(month, 10), d = parseInt(day, 10);
  const h = parseInt(h12, 10), m = parseInt(minute, 10);
  if ([y, mo, d, h, m].some(Number.isNaN)) return null;
  let h24 = h % 12;
  if (ampm === "PM") h24 += 12;
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h24)}:${pad(m)}:00`;
}

export function validateParts(year, month, day, h12, minute, ampm) {
  const y = parseInt(year, 10), mo = parseInt(month, 10), d = parseInt(day, 10);
  const h = parseInt(h12, 10), m = parseInt(minute, 10);
  if (!year || !/^\d{4}$/.test(String(year))) return { valid: false, error: "Year must be a 4-digit number (e.g. 2026, 2027)." };
  if (y < new Date().getFullYear() || y > 2099) return { valid: false, error: `Year must be ${new Date().getFullYear()} or later (max 2099).` };
  if (mo < 1 || mo > 12) return { valid: false, error: "Please select a valid month." };
  const maxDay = daysInMonth(y, mo);
  if (d < 1 || d > maxDay) return { valid: false, error: `Day must be between 1 and ${maxDay} for ${MONTH_NAMES[mo - 1]} ${y}.` };
  if (h < 1 || h > 12) return { valid: false, error: "Hour must be between 1 and 12." };
  if (m < 0 || m > 59) return { valid: false, error: "Minute must be between 0 and 59." };
  const iso = buildISO(y, mo, d, h, m, ampm);
  if (!iso) return { valid: false, error: "Could not construct a valid date/time." };
  if (new Date(iso).getTime() <= Date.now() + 60000) return { valid: false, error: "Alarm must be set at least 1 minute in the future." };
  return { valid: true, error: "" };
}

export function formatAlarmDisplay(isoStr) {
  return new Date(isoStr).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export function defaultParts() {
  const now = new Date(Date.now() + 5 * 60000), h = now.getHours();
  return { year: String(now.getFullYear()), month: String(now.getMonth() + 1), day: String(now.getDate()), hour: String(h % 12 || 12), minute: String(now.getMinutes()), ampm: h >= 12 ? "PM" : "AM" };
}

export function groupByBoard(devices) {
  return devices.reduce((groups, device) => {
    const board = device.boards?.name || "Unknown Board";
    (groups[board] ||= []).push(device);
    return groups;
  }, {});
}
