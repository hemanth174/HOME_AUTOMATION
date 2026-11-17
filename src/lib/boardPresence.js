// Device-agent heartbeats arrive every 15 seconds; the legacy path sends one
// every 60 seconds. Keep enough margin for a delayed heartbeat without leaving
// the dashboard online for several minutes after the board stops responding.
export const BOARD_ONLINE_GRACE_MS = 75_000;

export function isBoardOnline(value, now = Date.now()) {
  const lastSeen = value && typeof value === 'object' ? value.last_seen : value;
  if (!lastSeen) return false;

  const lastSeenMs = new Date(lastSeen).getTime();
  return Number.isFinite(lastSeenMs) && now - lastSeenMs < BOARD_ONLINE_GRACE_MS;
}
