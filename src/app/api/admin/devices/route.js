import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const timestamp = new Date(lastSeenAt).getTime();
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age < 120_000;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: boards, error } = await auth.admin
    .from('boards')
    .select('id, name, board_identifier, user_id, created_at, last_seen, hardware_model, devices(id, name, relay_index, is_on), device_runtime_configs(board_id, config_version, applied_config_version, device_token_hash, first_seen_at, config_update_status, config_expires_at, last_seen_at, last_direct_seen_at, last_mesh_seen_at, last_error, wifi_ssid, wifi_security, applied_wifi_ssid, applied_wifi_security, last_boot_id, last_boot_at, last_uptime_ms, last_ip, revoked_at, config_requested_at, config_applied_at)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({
      error: error.message,
      migrationRequired: /device_runtime_configs|column .* does not exist|schema cache/i.test(error.message),
    }, { status: 503 });
  }

  const boardIds = (boards || []).map((board) => board.id);
  if (!boardIds.length) {
    return NextResponse.json({ devices: [], fetchedAt: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const [usersResult, commandsResult] = await Promise.all([
    auth.admin.auth.admin.listUsers({ perPage: 1000 }),
    auth.admin.from('device_commands')
      .select('id, board_id, command_type, status, requested_at, accepted_at, completed_at, expires_at, last_error')
      .in('board_id', boardIds)
      .order('requested_at', { ascending: false })
      .limit(1000),
  ]);
  const usersData = usersResult.data;
  const usersError = usersResult.error;
  if (usersError) return NextResponse.json({ error: 'Could not resolve device owners' }, { status: 503 });
  if (commandsResult.error) return NextResponse.json({ error: commandsResult.error.message }, { status: 503 });
  const emailById = new Map((usersData?.users || []).map((user) => [user.id, user.email || 'Unknown user']));
  const latestCommandByBoard = new Map();
  for (const command of commandsResult.data || []) {
    if (!latestCommandByBoard.has(command.board_id)) latestCommandByBoard.set(command.board_id, command);
  }

  const result = (boards || []).map((board) => {
    const config = Array.isArray(board.device_runtime_configs)
      ? board.device_runtime_configs[0] || null
      : board.device_runtime_configs || null;
    const lastSeenAt = config?.last_seen_at || board.last_seen || null;
    const directOnline = isOnline(config?.last_direct_seen_at);
    const meshOnline = isOnline(config?.last_mesh_seen_at);
    return {
      id: board.id,
      name: board.name,
      boardIdentifier: board.board_identifier,
      userId: board.user_id,
      userEmail: emailById.get(board.user_id) || 'Unknown user',
      databaseBoardId: board.id,
      createdAt: board.created_at,
      hardwareModel: board.hardware_model || 'ESP32-4CH',
      devices: (board.devices || []).slice().sort((a, b) => a.relay_index - b.relay_index),
      provisioned: Boolean(config?.first_seen_at && config?.device_token_hash && !config?.revoked_at),
      credentialRevoked: Boolean(config?.revoked_at),
      latestCommand: latestCommandByBoard.get(board.id) || null,
      config: config ? {
        version: config.config_version,
        appliedVersion: config.applied_config_version,
        status: config.config_update_status,
        wifiSsid: config.applied_wifi_ssid || config.wifi_ssid,
        wifiSecurity: config.applied_wifi_security || config.wifi_security,
        desiredWifiSsid: config.wifi_ssid,
        desiredWifiSecurity: config.wifi_security,
        desiredVersion: config.config_version,
        lastBootId: config.last_boot_id,
        lastBootAt: config.last_boot_at,
        lastUptimeMs: config.last_uptime_ms,
        lastIp: config.last_ip,
        credentialRevokedAt: config.revoked_at,
        configExpiresAt: config.config_expires_at,
        lastSeenAt,
        directOnline,
        meshOnline,
        online: directOnline || meshOnline || isOnline(lastSeenAt),
        lastError: config.last_error,
        configRequestedAt: config.config_requested_at,
        configAppliedAt: config.config_applied_at,
      } : {
        version: null, appliedVersion: null, status: 'unprovisioned',
        wifiSsid: '', wifiSecurity: 'wpa2_psk', desiredWifiSsid: '', desiredWifiSecurity: 'wpa2_psk', desiredVersion: null,
        lastBootId: null, lastBootAt: null, lastUptimeMs: null, lastIp: null, credentialRevokedAt: null, configExpiresAt: null, lastSeenAt,
        directOnline: false, meshOnline: false, online: isOnline(lastSeenAt),
        lastError: null, configRequestedAt: null, configAppliedAt: null,
      },
    };
  });
  return NextResponse.json({ devices: result, fetchedAt: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
