'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { discoverLocalNode, getLocalBaseUrl } from '@/lib/localApi';

/**
 * Shared local-connection store (singleton).
 *
 * Previously every component using useLocalConnection created its OWN
 * polling loop (Navbar + MainLayoutWrapper + useDashboardData = 3x
 * requests to the ESP32 every 5s). Now a single store owns the
 * connection state and all consumers subscribe to it.
 *
 * Re-checks are event-driven for real network transitions:
 * - immediate check on window online/offline events
 * - slow background beat only while the page is visible
 *   (30 minutes) - no aggressive polling.
 */

const FAST_TIMEOUT_MS = 5500;
const BACKGROUND_PROBE_INTERVAL_MS = 30 * 60 * 1000;

let snapshot = {
  isLocalConnected: false,
  leaderNode: null,
  isProbing: false,
  lastChecked: null,
};

const listeners = new Set();
let probeInFlight = false;
let consecutiveFailures = 0;
let beatTimer = null;
let eventsBound = false;
// Mesh probing runs ONLY while explicitly enabled (the /local page enables
// it on mount and disables on unmount). No background ESP32 polling
// anywhere else in the app.
let probingEnabled = false;

export function setLocalProbingEnabled(on) {
  probingEnabled = Boolean(on);
  if (probingEnabled) {
    consecutiveFailures = 0;
    checkConnection();
  } else if (beatTimer) {
    clearTimeout(beatTimer);
    beatTimer = null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function patch(next) {
  snapshot = { ...snapshot, ...next };
  emit();
}

function scheduleNextBeat() {
  if (beatTimer) clearTimeout(beatTimer);
  beatTimer = null;
  if (!probingEnabled) return;
  beatTimer = setTimeout(
    () => checkConnection(),
    BACKGROUND_PROBE_INTERVAL_MS,
  );
}

export async function checkConnection() {
  if (probeInFlight || !probingEnabled) return;
  probeInFlight = true;
  patch({ isProbing: true });

  try {
    const { status } = await discoverLocalNode(FAST_TIMEOUT_MS);
    consecutiveFailures = 0;
    // Only notify subscribers when something actually changed.
    if (!snapshot.isLocalConnected || snapshot.leaderNode?.nodeId !== status.nodeId) {
      patch({ isLocalConnected: true, leaderNode: status });
    }
  } catch {
    consecutiveFailures += 1;
    // Require 2 consecutive failures before flipping to disconnected (anti-jitter)
    if (consecutiveFailures >= 2 && snapshot.isLocalConnected) {
      patch({ isLocalConnected: false, leaderNode: null });
    }
  } finally {
    probeInFlight = false;
    patch({ isProbing: false, lastChecked: Date.now() });
    scheduleNextBeat();
  }
}

function bindGlobalEvents() {
  if (eventsBound || typeof window === 'undefined') return;
  eventsBound = true;

  const recheckOnNetworkChange = () => {
    if (probingEnabled) setTimeout(() => checkConnection(), 250);
  };

  // Connectivity transitions are THE signal that local mode may be needed -
  // react instantly instead of waiting for the next poll tick.
  window.addEventListener('online', () => { consecutiveFailures = 0; recheckOnNetworkChange(); });
  window.addEventListener('offline', () => { consecutiveFailures = 0; recheckOnNetworkChange(); });

  if (probingEnabled) checkConnection();
}

const subscribe = (listener) => {
  bindGlobalEvents();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

/**
 * React hook - every consumer shares one connection state & one timer.
 */
export default function useLocalConnection() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const checkNow = useCallback(() => checkConnection(), []);

  return {
    isLocalConnected: state.isLocalConnected,
    leaderNode: state.leaderNode,
    localUrl: getLocalBaseUrl(),
    isProbing: state.isProbing,
    lastChecked: state.lastChecked,
    checkConnection: checkNow,
  };
}
