const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PROVISIONING_ENCRYPTION_KEY = Deno.env.get("PROVISIONING_ENCRYPTION_KEY") || "";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function headers() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(6000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 220)}`);
  }
  return text ? JSON.parse(text) : null;
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function decryptProvisioningValue(value: string) {
  if (!PROVISIONING_ENCRYPTION_KEY) throw new Error("PROVISIONING_ENCRYPTION_KEY is not configured");
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Encrypted configuration has invalid format");
  const keyBytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(PROVISIONING_ENCRYPTION_KEY),
  ));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const iv = decodeBase64Url(ivText);
  const tag = decodeBase64Url(tagText);
  const encrypted = decodeBase64Url(encryptedText);
  const ciphertextAndTag = new Uint8Array(encrypted.length + tag.length);
  ciphertextAndTag.set(encrypted);
  ciphertextAndTag.set(tag, encrypted.length);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertextAndTag);
  return new TextDecoder().decode(clear);
}

function validBoardIdentifier(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

async function getDevice(request: Request, boardIdentifier: unknown) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (bearer.length < 32 || !validBoardIdentifier(boardIdentifier)) return null;
  const tokenHash = await sha256(bearer);
  const rows = await rest(
    `device_runtime_configs?device_token_hash=eq.${encodeURIComponent(tokenHash)}&select=board_id,user_id,device_token_hash,wifi_ssid,wifi_security,encrypted_wifi_password,config_version,applied_config_version,config_update_status`,
  );
  const config = Array.isArray(rows) ? rows[0] : null;
  if (!config) return null;

  const boards = await rest(
    `boards?id=eq.${encodeURIComponent(config.board_id)}&select=id,board_identifier,user_id`,
  );
  const board = Array.isArray(boards) ? boards[0] : null;
  if (!board || board.board_identifier !== boardIdentifier || board.user_id !== config.user_id) return null;
  return { token: bearer, config, board };
}

async function writeConfigEvent(
  config: Record<string, unknown>,
  status: string,
  message: string,
  createdBy = "device",
) {
  await rest("device_config_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      board_id: config.board_id,
      user_id: config.user_id,
      config_version: Number(config.config_version || 0),
      status,
      message: message.slice(0, 500),
      created_by: createdBy,
    }),
  });
}

async function poll(request: Request, body: Record<string, unknown>) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const boardIdentifier = body.board_identifier;
  if (bearer.length < 32 || !validBoardIdentifier(boardIdentifier)) {
    return json({ error: "Device authentication failed" }, 401);
  }

  // A privileged SECURITY DEFINER RPC verifies the device token and returns
  // the complete current snapshot without making one REST request per table.
  const snapshot = await rest("rpc/device_agent_snapshot", {
    method: "POST",
    body: JSON.stringify({
      p_device_token_hash: await sha256(bearer),
      p_board_identifier: boardIdentifier,
    }),
  });
  if (!snapshot?.ok || !snapshot?.config || !snapshot?.board) {
    return json({ error: "Device authentication failed" }, 401);
  }

  const config = snapshot.config as Record<string, unknown>;
  const board = snapshot.board as Record<string, unknown>;
  let configuration = null;
  const reportedVersion = Number(body.applied_config_version ?? config.applied_config_version ?? 0);
  const currentVersion = Number(config.config_version ?? 0);
  const ssid = String(config.wifi_ssid || "");
  const deliveryStatus = String(config.config_update_status || "");

  if (currentVersion > reportedVersion &&
      ssid.length > 0 &&
      ["pending", "sending"].includes(deliveryStatus)) {
    let password = "";
    if (config.wifi_security === "wpa2_psk") {
      if (!config.encrypted_wifi_password) {
        throw new Error("WPA2 configuration is missing an encrypted password");
      }
      password = await decryptProvisioningValue(String(config.encrypted_wifi_password));
    }
    configuration = {
      version: currentVersion,
      wifi_ssid: ssid,
      wifi_security: config.wifi_security,
      wifi_password: password,
    };
    if (deliveryStatus !== "sending") {
      await rest(
        \`device_runtime_configs?board_id=eq.\${encodeURIComponent(String(config.board_id))}\`,
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ config_update_status: "sending" }) },
      );
      await writeConfigEvent(config, "sending", "ESP32 checked in and received the pending configuration.", "device");
    }
  }

  return json({
    ok: true,
    board_identifier: board.board_identifier,
    board_id: board.id,
    user_id: board.user_id,
    server_time: snapshot.server_time || new Date().toISOString(),
    devices: Array.isArray(snapshot.devices) ? snapshot.devices : [],
    alarms: Array.isArray(snapshot.alarms) ? snapshot.alarms : [],
    schedules: Array.isArray(snapshot.schedules) ? snapshot.schedules : [],
    config: configuration,
    commands: Array.isArray(snapshot.commands) ? snapshot.commands : [],
  });
}

async function updateConfigStatus(device: { config: Record<string, unknown> }, body: Record<string, unknown>) {
  const version = Number(body.version);
  const status = String(body.status || "");
  const valid = ["checking_wifi", "applying", "applied", "failed"];
  if (!Number.isInteger(version) || version < 1 || !valid.includes(status)) {
    return json({ error: "Invalid configuration acknowledgement" }, 400);
  }
  const currentVersion = Number(device.config.config_version);
  if (version > currentVersion) return json({ error: "Configuration version is newer than the server" }, 409);

  const patch: Record<string, unknown> = {
    config_update_status: status,
    last_error: status === "failed" ? String(body.error || "Device rejected the configuration").slice(0, 500) : null,
    updated_at: new Date().toISOString(),
  };
  if (status === "applied") {
    patch.applied_config_version = version;
    patch.config_applied_at = new Date().toISOString();
  }
  await rest(
    `device_runtime_configs?board_id=eq.${encodeURIComponent(String(device.config.board_id))}`,
    { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) },
  );
  const messages: Record<string, string> = {
    checking_wifi: "ESP32 is checking whether the configured Wi-Fi network is visible.",
    applying: "ESP32 is attempting the new network and staging the settings.",
    applied: "ESP32 connected with the new configuration and saved it to NVS.",
    failed: String(body.error || "ESP32 rejected the configuration."),
  };
  await writeConfigEvent(device.config, status, messages[status] || status, "device");
  return json({ ok: true, version, status });
}

async function acknowledgeCommand(device: { config: Record<string, unknown> }, body: Record<string, unknown>) {
  const commandId = String(body.command_id || "");
  const status = String(body.status || "");
  if (!/^[0-9a-f-]{36}$/i.test(commandId) || !["accepted", "completed", "failed"].includes(status)) {
    return json({ error: "Invalid command acknowledgement" }, 400);
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    last_error: status === "failed" ? String(body.error || "Command failed").slice(0, 500) : null,
    result: { reported_by_device: true, message: String(body.message || "").slice(0, 300) },
  };
  if (status === "accepted") patch.accepted_at = now;
  if (status === "completed" || status === "failed") patch.completed_at = now;

  const rows = await rest(
    `device_commands?id=eq.${encodeURIComponent(commandId)}&board_id=eq.${encodeURIComponent(String(device.config.board_id))}&status=in.(pending,accepted)`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) },
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ ok: true, ignored: true, reason: "already_acknowledged_or_not_found" });
  }
  return json({ ok: true, command_id: commandId, status });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PROVISIONING_ENCRYPTION_KEY) {
    return json({ error: "Device agent is not configured on the server" }, 503);
  }
  try {
    const body = await request.json();
    const action = String(body.action || "poll");
    if (action === "poll") return await poll(request, body);

    const device = await getDevice(request, body.board_identifier);
    if (!device) return json({ error: "Device authentication failed" }, 401);

    if (action === "config_status") return await updateConfigStatus(device, body);
    if (action === "ack") return await acknowledgeCommand(device, body);
    return json({ error: "Unsupported device action" }, 400);
  } catch (error) {
    console.error("device-agent failed", error);
    return json({ error: error instanceof Error ? error.message : "Device request failed" }, 500);
  }
});
