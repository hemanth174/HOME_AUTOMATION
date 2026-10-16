'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'vikatech_voice_agent_visible';
const EVENT_NAME = 'vk:voice-agent-visibility';

/** Default is visible; only an explicit 'hidden' hides the agent. */
export function isVoiceAgentVisible() {
  try {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(STORAGE_KEY) !== 'hidden';
  } catch {
    return true;
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
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return visible;
}
