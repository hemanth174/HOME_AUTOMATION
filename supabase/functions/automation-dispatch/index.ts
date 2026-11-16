const MQTT_SUPABASE_URL = (Deno.env.get("MQTT_SUPABASE_URL") || "").replace(/\/$/, "");
const MQTT_SUPABASE_ANON_KEY = Deno.env.get("MQTT_SUPABASE_ANON_KEY") || "";
const MQTT_INGEST_SECRET = Deno.env.get("MQTT_INGEST_SECRET") || "";
const WEBHOOK_SECRET = Deno.env.get("AUTOMATION_DISPATCH_WEBHOOK_SECRET") || "";
const ALLOWED_ORIGINS = new Set([
  "https://home-automation-mauve-one.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...corsHeaders(request) } });
}

async function signature(timestamp: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(MQTT_INGEST_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "POST required" }, 405);
  if (WEBHOOK_SECRET && request.headers.get("x-dispatch-secret") !== WEBHOOK_SECRET) return json(request, { error: "Unauthorized" }, 401);
  if (!MQTT_SUPABASE_URL || !MQTT_SUPABASE_ANON_KEY || !MQTT_INGEST_SECRET) return json(request, { error: "Missing function secrets" }, 500);
  try {
    const response = await fetch(`${MQTT_SUPABASE_URL}/rest/v1/app_discovery?id=eq.true&select=backend_url&order=updated_at.desc&limit=1`, {
      headers: { apikey: MQTT_SUPABASE_ANON_KEY, Authorization: `Bearer ${MQTT_SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Discovery HTTP ${response.status}`);
    const backend = (await response.json())?.[0]?.backend_url;
    const url = new URL(String(backend || ""));
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid backend URL");
    const body = JSON.stringify({ refresh: true });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const dispatched = await fetch(`${url.origin}/api/automation/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mqtt-timestamp": timestamp,
        "x-mqtt-signature": await signature(timestamp, body) },
      body,
      signal: AbortSignal.timeout(7000),
    });
    if (!dispatched.ok) throw new Error(`Scheduler HTTP ${dispatched.status}`);
    return json(request, { ok: true }, 202);
  } catch (error) {
    console.error("automation-dispatch failed", error);
    return json(request, { error: error instanceof Error ? error.message : "Dispatch failed" }, 502);
  }
});
