const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MQTT_SUPABASE_URL = (Deno.env.get("MQTT_SUPABASE_URL") || "").replace(/\/$/, "");
const MQTT_SUPABASE_ANON_KEY = Deno.env.get("MQTT_SUPABASE_ANON_KEY") || "";
const MQTT_INGEST_SECRET = Deno.env.get("MQTT_INGEST_SECRET") || "";
const MQTT_DISPATCH_WEBHOOK_SECRET = Deno.env.get("MQTT_DISPATCH_WEBHOOK_SECRET") || "";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function restHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
}

async function restGet(baseUrl: string, serviceRoleKey: string, path: string) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: restHeaders(serviceRoleKey),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Supabase REST returned HTTP ${response.status}`);
  return response.json();
}

function isValidUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidBoardIdentifier(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function isValidTunnelUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signCommand(timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MQTT_INGEST_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return hex(signature);
}

async function dispatch(record: Record<string, unknown>) {
  if (!isValidUuid(record.id) || !isValidUuid(record.board_id)) {
    return json({ ignored: true, reason: "invalid_device_or_board_id" });
  }
  if (!Number.isInteger(record.relay_index) || Number(record.relay_index) < 0 || Number(record.relay_index) > 31) {
    return json({ ignored: true, reason: "invalid_relay_index" });
  }
  if (typeof record.is_on !== "boolean") {
    return json({ ignored: true, reason: "invalid_state" });
  }

  // Re-read the current row so a delayed/replayed webhook cannot dispatch an
  // obsolete state after a newer database update has already committed.
  const devices = await restGet(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    `devices?id=eq.${encodeURIComponent(String(record.id))}&select=id,board_id,relay_index,is_on,last_changed`,
  );
  const current = Array.isArray(devices) ? devices[0] : null;
  if (!current || current.is_on !== record.is_on || current.last_changed !== record.last_changed) {
    return json({ ignored: true, reason: "stale_database_event" });
  }

  const boards = await restGet(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    `boards?id=eq.${encodeURIComponent(String(record.board_id))}&select=id,board_identifier`,
  );
  const boardIdentifier = boards?.[0]?.board_identifier;
  if (!isValidBoardIdentifier(boardIdentifier)) {
    return json({ ignored: true, reason: "board_identifier_not_found" });
  }

  // This is intentionally queried for every dispatch. app_discovery is the
  // source of truth when a Quick Tunnel URL changes.
  const discoveryRows = await restGet(
    MQTT_SUPABASE_URL,
    MQTT_SUPABASE_ANON_KEY,
    "app_discovery?id=eq.true&select=backend_url,updated_at&order=updated_at.desc&limit=1",
  );
  const discovery = Array.isArray(discoveryRows) ? discoveryRows[0] : null;
  if (!discovery || !isValidTunnelUrl(discovery.backend_url)) {
    throw new Error("app_discovery.backend_url is missing or invalid");
  }

  const command = {
    command_id: crypto.randomUUID(),
    board_identifier: boardIdentifier,
    device_id: record.id,
    relay_index: Number(record.relay_index),
    state: Boolean(record.is_on),
    last_changed: record.last_changed || null,
    discovery_updated_at: discovery.updated_at || null,
  };
  const body = JSON.stringify(command);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(`${String(discovery.backend_url).replace(/\/$/, "")}/api/device/command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mqtt-timestamp": timestamp,
      "x-mqtt-signature": await signCommand(timestamp, body),
    },
    body,
    signal: AbortSignal.timeout(7000),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Local MQTT server returned HTTP ${response.status}: ${responseText.slice(0, 300)}`);
  }

  return json({
    ok: true,
    board_identifier: boardIdentifier,
    relay_index: command.relay_index,
    tunnel_updated_at: discovery.updated_at,
  }, 202);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !MQTT_SUPABASE_URL ||
    !MQTT_SUPABASE_ANON_KEY ||
    !MQTT_INGEST_SECRET
  ) {
    return json({ error: "Function secrets are not configured" }, 500);
  }
  if (MQTT_DISPATCH_WEBHOOK_SECRET &&
      request.headers.get("x-dispatch-secret") !== MQTT_DISPATCH_WEBHOOK_SECRET) {
    return json({ error: "Invalid dispatch webhook secret" }, 401);
  }

  try {
    const input = await request.json();
    const record = input?.record || input?.new_record || input;
    const oldRecord = input?.old_record;

    // Feedback updates must never become relay commands.
    if (oldRecord && oldRecord.is_on === record?.is_on) {
      return json({ ignored: true, reason: "is_on_unchanged" });
    }
    return await dispatch(record || {});
  } catch (error) {
    console.error("mqtt-dispatch failed", error);
    return json({ error: error instanceof Error ? error.message : "Dispatch failed" }, 502);
  }
});
