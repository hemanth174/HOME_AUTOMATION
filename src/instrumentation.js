const CRON_KEY = Symbol.for('vikatech.localNotificationCron');

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const localCronEnabled =
    process.env.NODE_ENV === 'development' ||
    process.env.ENABLE_LOCAL_NOTIFICATION_CRON === 'true';
  if (!localCronEnabled || globalThis[CRON_KEY]) return;
  globalThis[CRON_KEY] = true;

  const baseUrl =
    process.env.NOTIFICATION_CRON_BASE_URL ||
    `http://127.0.0.1:${process.env.PORT || 3000}`;
  const secret = process.env.CRON_SECRET;

  const run = async () => {
    try {
      await fetch(`${baseUrl}/api/cron/notifications`, {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
        cache: 'no-store',
      });
    } catch {
      // The dev server may still be booting; the next tick retries.
    }
  };

  const startTimer = setTimeout(() => {
    run();
    const interval = setInterval(run, 60_000);
    interval.unref?.();
  }, 10_000);
  startTimer.unref?.();
}
