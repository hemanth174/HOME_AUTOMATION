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

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function encryptProvisioningValue(value: string) {
  if (!PROVISIONING_ENCRYPTION_KEY) throw new Error("PROVISIONING_ENCRYPTION_KEY is not configured");
  const keyBytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(PROVISIONING_ENCRYPTION_KEY),
  ));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedAndTag = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  ));
  const tagStart = encryptedAndTag.length - 16;
  const ciphertext = encryptedAndTag.slice(0, tagStart);
  const tag = encryptedAndTag.slice(tagStart);
  return `${encodeBase64Url(iv)}.${encodeBase64Url(tag)}.${encodeBase64Url(ciphertext)}`;
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
  const userId = String(board.user_id || "");
  const boardId = String(board.id || "");

  // On first authenticated check-in, record the network this board is already
  // connected to. Do this only when no admin-defined config exists; never let
  // a later device heartbeat overwrite an admin's pending Wi-Fi change.
  const existingSsid = String(config.wifi_ssid || "").trim();
  const currentSsid = typeof body.current_wifi_ssid === "string" ? body.current_wifi_ssid.trim() : "";
  const currentSecurity = body.current_wifi_security === "open" || body.current_wifi_security === "wpa2_psk"
    ? body.current_wifi_security
    : "";
  const currentPassword = typeof body.current_wifi_password === "string" ? body.current_wifi_password : "";
  const statusBeforeRegistration = String(config.config_update_status || "");
  let wifiConfigRegistered = existingSsid.length > 0;
  if (!existingSsid && statusBeforeRegistration === "unprovisioned" &&
      currentSsid.length >= 1 && currentSsid.length <= 32 && !/[\\u0000-\\u001f]/.test(currentSsid) &&
      (currentSecurity === "open" || (currentSecurity === "wpa2_psk" && currentPassword.length >= 8 && currentPassword.length <= 63)) &&
      (currentSecurity !== "open" || currentPassword.length === 0)) {
    const initialPassword = currentSecurity === "wpa2_psk" ? await encryptProvisioningValue(currentPassword) : null;
    const initialVersion = Math.max(1, Number(config.config_version || 1));
    const registeredAt = new Date().toISOString();
    const registrationRows = await rest(
      "device_runtime_configs?board_id=eq." + encodeURIComponent(boardId) +
        "&user_id=eq." + encodeURIComponent(userId) +
        "&config_update_status=eq.unprovisioned",
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          wifi_ssid: currentSsid,
          wifi_security: currentSecurity,
          encrypted_wifi_password: initialPassword,
          applied_config_version: initialVersion,
          config_update_status: "applied",
          config_applied_at: registeredAt,
          last_seen_at: registeredAt,
          last_direct_seen_at: registeredAt,
          updated_at: registeredAt,
        }),
      },
    );
    if (Array.isArray(registrationRows) && registrationRows.length > 0) {
      config.wifi_ssid = currentSsid;
      config.wifi_security = currentSecurity;
      config.encrypted_wifi_password = initialPassword;
      config.applied_config_version = initialVersion;
      config.config_update_status = "applied";
      config.config_applied_at = registeredAt;
      wifiConfigRegistered = true;
      await writeConfigEvent(config, "applied", "Initial Wi-Fi settings registered from the authenticated ESP32 check-in.", "device");
    } else {
      // Another concurrent first check-in may already have registered it.
      // Re-fetch metadata without exposing or decrypting the stored secret.
      const savedRows = await rest(
        "device_runtime_configs?board_id=eq." + encodeURIComponent(boardId) +
          "&user_id=eq." + encodeURIComponent(userId) +
          "&select=wifi_ssid,wifi_security,config_version,applied_config_version,config_update_status",
      );
      const saved = Array.isArray(savedRows) ? savedRows[0] : null;
      if (saved?.wifi_ssid) {
        Object.assign(config, saved);
        wifiConfigRegistered = true;
      }
    }
  }

  let configuration: Record<string, unknown> | null = null;
  let commands: Record<string, unknown>[] = Array.isArray(snapshot.commands)
    ? snapshot.commands.filter((item: Record<string, unknown>) =>
        String(item.board_id || "") === boardId &&
        String(item.board_identifier || "") === String(board.board_identifier || ""))
    : [];
  const reportedVersion = Number(body.applied_config_version ?? config.applied_config_version ?? 0);
  const currentVersion = Number(config.config_version ?? 0);
  const ssid = String(config.wifi_ssid || "");
  const deliveryStatus = String(config.config_update_status || "");

  if (currentVersion > reportedVersion && ssid.length > 0 &&
      ["pending", "sending", "checking_wifi", "applying"].includes(deliveryStatus)) {
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
        "device_runtime_configs?board_id=eq." + encodeURIComponent(boardId),
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ config_update_status: "sending" }) },
      );
      await writeConfigEvent(config, "sending", "ESP32 checked in and received the pending configuration.", "device");
    }
  }

  // Mesh presence is informative only. Do not return another board's commands
  // or decrypt its Wi-Fi password for this gateway: current firmware has no
  // authenticated per-member command/config forwarding path.
  const isMeshGateway = body.mesh_gateway === true;
  if (isMeshGateway && userId && boardId) {
    const userBoards = await rest(
      "boards?user_id=eq." + encodeURIComponent(userId) + "&select=id,board_identifier",
    );
    const knownBoards: Record<string, string> = { [String(board.board_identifier)]: boardId };
    for (const item of Array.isArray(userBoards) ? userBoards : []) {
      if (typeof item.board_identifier === "string" && validBoardIdentifier(item.board_identifier)) {
        knownBoards[item.board_identifier] = String(item.id);
      }
    }

    const meshNodes = Array.isArray(body.mesh_nodes) ? body.mesh_nodes.slice(0, 8) : [];
    const liveBoardIds: string[] = [];
    for (const node of meshNodes) {
      if (!node || !validBoardIdentifier(node.node_id)) continue;
      const lastSeenMs = Number(node.last_seen_ms);
      if (!Number.isFinite(lastSeenMs) || lastSeenMs < 0 || lastSeenMs > 45000) continue;
      const memberBoardId = knownBoards[String(node.node_id)];
      if (memberBoardId && memberBoardId !== boardId) liveBoardIds.push(memberBoardId);
    }

    const uniqueLiveIds = Array.from(new Set(liveBoardIds));
    if (uniqueLiveIds.length) {
      const idFilter = "in.(" + uniqueLiveIds.map((id) => encodeURIComponent(id)).join(",") + ")";
      const now = new Date().toISOString();
      // This timestamp indicates mesh reachability only. Admin remote control
      // requires a recent direct authenticated check-in from the target board.
      await rest(
        "device_runtime_configs?board_id=" + idFilter + "&user_id=eq." + encodeURIComponent(userId),
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ last_mesh_seen_at: now, last_seen_at: now }),
        },
      );
      await rest(
        "boards?id=" + idFilter + "&user_id=eq." + encodeURIComponent(userId),
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_seen: now }) },
      );
    }
  }

  return json({
    ok: true,
    board_identifier: board.board_identifier,
    board_id: board.id,
    user_id: board.user_id,
    server_config_version: currentVersion,
    server_config_status: deliveryStatus || "unprovisioned",
    server_time: snapshot.server_time || new Date().toISOString(),
    wifi_config_registered: wifiConfigRegistered,
    devices: Array.isArray(snapshot.devices) ? snapshot.devices : [],
    alarms: Array.isArray(snapshot.alarms) ? snapshot.alarms : [],
    schedules: Array.isArray(snapshot.schedules) ? snapshot.schedules : [],
    config: configuration,
    commands,
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
  if (version !== currentVersion) {
    return json({ error: "This acknowledgement refers to an obsolete configuration version" }, 409);
  }

  const currentStatus = String(device.config.config_update_status || "pending");
  const terminalStatus = currentStatus === "applied" || currentStatus === "failed";
  if (terminalStatus && status !== currentStatus) {
    return json({ error: "The configuration version already has a terminal result" }, 409);
  }
  const rank: Record<string, number> = {
    pending: 0, sending: 1, checking_wifi: 2, applying: 3, applied: 4, failed: 4,
  };
  if ((rank[status] ?? -1) < (rank[currentStatus] ?? -1)) {
    return json({ ok: true, ignored: true, reason: "stale_status_transition" });
  }

  const acknowledgedAt = new Date().toISOString();
  const patch: Record<string, unknown> = {
    config_update_status: status,
    last_error: status === "failed" ? String(body.error || "Device rejected the configuration").slice(0, 500) : null,
    last_seen_at: acknowledgedAt,
    last_direct_seen_at: acknowledgedAt,
    updated_at: acknowledgedAt,
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
    `device_commands?id=eq.${encodeURIComponent(commandId)}&board_id=eq.${encodeURIComponent(String(device.config.board_id))}&status=in.(pending,accepted)&expires_at=gt.${encodeURIComponent(now)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) },
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return json({ ok: true, ignored: true, reason: "already_acknowledged_or_not_found" });
  }
  return json({ ok: true, command_id: commandId, status });
}

async function handleDeviceDataAction(
  device: { config: Record<string, unknown>; board: Record<string, unknown> },
  body: Record<string, unknown>,
) {
  const action = String(body.action || "");
  const boardId = String(device.config.board_id || "");
  const userId = String(device.config.user_id || "");
  if (!boardId || !userId) return json({ error: "Device board is not registered" }, 409);

  const deviceRows = await rest(
    "devices?board_id=eq." + encodeURIComponent(boardId) +
      "&user_id=eq." + encodeURIComponent(userId) +
      "&select=id,name,relay_index,is_on,last_changed,feedback_on&order=relay_index.asc",
  );
  const devices = Array.isArray(deviceRows) ? deviceRows : [];
  const deviceIds = devices.map((item: Record<string, unknown>) => String(item.id || "")).filter(Boolean);
  const rawRelayIndex = Number(body.relay_index);
  const relayIndex = Number.isInteger(rawRelayIndex) ? rawRelayIndex : -1;
  const relay = devices.find((item: Record<string, unknown>) => Number(item.relay_index) === relayIndex);

  if (action === "read_relay") {
    if (relayIndex < 0 || relayIndex >= 4 || !relay) return json({ error: "Relay does not belong to this board" }, 404);
    return json({ ok: true, is_on: Boolean(relay.is_on), last_changed: relay.last_changed || null });
  }

  if (action === "set_relay") {
    if (relayIndex < 0 || relayIndex >= 4 || !relay || typeof body.state !== "boolean") {
      return json({ error: "A valid board relay and explicit boolean state are required" }, 400);
    }
    const rows = await rest(
      "devices?id=eq." + encodeURIComponent(String(relay.id)) +
        "&board_id=eq." + encodeURIComponent(boardId) +
        "&user_id=eq." + encodeURIComponent(userId) + "&select=id,is_on,last_changed",
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ is_on: body.state, last_changed: new Date().toISOString() }),
      },
    );
    if (!Array.isArray(rows) || !rows.length) return json({ error: "Relay update was not saved" }, 409);
    return json({ ok: true, is_on: Boolean(rows[0].is_on), last_changed: rows[0].last_changed || null });
  }

  if (action === "set_feedback") {
    if (relayIndex < 0 || relayIndex >= 4 || !relay || typeof body.state !== "boolean") {
      return json({ error: "A valid board relay and explicit feedback value are required" }, 400);
    }
    const rows = await rest(
      "devices?id=eq." + encodeURIComponent(String(relay.id)) +
        "&board_id=eq." + encodeURIComponent(boardId) +
        "&user_id=eq." + encodeURIComponent(userId) + "&select=id,feedback_on",
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ feedback_on: body.state }),
      },
    );
    if (!Array.isArray(rows) || !rows.length) return json({ error: "Feedback update was not saved" }, 409);
    return json({ ok: true, feedback_on: Boolean(rows[0].feedback_on) });
  }

  if (action === "poll_alarms") {
    if (!deviceIds.length) return json({ ok: true, alarms: [] });
    const idFilter = "in.(" + deviceIds.map((id) => encodeURIComponent(id)).join(",") + ")";
    const rows = await rest(
      "alarms?user_id=eq." + encodeURIComponent(userId) +
        "&device_id=" + idFilter + "&fired=eq.false" +
        "&select=id,device_id,trigger_at,action,fired&order=trigger_at.asc",
    );
    return json({ ok: true, alarms: Array.isArray(rows) ? rows : [] });
  }

  if (action === "poll_schedules") {
    if (!deviceIds.length) return json({ ok: true, schedules: [] });
    const idFilter = "in.(" + deviceIds.map((id) => encodeURIComponent(id)).join(",") + ")";
    const rows = await rest(
      "schedules?user_id=eq." + encodeURIComponent(userId) +
        "&device_id=" + idFilter + "&enabled=eq.true" +
        "&select=id,device_id,time,days,action,enabled&order=time.asc",
    );
    return json({ ok: true, schedules: Array.isArray(rows) ? rows : [] });
  }

  if (action === "claim_alarm") {
    const alarmId = String(body.alarm_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(alarmId)) {
      return json({ error: "A valid alarm ID is required" }, 400);
    }
    if (!deviceIds.length) return json({ ok: true, claimed: false });
    const idFilter = "in.(" + deviceIds.map((id) => encodeURIComponent(id)).join(",") + ")";
    const rows = await rest(
      "alarms?id=eq." + encodeURIComponent(alarmId) +
        "&user_id=eq." + encodeURIComponent(userId) +
        "&device_id=" + idFilter + "&fired=eq.false&select=id",
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ fired: true }),
      },
    );
    return json({ ok: true, claimed: Array.isArray(rows) && rows.length > 0 });
  }

  if (action === "log_activity") {
    if (relayIndex < 0 || relayIndex >= 4 || !relay || typeof body.state !== "boolean") {
      return json({ error: "Activity log target is invalid for this board" }, 400);
    }
    const triggeredBy = String(body.triggered_by || "ESP32").slice(0, 80);
    await rest("activity_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        device_id: relay.id,
        device_name: relay.name || "Device " + String(relayIndex + 1),
        action: body.state ? "turned ON" : "turned OFF",
        triggered_by: triggeredBy,
      }),
    });
    return json({ ok: true });
  }

  if (action === "heartbeat") {
    const now = new Date().toISOString();
    await rest(
      "device_runtime_configs?board_id=eq." + encodeURIComponent(boardId) +
        "&user_id=eq." + encodeURIComponent(userId),
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_seen_at: now, last_direct_seen_at: now, updated_at: now }),
      },
    );
    await rest(
      "boards?id=eq." + encodeURIComponent(boardId) + "&user_id=eq." + encodeURIComponent(userId),
      { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_seen: now }) },
    );
    return json({ ok: true });
  }

  return null;
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
    const dataAction = await handleDeviceDataAction(device, body);
    if (dataAction) return dataAction;
    return json({ error: "Unsupported device action" }, 400);
  } catch (error) {
    console.error("device-agent failed", error);
    return json({ error: error instanceof Error ? error.message : "Device request failed" }, 500);
  }
});
