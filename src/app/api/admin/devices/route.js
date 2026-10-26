import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const timestamp = new Date(lastSeenAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < 120_000;
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: boards, error } = await auth.admin
    .from('boards')
    .select('id, name, board_identifier, user_id, created_at, last_seen, hardware_model, devices(id, name, relay_index, is_on), device_runtime_configs(board_id, config_version, applied_config_version, config_update_status, last_seen_at, last_error, wifi_ssid, wifi_security, config_requested_at, config_applied_at)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({
      error: error.message,
      migrationRequired: /device_runtime_configs|column .* does not exist|schema cache/i.test(error.message),
    }, { status: 503 });
  }

  const { data: usersData, error: usersError } = await auth.admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) return NextResponse.json({ error: 'Could not resolve device owners' }, { status: 503 });
  const emailById = new Map((usersData?.users || []).map((user) => [user.id, user.email || 'Unknown user']));

  const result = (boards || []).map((board) => {
    const config = Array.isArray(board.device_runtime_configs)
      ? board.device_runtime_configs[0] || null
      : board.device_runtime_configs || null;
    const lastSeenAt = config?.last_seen_at || board.last_seen || null;
    return {
      id: board.id,
      name: board.name,
      boardIdentifier: board.board_identifier,
      userId: board.user_id,
      userEmail: emailById.get(board.user_id) || 'Unknown user',
      createdAt: board.created_at,
      hardwareModel: board.hardware_model || 'ESP32-4CH',
      devices: (board.devices || []).slice().sort((a, b) => a.relay_index - b.relay_index),
      provisioned: Boolean(config?.device_token_hash),
      config: config ? {
        version: config.config_version,
        appliedVersion: config.applied_config_version,
        status: config.config_update_status,
        wifiSsid: config.wifi_ssid,
        wifiSecurity: config.wifi_security,
        lastSeenAt,
        online: isOnline(lastSeenAt),
        lastError: config.last_error,
        configRequestedAt: config.config_requested_at,
        configAppliedAt: config.config_applied_at,
      } : {
        version: null, appliedVersion: null, status: 'unprovisioned',
        wifiSsid: '', wifiSecurity: 'wpa2_psk', lastSeenAt, online: isOnline(lastSeenAt),
        lastError: null, configRequestedAt: null, configAppliedAt: null,
      },
    };
  });
  return NextResponse.json({ devices: result, fetchedAt: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
