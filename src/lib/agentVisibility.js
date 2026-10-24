'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'vikatech_voice_agent_visible';
const EVENT_NAME = 'vk:voice-agent-visibility';

/**
 * Voice is available for local testing by default, but remains off on the
 * deployed site until an administrator explicitly enables it at deploy time.
 */
export function isVoiceAgentAvailable() {
  const configured = process.env.NEXT_PUBLIC_VOICE_AGENT_ENABLED;
  if (configured === 'true') return true;
  if (configured === 'false') return false;

  if (typeof window === 'undefined') return true;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

/** Default is visible; only an explicit 'hidden' hides the agent. */
export function isVoiceAgentVisible() {
  try {
    if (typeof window === 'undefined') return true;
    return isVoiceAgentAvailable() && window.localStorage.getItem(STORAGE_KEY) !== 'hidden';
  } catch {
    return isVoiceAgentAvailable();
  }
}

export function setVoiceAgentVisible(visible) {
  try {
    if (visible) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, 'hidden');
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { visible } }));
  } catch {}
}

/**
 * Live-reactive visibility flag for every voice-agent surface
 * (floating mic, per-card mic buttons). Updates instantly when the
 * Profile settings toggle changes, including across open tabs.
 */
export function useVoiceAgentVisible() {
  const [visible, setVisible] = useState(isVoiceAgentVisible);

  useEffect(() => {
    const sync = (e) => {
      if (e && e.detail && typeof e.detail.visible === 'boolean') {
        setVisible(e.detail.visible);
      } else {
        setVisible(isVoiceAgentVisible());
      }
    };
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return visible;
}
