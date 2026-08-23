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
 * Re-checks are event-driven where possible:
 * - immediate check on window online/offline/focus/visibility events
 * - slow background beat only while the page is visible
 *   (10s connected / 20s disconnected) - no aggressive polling.
 */

const FAST_TIMEOUT_MS = 800;

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

function emit() {
  listeners.forEach((l) => l());
}

function patch(next) {
  snapshot = { ...snapshot, ...next };
  emit();
}

function scheduleNextBeat() {
  if (beatTimer) clearTimeout(beatTimer);
  const interval = snapshot.isLocalConnected ? 10000 : 20000;
  beatTimer = setTimeout(() => checkConnection(), interval);
}

export async function checkConnection() {
  if (probeInFlight) return;
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

  const recheckSoon = () => setTimeout(() => checkConnection(), 250);

  // Connectivity transitions are THE signal that local mode may be needed -
  // react instantly instead of waiting for the next poll tick.
  window.addEventListener('online', () => { consecutiveFailures = 0; recheckSoon(); });
  window.addEventListener('offline', () => { consecutiveFailures = 0; recheckSoon(); });
  window.addEventListener('focus', recheckSoon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recheckSoon();
  });

  checkConnection();
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
