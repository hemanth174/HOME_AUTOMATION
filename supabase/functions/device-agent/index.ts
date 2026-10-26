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
  let configuration: Record<string, unknown> | null = null;
  let meshConfigurations: Record<string, unknown>[] = [];
  let commands: Record<string, unknown>[] = Array.isArray(snapshot.commands) ? snapshot.commands : [];
  const reportedVersion = Number(body.applied_config_version ?? config.applied_config_version ?? 0);
  const currentVersion = Number(config.config_version ?? 0);
  const ssid = String(config.wifi_ssid || "");
  const deliveryStatus = String(config.config_update_status || "");

  if (currentVersion > reportedVersion && ssid.length > 0 &&
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
        "device_runtime_configs?board_id=eq." + encodeURIComponent(boardId),
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ config_update_status: "sending" }) },
      );
      await writeConfigEvent(config, "sending", "ESP32 checked in and received the pending configuration.", "device");
    }
  }

  const isMeshGateway = body.mesh_gateway === true;
  let knownBoards: Record<string, string> = { [String(board.board_identifier)]: boardId };
  if (isMeshGateway && userId && boardId) {
    const userBoards = await rest(
      "boards?user_id=eq." + encodeURIComponent(userId) + "&select=id,board_identifier",
    );
    for (const item of Array.isArray(userBoards) ? userBoards : []) {
      if (typeof item.board_identifier === "string" && isValidBoardIdentifier(item.board_identifier)) {
        knownBoards[item.board_identifier] = String(item.id);
      }
    }

    // Keep member-board presence fresh only when the leader reports a live mesh
    // heartbeat. This lets the admin distinguish a reachable mesh member from
    // a board that has not checked in recently.
    const meshNodes = Array.isArray(body.mesh_nodes) ? body.mesh_nodes.slice(0, 8) : [];
    const liveBoardIds: string[] = [];
    for (const node of meshNodes) {
      if (!node || !isValidBoardIdentifier(node.node_id)) continue;
      const lastSeenMs = Number(node.last_seen_ms);
      if (!Number.isFinite(lastSeenMs) || lastSeenMs < 0 || lastSeenMs > 45000) continue;
      const memberBoardId = knownBoards[String(node.node_id)];
      if (memberBoardId && memberBoardId !== boardId) liveBoardIds.push(memberBoardId);
    }
    const uniqueLiveIds = Array.from(new Set(liveBoardIds));
    if (uniqueLiveIds.length) {
      const idFilter = "in.(" + uniqueLiveIds.map((id) => encodeURIComponent(id)).join(",") + ")";
      const runtimeRows = await rest(
        "device_runtime_configs?board_id=" + idFilter + "&user_id=eq." + encodeURIComponent(userId) + "&select=board_id,device_token_hash",
      );
      const enrolledIds = Array.from(new Set(
        (Array.isArray(runtimeRows) ? runtimeRows : [])
          .filter((row) => typeof row.device_token_hash === "string" && row.device_token_hash.length > 0)
          .map((row) => String(row.board_id)),
      ));
      if (enrolledIds.length) {
        const now = new Date().toISOString();
        const idList = "in.(" + enrolledIds.map((id) => encodeURIComponent(id)).join(",") + ")";
        await rest(
          "device_runtime_configs?board_id=" + idList + "&user_id=eq." + encodeURIComponent(userId),
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ last_seen_at: now, first_seen_at: now }),
          },
        );
        await rest(
          "boards?id=" + idList + "&user_id=eq." + encodeURIComponent(userId),
          { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_seen: now }) },
        );
      }
    }

    // Only a leader/gateway can receive its customer's other board commands and
    // pending configuration. Directly connected member boards see only their
    // own board-scoped records.
    const fleetCommandRows = await rest(
      "device_commands?user_id=eq." + encodeURIComponent(userId) +
      "&status=eq.pending&select=id,board_id,command_type,requested_at&order=requested_at.asc&limit=64",
    );
    commands = (Array.isArray(fleetCommandRows) ? fleetCommandRows : []).map((item: Record<string, unknown>) => ({
      id: item.id,
      board_id: item.board_id,
      board_identifier: Object.keys(knownBoards).find((id) => knownBoards[id] === String(item.board_id)) || "",
      command_type: item.command_type,
      requested_at: item.requested_at,
    }));

    const fleetConfigs = await rest(
      "device_runtime_configs?user_id=eq." + encodeURIComponent(userId) +
      "&board_id=neq." + encodeURIComponent(boardId) +
      "&device_token_hash=not.is.null" +
      "&config_update_status=in.(pending,sending)" +
      "&select=board_id,user_id,wifi_ssid,wifi_security,encrypted_wifi_password,config_version,applied_config_version,config_update_status&order=updated_at.asc&limit=64",
    );
    for (const memberConfig of Array.isArray(fleetConfigs) ? fleetConfigs : []) {
      const memberBoardId = String(memberConfig.board_id || "");
      const memberIdentifier = Object.keys(knownBoards).find((id) => knownBoards[id] === memberBoardId);
      const memberSsid = String(memberConfig.wifi_ssid || "");
      const memberVersion = Number(memberConfig.config_version || 0);
      const memberAppliedVersion = Number(memberConfig.applied_config_version || 0);
      const memberStatus = String(memberConfig.config_update_status || "");
      if (!memberIdentifier || !memberSsid || memberVersion <= memberAppliedVersion ||
          !["pending", "sending"].includes(memberStatus)) continue;
      let memberPassword = "";
      if (memberConfig.wifi_security === "wpa2_psk") {
        if (!memberConfig.encrypted_wifi_password) continue;
        memberPassword = await decryptProvisioningValue(String(memberConfig.encrypted_wifi_password));
      }
      meshConfigurations.push({
        board_id: memberBoardId,
        board_identifier: memberIdentifier,
        version: memberVersion,
        wifi_ssid: memberSsid,
        wifi_security: memberConfig.wifi_security,
        wifi_password: memberPassword,
      });
      if (memberStatus === "pending") {
        await rest(
          "device_runtime_configs?board_id=eq." + encodeURIComponent(memberBoardId) +
          "&user_id=eq." + encodeURIComponent(userId),
          { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ config_update_status: "sending" }) },
        );
        await writeConfigEvent(memberConfig, "sending", "Gateway queued the configuration for delivery to this mesh member.", "mesh_gateway");
      }
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
    devices: Array.isArray(snapshot.devices) ? snapshot.devices : [],
    alarms: Array.isArray(snapshot.alarms) ? snapshot.alarms : [],
    schedules: Array.isArray(snapshot.schedules) ? snapshot.schedules : [],
    config: configuration,
    commands,
    mesh_configs: meshConfigurations,
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
    const dataAction = await handleDeviceDataAction(device, body);
    if (dataAction) return dataAction;
    return json({ error: "Unsupported device action" }, 400);
  } catch (error) {
    console.error("device-agent failed", error);
    return json({ error: error instanceof Error ? error.message : "Device request failed" }, 500);
  }
});
