'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  playNotificationTone,
  requestBrowserNotificationPermission,
} from '@/lib/browserNotifications';

const LAST_SEEN_KEY = 'vikatech_last_feature_announcement';

async function announceInBrowser(announcement) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent('show-global-toast', {
    detail: `${announcement.title}: ${announcement.message}`,
  }));

  const permission = await requestBrowserNotificationPermission();
  if (permission !== 'granted') return;
  playNotificationTone();

  const show = (registration) => {
    if (registration?.showNotification) {
      registration.showNotification(announcement.title, {
        body: announcement.message,
        tag: `vikatech-feature-${announcement.id}`,
        data: { url: announcement.action_url || '/' },
      });
    } else {
      new Notification(announcement.title, { body: announcement.message });
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(show).catch(() => show(null));
  } else {
    show(null);
  }
}

export default function FeatureAnnouncementNotifier() {
  const lastHandled = useRef(null);

  useEffect(() => {
    let active = true;
    let started = false;
    let channel = null;

    const handle = (announcement) => {
      if (!active || !announcement?.id || lastHandled.current === announcement.id) return;

      const previous = localStorage.getItem(LAST_SEEN_KEY);
      if (previous === announcement.id) return;
      lastHandled.current = announcement.id;
      localStorage.setItem(LAST_SEEN_KEY, announcement.id);
      announceInBrowser(announcement);
    };

    const start = async () => {
      if (started) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;
      started = true;

      const { data, error } = await supabase
        .from('feature_announcements')
        .select('id, title, message, action_url, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) handle(data);

      const nextChannel = supabase.channel(
        `feature-announcements-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      nextChannel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feature_announcements' },
        ({ new: announcement }) => handle(announcement),
      );
      channel = nextChannel;
      nextChannel.subscribe();
    };

    start();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) start();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
