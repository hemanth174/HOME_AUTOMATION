// Device-agent heartbeats arrive every 15 seconds; the legacy path sends one
// every 60 seconds. Keep enough margin for a delayed heartbeat without leaving
// the dashboard online for several minutes after the board stops responding.
export const BOARD_ONLINE_GRACE_MS = 75_000;

export function isBoardOnline(value, now = Date.now()) {
  const lastSeen = value && typeof value === 'object' ? value.last_seen : value;
  if (!lastSeen) return false;

  const lastSeenMs = new Date(lastSeen).getTime();
  const ageMs = now - lastSeenMs;
  return Number.isFinite(lastSeenMs) && ageMs >= -10_000 && ageMs < BOARD_ONLINE_GRACE_MS;
}

export const BOARD_ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isBoardRecentlyOnline(board, now = Date.now(), windowMs = BOARD_ONLINE_WINDOW_MS) {
  if (!board?.id || !board.last_seen || board.deleted_at) return false;
  const lastSeen = new Date(board.last_seen).getTime();
  const current = now instanceof Date ? now.getTime() : Number(now);
  const age = current - lastSeen;
  return Number.isFinite(age) && age >= 0 && age < windowMs;
}
