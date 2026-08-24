/**
 * Local REST API Client for the ESP32 mesh.
 * Handles direct communication over SoftAP (192.168.4.1), LAN IP or mDNS.
 *
 * Design goals:
 * - Fast connection: candidate endpoints are probed IN PARALLEL, first
 *   responder wins (no sequential fallback chains).
 * - Short, intelligent timeouts - never block the UI for seconds.
 * - Multi-board aware: devices carry a node_id and commands can be
 *   proxied through the leader to any room board.
 */

const DEFAULT_LOCAL_IP = '192.168.4.1';
const MDNS_HOST = 'home-automation.local';

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
 * All plausible ESP32 gateways, most likely first.
 */
export function getLocalCandidateUrls() {
  const candidates = [
    getLocalBaseUrl(),
    `http://${DEFAULT_LOCAL_IP}`,
    `http://${MDNS_HOST}`,
  ];
  return [...new Set(candidates)];
}

/**
 * Fetch wrapper for the local ESP32.
 *
 * Chrome (120+) blocks or restricts HTTPS pages from fetching plain-HTTP
 * local devices like http://192.168.4.1 (mixed content / Local Network
 * Access rules). Declaring `targetAddressSpace` tells the browser the
 * request intentionally goes to a private/local device, which exempts it
 * from mixed-content blocking and triggers the Local Network Access
 * permission prompt where required.
 *
 * The enum value changed across Chrome versions ('private' -> 'local'),
 * so we probe strategies in order and lock onto whichever one this
 * browser accepts. Browsers without support just fetch normally.
 */
const ADDRESS_SPACE_STRATEGIES = ['local', 'private', undefined];
let addressSpaceIndex = 0;

async function localFetch(url, options = {}) {
  let lastError;
  for (let i = addressSpaceIndex; i < ADDRESS_SPACE_STRATEGIES.length; i++) {
    const space = ADDRESS_SPACE_STRATEGIES[i];
    try {
      const res = space
        ? await fetch(url, { ...options, targetAddressSpace: space })
        : await fetch(url, options);
      // A real response (any status) proves this strategy works.
      addressSpaceIndex = i;
      return res;
    } catch (err) {
      lastError = err;
      // TypeError covers BOTH "unknown fetch option" and network
      // failure - try the next strategy; the working one gets locked
      // in on the first successful response.
    }
  }
  throw lastError;
}

/**
 * Low-level fetch with abort timeout. Rejects on timeout / network error.
 *
 * NOTE: a Content-Type header is attached ONLY when there is a body.
 * Sending Content-Type: application/json on GETs makes them non-simple
 * requests, forcing a CORS preflight (OPTIONS) on every poll - which
 * Chrome's Private Network Access rules block for requests from the
 * HTTPS app to http://192.168.4.1. Simple GETs skip preflight entirely.
 */
async function fetchJson(url, { method = 'GET', body, timeoutMs = 800 } = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    const res = await localFetch(url, {
      method,
      signal: controller.signal,
      headers,
      body,
      mode: 'cors',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

/**
 * Probe every candidate gateway simultaneously; resolve with the FIRST
 * one that answers /api/status. Worst case cost ~= timeoutMs.
 */
export async function discoverLocalNode(timeoutMs = 900) {
  const urls = getLocalCandidateUrls();

  const attempts = urls.map(async (baseUrl) => {
    const status = await fetchJson(`${baseUrl}/api/status`, { timeoutMs });
    if (!status || (!status.online && !status.nodeId && !status.role)) {
      throw new Error('Invalid status payload');
    }
    setLocalBaseUrl(baseUrl);
    return { baseUrl, status };
  });

  try {
    return await Promise.any(attempts);
  } catch {
    throw new Error('ESP32 not reachable');
  }
}

/** Validate + normalize a device payload from any firmware generation. */
function normalizeDevice(d) {
  return {
    id: d.id ?? `${d.node_id || 'esp32'}_${d.relay_index}`,
    relay_index: d.relay_index ?? 0,
    is_on: Boolean(d.is_on),
    feedback_on: Boolean(d.feedback_on),
    node_id: d.node_id || null,
    node_role: d.node_role || null,
  };
}

/**
 * Ping the currently-selected local node.
 */
export async function fetchLocalStatus(timeoutMs = 800) {
  return fetchJson(`${getLocalBaseUrl()}/api/status`, { timeoutMs });
}

/**
 * Fetch all device states (aggregated across the mesh when talking
 * to a leader node).
 */
export async function fetchLocalDevices(timeoutMs = 900) {
  const data = await fetchJson(`${getLocalBaseUrl()}/api/devices`, { timeoutMs });
  return Array.isArray(data) ? data.map(normalizeDevice) : [];
}

/**
 * Send a switch command.
 * - Without nodeId: legacy single-board endpoint (unchanged behaviour).
 * - With nodeId: leader proxies the command to the owning room board.
 */
export async function setLocalDeviceState(relayIndex, targetState, nodeId = null) {
  const base = getLocalBaseUrl();
  const endpoint = nodeId
    ? `/api/node/${encodeURIComponent(nodeId)}/device/${relayIndex}/state`
    : `/api/device/${relayIndex}/state`;
  return fetchJson(`${base}${endpoint}`, {
    method: 'POST',
    body: JSON.stringify({ state: Boolean(targetState) }),
    timeoutMs: nodeId ? 2500 : 1200, // extra hop through leader needs headroom
  });
}

/**
 * Trigger all relays ON/OFF in one call. The firmware fans this out across
 * the whole mesh, so no client-side fan-out is needed anymore.
 */
export async function triggerLocalAll(action) {
  return fetchJson(`${getLocalBaseUrl()}/api/all/${action === 'on' ? 'on' : 'off'}`, {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 3000,
  });
}

/**
 * Mesh topology listing (leader nodes only). Returns [] for single-board
 * setups or member nodes so callers don't need special-casing.
 */
export async function fetchMeshNodes(timeoutMs = 900) {
  try {
    const data = await fetchJson(`${getLocalBaseUrl()}/api/mesh/nodes`, { timeoutMs });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
