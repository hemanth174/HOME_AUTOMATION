/**
 * Real internet reachability check.
 *
 * navigator.onLine only tells us whether a network interface is attached -
 * connecting to the ESP32 SoftAP (HOME-AUTO-LEADER) fires the browser's
 * "online" event even though there is zero internet. The app must verify
 * actual reachability before switching between cloud and local modes.
 */

let lastResult = null; // { up: boolean, at: timestamp }
let inFlight = null;
const CACHE_MS = 8000;
const TIMEOUT_MS = 4000;

async function probe() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Standard captive-portal check endpoint. no-cors: we only care
    // whether the request completes at all.
    await fetch('https://www.gstatic.com/generate_204', {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    // Fallback probe: our own Supabase project
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) return false;
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);
      await fetch(supabaseUrl + '/rest/v1/', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller2.signal,
      });
      clearTimeout(timer2);
      return true;
    } catch {
      return false;
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns true only when the internet is actually reachable.
 * Result is cached briefly to avoid hammering the probe endpoint.
 */
export async function checkInternet(force = false) {
  const now = Date.now();
  if (!force && lastResult && now - lastResult.at < CACHE_MS) {
    return lastResult.up;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let up = false;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        up = false; // interface gone - no need to probe
      } else {
        up = await probe();
      }
    } catch {
      up = false;
    }
    lastResult = { up, at: Date.now() };
    return up;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
