import { supabase } from '@/lib/supabase';

let audioContext = null;

const SHOWN_PREFIX = 'vikatech_notification_shown:';
const SHOWN_TTL_MS = 10 * 60 * 1000;

export function isNotificationSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  );
}

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }

  return Notification.permission;
}

export async function registerNotificationServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }
  return output;
}

export async function ensurePushSubscription() {
  if (!isNotificationSupported()) {
    return { ok: false, reason: 'unsupported' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: Notification.permission };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { ok: false, reason: 'vapid-public-key-missing' };
  }

  const registration =
    (await registerNotificationServiceWorker()) ||
    (await navigator.serviceWorker.ready);
  if (!registration?.pushManager) {
    return { ok: false, reason: 'push-unsupported' };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'signed-out' };

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent:
        typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
    { onConflict: 'user_id,endpoint' },
  );

  if (error) return { ok: false, reason: error.message };
  return { ok: true, subscription };
}

export async function unsubscribePushSubscription() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', endpoint);
    }
  } catch {
    // A missing permission or browser API should never block logout.
  }
}

function shownKey(tag) {
  return `${SHOWN_PREFIX}${tag}`;
}

export function markNotificationShown(tag) {
  if (typeof window === 'undefined' || !tag) return;
  try {
    localStorage.setItem(
      shownKey(tag),
      JSON.stringify({ at: Date.now() }),
    );
  } catch {
    // Storage may be unavailable in private mode.
  }
}

export function notificationShownRecently(tag) {
  if (typeof window === 'undefined' || !tag) return false;
  try {
    const raw = localStorage.getItem(shownKey(tag));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (Date.now() - Number(parsed?.at || 0) > SHOWN_TTL_MS) {
      localStorage.removeItem(shownKey(tag));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function showBrowserNotification({
  title,
  body,
  tag,
  url = '/',
  silent = false,
}) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }
  if (tag && notificationShownRecently(tag)) return false;

  const options = {
    body,
    tag,
    data: { url },
    icon: '/icon-192.png',
    badge: '/favicon.png',
    silent,
  };

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration()) ||
      (await navigator.serviceWorker.ready);
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
    if (tag) markNotificationShown(tag);
    return true;
  } catch {
    return false;
  }
}

export function playNotificationTone() {
  if (typeof window === 'undefined' || !window.AudioContext) return;

  try {
    audioContext ||= new window.AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();

    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    gain.connect(audioContext.destination);

    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1175, now + 0.08);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
  } catch {
    // Browser audio policies can reject a tone; the system notification remains available.
  }
}
