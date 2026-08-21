/**
 * Local REST API Client for ESP32 Leader Node.
 * Handles direct communication over SoftAP (192.168.4.1) or local network (home-automation.local).
<<<<<<< HEAD
 * Uses fast abort timeouts (1200ms) to ensure non-blocking fallback if off-mesh.
=======
 * Uses fast abort timeouts (800ms) to ensure non-blocking fallback if off-mesh.
>>>>>>> 21b6d4f91f39143be1c452e38bd4eb943f7a0728
 */

const DEFAULT_LOCAL_IP = '192.168.4.1';
const DEFAULT_MDNS = 'http://home-automation.local';

/**
 * Get active base URL for local ESP32
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
<<<<<<< HEAD
export async function localFetch(endpoint, options = {}, timeoutMs = 1200) {
  const baseUrl = getLocalBaseUrl();

=======
async function localFetch(endpoint, options = {}, timeoutMs = 900) {
  const baseUrl = getLocalBaseUrl();

  // Browsers strictly block HTTP fetches from HTTPS origin (Mixed Content).
  // If on HTTPS, return null immediately without triggering browser security console warnings.
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    baseUrl.startsWith('http://') &&
    !baseUrl.includes('localhost') &&
    !baseUrl.includes('127.0.0.1')
  ) {
    throw new Error('Local direct fetch disabled on HTTPS to prevent Mixed Content. Use direct AP link.');
  }

>>>>>>> 21b6d4f91f39143be1c452e38bd4eb943f7a0728
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      mode: 'cors'
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
<<<<<<< HEAD
 */
export async function fetchLocalStatus() {
  return await localFetch('/api/status', { method: 'GET' }, 1000);
=======
 * @returns {Promise<{ online: boolean, role: string, nodeId: string, ip: string, devicesCount: number }>}
 */
export async function fetchLocalStatus() {
  return await localFetch('/api/status', { method: 'GET' }, 800);
>>>>>>> 21b6d4f91f39143be1c452e38bd4eb943f7a0728
}

/**
 * Fetch all device states directly from ESP32 GPIOs
<<<<<<< HEAD
 */
export async function fetchLocalDevices() {
  return await localFetch('/api/devices', { method: 'GET' }, 1000);
=======
 * @returns {Promise<Array<{ id: string|number, relay_index: number, is_on: boolean, feedback_on: boolean }>>}
 */
export async function fetchLocalDevices() {
  return await localFetch('/api/devices', { method: 'GET' }, 900);
>>>>>>> 21b6d4f91f39143be1c452e38bd4eb943f7a0728
}

/**
 * Send switch command directly to ESP32 local REST server
<<<<<<< HEAD
=======
 * @param {string|number} relayIndex - Index or ID of relay (0, 1, 2, 3)
 * @param {boolean} targetState - true for ON, false for OFF
 * @returns {Promise<{ success: boolean, relay_index: number, state: boolean, timestamp: number }>}
>>>>>>> 21b6d4f91f39143be1c452e38bd4eb943f7a0728
 */
export async function setLocalDeviceState(relayIndex, targetState) {
  return await localFetch(`/api/device/${relayIndex}/state`, {
    method: 'POST',
    body: JSON.stringify({ state: Boolean(targetState) })
<<<<<<< HEAD
  }, 1500);
=======
  }, 1000);
}

/**
 * Trigger bulk local action (e.g. ALL ON, ALL OFF)
 * @param {'on'|'off'} action 
 */
export async function triggerLocalAll(action) {
  return await localFetch(`/api/all/${action}`, {
    method: 'POST'
  }, 1200);
>>>>>>> 21b6d4f91f39143be1c452e38bd4eb943f7a0728
}
