import webpush from 'web-push';

let vapidConfigured = false;

function getVapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@vikatech.local';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

function ensureVapid() {
  const keys = getVapidKeys();
  if (!keys) return null;
  if (!vapidConfigured) {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    vapidConfigured = true;
  }
  return webpush;
}

export function isPushConfigured() {
  return Boolean(getVapidKeys());
}

export async function sendPushToUser(admin, userId, payload) {
  const client = ensureVapid();
  if (!client || !admin || !userId) {
    return { sent: 0, failed: 0, skipped: !client ? 'vapid-missing' : 'missing-input' };
  }

  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) return { sent: 0, failed: 0, skipped: error.message };
  if (!subscriptions?.length) return { sent: 0, failed: 0, skipped: 'no-subscriptions' };

  const message = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expiredIds = [];

  for (const subscription of subscriptions) {
    try {
      await client.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        message,
        { TTL: 60 * 60, urgency: payload.type === 'alarm' ? 'high' : 'normal' },
      );
      sent += 1;
      await admin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', subscription.id);
    } catch (error) {
      failed += 1;
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        expiredIds.push(subscription.id);
      }
    }
  }

  if (expiredIds.length) {
    await admin.from('push_subscriptions').delete().in('id', expiredIds);
  }

  return { sent, failed, pruned: expiredIds.length };
}
