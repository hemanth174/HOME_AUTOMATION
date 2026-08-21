/**
 * Local REST API Client for ESP32 Leader Node.
 * Handles direct communication over SoftAP (192.168.4.1) or local network.
 * Uses fast abort timeouts to ensure non-blocking fallback if off-mesh.
 */

const DEFAULT_LOCAL_IP = '192.168.4.1';

/**
 * Get active base URL for local ESP32 (stored in localStorage for persistence)
 */
export function getLocalBaseUrl() {
  if (typeof window === 'undefined') return `http://${DEFAULT_LOCAL_IP}`;
  return localStorage.getItem('esp32_local_url') || `http://${DEFAULT_LOCAL_IP}`;
}

export function setLocalBaseUrl(url) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('esp32_local_url', url);
  }
}

/**
 * Helper to execute fetch with timeout
 */
export async function localFetch(endpoint, options = {}, timeoutMs = 1200) {
  const baseUrl = getLocalBaseUrl();

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      mode: 'cors',
    });
    clearTimeout(id);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Ping local ESP32 for status & heartbeat
 */
export async function fetchLocalStatus() {
  return await localFetch('/api/status', { method: 'GET' }, 1000);
}

/**
 * Fetch all device states directly from ESP32 GPIOs
 */
export async function fetchLocalDevices() {
  return await localFetch('/api/devices', { method: 'GET' }, 1000);
}

/**
 * Send switch command directly to ESP32 local REST server
 */
export async function setLocalDeviceState(relayIndex, targetState) {
  return await localFetch(`/api/device/${relayIndex}/state`, {
    method: 'POST',
    body: JSON.stringify({ state: Boolean(targetState) }),
  }, 1500);
}

/**
 * Trigger all relays ON or OFF in a single local REST call.
 * Falls back to sending 4 individual requests if /api/all endpoint is absent.
 * @param {'on' | 'off'} action
 */
export async function triggerLocalAll(action) {
  const targetState = action === 'on';
  try {
    // Try the bulk endpoint first (ESP32 may support it)
    return await localFetch('/api/all', {
      method: 'POST',
      body: JSON.stringify({ state: targetState }),
    }, 1500);
  } catch {
    // Fallback: send individual commands for relay 0-3 in parallel
    await Promise.all(
      [0, 1, 2, 3].map(i => setLocalDeviceState(i, targetState))
    );
    return { success: true, fallback: true };
  }
}
