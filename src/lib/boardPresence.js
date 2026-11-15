// The ESP32 updates boards.last_seen once per minute. Keep one missed or
// delayed HTTPS heartbeat from making the dashboard flash the board offline.
export const BOARD_ONLINE_GRACE_MS = 150_000;

export function isBoardOnline(value, now = Date.now()) {
  const lastSeen = value && typeof value === 'object' ? value.last_seen : value;
  if (!lastSeen) return false;

  const lastSeenMs = new Date(lastSeen).getTime();
  return Number.isFinite(lastSeenMs) && now - lastSeenMs < BOARD_ONLINE_GRACE_MS;
}
