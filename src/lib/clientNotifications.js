import { supabase } from '@/lib/supabase';
import {
  notificationShownRecently,
  playNotificationTone,
  showBrowserNotification,
} from '@/lib/browserNotifications';

function showLocal({ title, body, dedupeKey, url }) {
  window.dispatchEvent(
    new CustomEvent('show-global-toast', {
      detail: `${title}: ${body}`,
    }),
  );
  if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    !notificationShownRecently(dedupeKey)
  ) {
    playNotificationTone();
    return showBrowserNotification({
      title,
      body,
      tag: dedupeKey,
      url,
    });
  }
  return Promise.resolve(false);
}

export async function publishClientNotification({
  userId,
  type,
  title,
  body,
  url = '/',
  dedupeKey,
  data = {},
  silentToast = false,
}) {
  if (typeof window === 'undefined' || !userId || !dedupeKey) return null;
  if (notificationShownRecently(dedupeKey)) {
    return { status: 'already-shown' };
  }

  let inserted = null;
  let offline = false;

  try {
    const { data: rows, error } = await supabase
      .from('user_notifications')
      .upsert(
        {
          user_id: userId,
          type,
          title,
          body,
          url,
          dedupe_key: dedupeKey,
          data: {
            ...data,
            clientOriginated: true,
            ...(silentToast ? { silentToast: true } : {}),
          },
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
      )
      .select('id');

    if (error) {
      offline = true;
    } else if (!rows?.length) {
      return { status: 'duplicate' };
    } else {
      inserted = rows[0];
    }
  } catch {
    offline = true;
  }

  if (!silentToast || offline) {
    await showLocal({ title, body, dedupeKey, url });
  } else if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    !notificationShownRecently(dedupeKey)
  ) {
    await showBrowserNotification({ title, body, tag: dedupeKey, url });
  }

  return {
    status: offline ? 'offline-local' : 'inserted',
    notification: inserted,
  };
}
