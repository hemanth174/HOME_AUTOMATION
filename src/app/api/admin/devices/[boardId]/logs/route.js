import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function eventTime(value) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function GET(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { boardId } = await params;
  if (!UUID_RE.test(boardId || '')) {
    return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });
  }

  const { data: board, error: boardError } = await auth.admin
    .from('boards')
    .select('id, user_id, name, board_identifier, devices(id, name, relay_index)')
    .eq('id', boardId)
    .maybeSingle();

  if (boardError) {
    return NextResponse.json({
      error: boardError.message,
      migrationRequired: /column .* does not exist|schema cache/i.test(boardError.message),
    }, { status: 503 });
  }
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

  const relayDevices = (board.devices || []).slice().sort((a, b) => a.relay_index - b.relay_index);
  const deviceIds = relayDevices.map((device) => device.id);
  const [configResult, commandsResult, runtimeResult, activitiesResult, auditResult] = await Promise.all([
    auth.admin
      .from('device_config_events')
      .select('id, config_version, status, message, created_by, created_at')
      .eq('board_id', board.id)
      .order('created_at', { ascending: false })
      .limit(100),
    auth.admin
      .from('device_commands')
      .select('id, command_type, status, requested_at, accepted_at, completed_at, expires_at, last_error, result, requested_by')
      .eq('board_id', board.id)
      .order('requested_at', { ascending: false })
      .limit(100),
    auth.admin
      .from('device_runtime_configs')
      .select('config_version, applied_config_version, config_update_status, last_seen_at, last_direct_seen_at, last_mesh_seen_at, last_boot_id, last_boot_at, last_uptime_ms, last_ip, last_error, wifi_ssid, applied_wifi_ssid, wifi_security, applied_wifi_security')
      .eq('board_id', board.id)
      .maybeSingle(),
    deviceIds.length
      ? auth.admin
          .from('activity_logs')
          .select('id, device_id, device_name, action, triggered_by, created_at')
          .eq('user_id', board.user_id)
          .in('device_id', deviceIds)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    auth.admin
      .from('approval_audit_log')
      .select('id, actor_email, action, metadata, created_at')
      .eq('user_id', board.user_id)
      .in('action', [
        'esp32_restart_requested',
        'esp32_config_update_requested',
        'esp32_secure_firmware_generated',
        'esp32_device_credential_revoked',
      ])
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const failedQuery = [
    configResult.error,
    commandsResult.error,
    runtimeResult.error,
    activitiesResult.error,
    auditResult.error,
  ].find(Boolean);
  if (failedQuery) {
    const migrationRequired = /device_config_events|device_commands|device_runtime_configs|column .* does not exist|schema cache/i.test(failedQuery.message || '');
    return NextResponse.json({
      error: failedQuery.message || 'Could not load device logs',
      migrationRequired,
      hint: migrationRequired
        ? 'Apply supabase/device_management.sql in the Supabase SQL Editor, then refresh this page.'
        : 'Refresh the page. If the problem persists, check the admin API logs.',
    }, { status: 503 });
  }

  const events = [];
  for (const item of configResult.data || []) {
    events.push({
      id: 'config-' + item.id,
      category: 'configuration',
      title: 'Configuration ' + String(item.status || 'updated').replaceAll('_', ' '),
      message: item.message || ('Configuration version ' + item.config_version),
      status: item.status || 'info',
      createdAt: item.created_at,
      source: item.created_by || 'device',
      configVersion: item.config_version,
    });
  }

  for (const item of commandsResult.data || []) {
    const status = item.status || 'unknown';
    const commandType = String(item.command_type || 'device command').replaceAll('_', ' ');
    const resultMessage = item.last_error || item.result?.message || '';
    events.push({
      id: 'command-' + item.id,
      category: 'command',
      title: commandType.charAt(0).toUpperCase() + commandType.slice(1) + ' ' + status,
      message: resultMessage || ('Command status: ' + status),
      status,
      createdAt: item.completed_at || item.accepted_at || item.requested_at,
      source: 'admin command queue',
      commandId: item.id,
      expiresAt: item.expires_at,
    });
  }

  const deviceNameById = new Map(relayDevices.map((device) => [device.id, device.name || 'Relay ' + String(device.relay_index + 1)]));
  for (const item of activitiesResult.data || []) {
    events.push({
      id: 'activity-' + item.id,
      category: 'relay',
      title: (item.device_name || deviceNameById.get(item.device_id) || 'Device') + ': ' + (item.action || 'state changed'),
      message: item.triggered_by ? 'Triggered by ' + item.triggered_by : 'Recorded device activity',
      status: 'recorded',
      createdAt: item.created_at,
      source: 'activity logs',
    });
  }

  for (const item of auditResult.data || []) {
    if (item.metadata?.board_id !== board.id) continue;
    events.push({
      id: 'admin-' + item.id,
      category: 'admin',
      title: String(item.action || 'Admin action').replaceAll('_', ' '),
      message: item.actor_email ? 'Requested by ' + item.actor_email : 'Administrative action recorded',
      status: 'recorded',
      createdAt: item.created_at,
      source: 'admin audit log',
      metadata: {
        commandId: item.metadata?.command_id || null,
        configVersion: item.metadata?.config_version || null,
      },
    });
  }

  events.sort((a, b) => eventTime(b.createdAt) - eventTime(a.createdAt));
  const runtime = runtimeResult.data || null;

  return NextResponse.json({
    board: {
      id: board.id,
      name: board.name,
      boardIdentifier: board.board_identifier,
      relays: relayDevices.map((device) => ({
        id: device.id,
        name: device.name || 'Relay ' + String(device.relay_index + 1),
        relayIndex: device.relay_index,
      })),
    },
    runtime: runtime ? {
      desiredVersion: runtime.config_version,
      appliedVersion: runtime.applied_config_version,
      configStatus: runtime.config_update_status,
      lastSeenAt: runtime.last_seen_at,
      lastDirectSeenAt: runtime.last_direct_seen_at,
      lastMeshSeenAt: runtime.last_mesh_seen_at,
      lastBootId: runtime.last_boot_id,
      lastBootAt: runtime.last_boot_at,
      uptimeMs: runtime.last_uptime_ms,
      lastIp: runtime.last_ip,
      lastError: runtime.last_error,
      wifiName: runtime.applied_wifi_ssid || runtime.wifi_ssid || '',
      wifiSecurity: runtime.applied_wifi_security || runtime.wifi_security || 'wpa2_psk',
    } : null,
    events: events.slice(0, 250),
    fetchedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
