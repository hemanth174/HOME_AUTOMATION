'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { discoverLocalNode, fetchLocalStatus, getLocalBaseUrl } from '@/lib/localApi';

/**
 * Shared local-connection store (singleton).
 *
 * Previously every component using useLocalConnection created its OWN
 * polling loop (Navbar + MainLayoutWrapper + useDashboardData = 3x
 * requests to the ESP32 every 5s). Now a single store owns the
 * connection state and all consumers subscribe to it.
 *
 * Re-checks are event-driven for network/visibility transitions and use a
 * lightweight health probe while the local-control page is active.
 */

const FAST_TIMEOUT_MS = 5500;
// Health probes are intentionally low-frequency: the local device page has
// its own device-state refresh, so probing status every few seconds duplicates
// traffic against the same ESP32. Visibility events still trigger an instant
// check when the user returns to the app.
const VISIBLE_PROBE_INTERVAL_MS = 15000;
const HIDDEN_PROBE_INTERVAL_MS = 60000;

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
  const interval = typeof document !== 'undefined' && document.visibilityState === 'visible'
    ? VISIBLE_PROBE_INTERVAL_MS
    : HIDDEN_PROBE_INTERVAL_MS;
  beatTimer = setTimeout(
    () => checkConnection(),
    interval,
  );
}

export async function checkConnection() {
  if (probeInFlight || !probingEnabled) return;
  probeInFlight = true;
  patch({ isProbing: true });

  try {
    let status;
    if (snapshot.isLocalConnected) {
      try {
        status = await fetchLocalStatus(1800);
      } catch {
        status = (await discoverLocalNode(FAST_TIMEOUT_MS)).status;
      }
    } else {
      status = (await discoverLocalNode(FAST_TIMEOUT_MS)).status;
    }
    if (!status || status.online !== true || !status.nodeId) {
      throw new Error('Invalid ESP32 status response');
    }
    consecutiveFailures = 0;
    // Only notify subscribers when something actually changed.
    if (
      !snapshot.isLocalConnected ||
      snapshot.leaderNode?.nodeId !== status.nodeId ||
      snapshot.leaderNode?.role !== status.role ||
      snapshot.leaderNode?.stationConnected !== status.stationConnected ||
      snapshot.leaderNode?.apStations !== status.apStations
    ) {
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
  const recheckWhenVisible = () => {
    if (document.visibilityState === 'visible' && probingEnabled) {
      setTimeout(() => checkConnection(), 150);
    }
  };

  // Connectivity transitions are THE signal that local mode may be needed -
  // react instantly instead of waiting for the next poll tick.
  window.addEventListener('online', () => { consecutiveFailures = 0; recheckOnNetworkChange(); });
  window.addEventListener('offline', () => { consecutiveFailures = 0; recheckOnNetworkChange(); });
  window.addEventListener('focus', recheckOnNetworkChange);
  document.addEventListener('visibilitychange', recheckWhenVisible);

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
