import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { encryptProvisioningValue } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';
function isOnline(value) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age < 120_000;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadBoardConfig(admin, boardId) {
  const { data: board, error: boardError } = await admin.from('boards')
    .select('id, user_id, name, board_identifier, last_seen')
    .eq('id', boardId).maybeSingle();
  if (boardError || !board) return { error: boardError?.message || 'Board not found', status: 404 };
  const { data: config, error } = await admin.from('device_runtime_configs')
    .select('board_id, user_id, device_token_hash, first_seen_at, wifi_ssid, wifi_security, config_version, applied_config_version, config_update_status, last_seen_at, last_direct_seen_at, last_mesh_seen_at, last_error, encrypted_wifi_password, config_requested_at, config_applied_at')
    .eq('board_id', boardId).maybeSingle();
  if (error) return { error: error.message, status: 503 };
  return { board, config: config || null };
}

export async function GET(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { boardId } = await params;
  if (!UUID_RE.test(boardId || '')) return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });

  const result = await loadBoardConfig(auth.admin, boardId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  const { board, config } = result;
  const { data: events, error: eventsError } = await auth.admin.from('device_config_events')
    .select('id, config_version, status, message, created_by, created_at')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 503 });
  return NextResponse.json({
    board: { id: board.id, name: board.name, boardIdentifier: board.board_identifier },
    provisioned: Boolean(config?.first_seen_at),
    events: events || [],
    config: config ? {
      wifiSsid: config.wifi_ssid,
      wifiSecurity: config.wifi_security,
      hasWifiPassword: Boolean(config.encrypted_wifi_password),
      version: config.config_version,
      appliedVersion: config.applied_config_version,
      status: config.config_update_status,
      lastSeenAt: config.last_seen_at || board.last_seen || null,
      directOnline: isOnline(config.last_direct_seen_at),
      meshOnline: isOnline(config.last_mesh_seen_at),
      online: isOnline(config.last_direct_seen_at) || isOnline(config.last_mesh_seen_at) || isOnline(config.last_seen_at || board.last_seen),
      lastError: config.last_error,
      requestedAt: config.config_requested_at,
      appliedAt: config.config_applied_at,
    } : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { boardId } = await params;
  if (!UUID_RE.test(boardId || '')) return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const wifiSsid = typeof body.wifiSsid === 'string' ? body.wifiSsid.trim() : '';
  const wifiSecurity = body.wifiSecurity === 'open' ? 'open' : body.wifiSecurity === 'wpa2_psk' ? 'wpa2_psk' : '';
  const wifiPassword = typeof body.wifiPassword === 'string' ? body.wifiPassword : '';
  if (!wifiSsid || wifiSsid.length > 32 || /[\u0000-\u001f]/.test(wifiSsid)) {
    return NextResponse.json({ error: 'Wi-Fi name is required and must be 1–32 printable characters.' }, { status: 400 });
  }
  if (!wifiSecurity) return NextResponse.json({ error: 'Choose Open Network or WPA2-PSK.' }, { status: 400 });
  const keepExistingPassword = body.keepExistingPassword === true;
  if (wifiSecurity === 'wpa2_psk' && !keepExistingPassword && (wifiPassword.length < 8 || wifiPassword.length > 63)) {
    return NextResponse.json({ error: 'WPA2-PSK passwords must be 8–63 characters, unless you choose to keep the existing password.' }, { status: 400 });
  }
  if (wifiSecurity === 'open' && (wifiPassword.length > 0 || keepExistingPassword)) {
    return NextResponse.json({ error: 'Open networks must not include or retain a password.' }, { status: 400 });
  }

  const loaded = await loadBoardConfig(auth.admin, boardId);
  if (loaded.error) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (!loaded.config?.device_token_hash) {
    return NextResponse.json({
      error: 'This board is not enrolled for remote configuration yet. Prepare and flash the generic device-agent firmware once from the Hardware Fleet tab.',
      requiresProvisioning: true,
    }, { status: 409 });
  }
  if (!isOnline(loaded.config.last_direct_seen_at)) {
    return NextResponse.json({
      error: 'This ESP32 has no recent direct connection to the device agent. Reconnect it to its configured Wi-Fi and wait for a fresh device check-in before changing Wi-Fi settings.',
      code: 'DEVICE_NOT_DIRECTLY_CONNECTED',
    }, { status: 409 });
  }

  let encryptedPassword = null;
  if (wifiSecurity === 'wpa2_psk') {
    if (keepExistingPassword) {
      if (loaded.config.wifi_security !== 'wpa2_psk' || !loaded.config.encrypted_wifi_password) {
        return NextResponse.json({ error: 'There is no saved WPA2 password to retain. Enter the new password.' }, { status: 400 });
      }
      encryptedPassword = loaded.config.encrypted_wifi_password;
    } else {
      try { encryptedPassword = encryptProvisioningValue(wifiPassword); }
      catch (error) {
        console.error('Wi-Fi encryption configuration error:', error);
        return NextResponse.json({ error: 'Secure configuration storage is not configured on the server.' }, { status: 503 });
      }
    }
  }

  const currentVersion = Number(loaded.config.config_version || 0);
  const nextVersion = currentVersion + 1;
  const now = new Date().toISOString();
  const { data: saved, error } = await auth.admin.from('device_runtime_configs')
    .update({
      wifi_ssid: wifiSsid,
      wifi_security: wifiSecurity,
      encrypted_wifi_password: encryptedPassword,
      config_version: nextVersion,
      config_update_status: 'pending',
      last_error: null,
      config_requested_at: now,
      updated_at: now,
    })
    .eq('board_id', boardId)
    .select('board_id, wifi_ssid, wifi_security, config_version, applied_config_version, config_update_status, config_requested_at')
    .single();
  if (error || !saved) return NextResponse.json({ error: error?.message || 'Could not save configuration' }, { status: 500 });

  await auth.admin.from('device_config_events').insert({
    board_id: boardId,
    user_id: loaded.board.user_id,
    config_version: nextVersion,
    status: 'pending',
    message: 'Administrator saved a new Wi-Fi configuration; waiting for the ESP32 to pick it up.',
    created_by: auth.user.email,
  });
  await auth.admin.from('approval_audit_log').insert({
    user_id: loaded.board.user_id,
    actor_email: auth.user.email,
    action: 'esp32_configuration_requested',
    metadata: { board_id: boardId, version: nextVersion, wifi_security: wifiSecurity },
  });

  return NextResponse.json({
    accepted: true,
    boardId,
    version: saved.config_version,
    status: saved.config_update_status,
    message: 'Configuration saved securely. Waiting for the ESP32 to validate and apply it.',
  }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
