import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/adminServer';
import { decryptProvisioningValue, encryptProvisioningValue, hashProvisioningToken } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { boardId } = await params;
  if (!UUID_RE.test(boardId || '')) return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });

  const { data: board, error: boardError } = await auth.admin.from('boards')
    .select('id, user_id, name, board_identifier').eq('id', boardId).maybeSingle();
  if (boardError || !board) return NextResponse.json({ error: boardError?.message || 'Board not found' }, { status: 404 });

  const { data: existing, error: configError } = await auth.admin.from('device_runtime_configs')
    .select('board_id, user_id, device_token_hash, encrypted_device_token, first_seen_at, last_seen_at, mesh_ssid, encrypted_mesh_password, wifi_ssid, wifi_security, encrypted_wifi_password, config_version, applied_config_version')
    .eq('board_id', boardId).maybeSingle();
  if (configError) return NextResponse.json({ error: configError.message }, { status: 503 });

  let deviceToken = '';
  if (existing?.device_token_hash) {
    if (existing.first_seen_at || existing.last_seen_at) {
      return NextResponse.json({ error: 'This board has already checked in with its device credential. Use the controlled credential-rotation workflow instead of re-enrolling it.' }, { status: 409 });
    }
    if (!existing.encrypted_device_token) {
      return NextResponse.json({ error: 'This board has a legacy device token that cannot be recovered. It needs a controlled credential reset before provisioning.' }, { status: 409 });
    }
    try {
      deviceToken = decryptProvisioningValue(existing.encrypted_device_token);
    } catch {
      return NextResponse.json({ error: 'The stored enrollment token cannot be decrypted. Check PROVISIONING_ENCRYPTION_KEY before retrying.' }, { status: 503 });
    }
  } else {
    deviceToken = crypto.randomBytes(32).toString('base64url');
  }

  // Reuse the installation mesh credentials where possible so newly-added
  // boards belonging to the same customer can join the same local mesh.
  let meshSsid = existing?.mesh_ssid || '';
  let encryptedMeshPassword = existing?.encrypted_mesh_password || null;
  let meshPassword = '';
  if (!meshSsid || !encryptedMeshPassword) {
    const { data: provisioningRows, error: provisioningError } = await auth.admin.from('provisioning_records')
      .select('board_name, encrypted_password')
      .eq('board_id', boardId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (provisioningError) return NextResponse.json({ error: provisioningError.message }, { status: 503 });
    const enrollmentRecord = provisioningRows?.[0];

    if (enrollmentRecord?.board_name && enrollmentRecord?.encrypted_password) {
      meshSsid = enrollmentRecord.board_name;
      encryptedMeshPassword = enrollmentRecord.encrypted_password;
    } else {
      const { data: peerConfigs, error: peerError } = await auth.admin.from('device_runtime_configs')
        .select('mesh_ssid, encrypted_mesh_password')
        .eq('user_id', board.user_id)
        .neq('board_id', boardId)
        .not('encrypted_mesh_password', 'is', null)
        .limit(1);
      if (peerError) return NextResponse.json({ error: peerError.message }, { status: 503 });
      const peer = peerConfigs?.find((item) => item.mesh_ssid && item.encrypted_mesh_password);
      if (peer) {
        meshSsid = peer.mesh_ssid;
        encryptedMeshPassword = peer.encrypted_mesh_password;
      } else {
        meshSsid = 'HOME-' + board.id.replace(/-/g, '').slice(0, 8).toUpperCase();
        meshPassword = 'VT-' + crypto.randomBytes(18).toString('base64url');
        try {
          encryptedMeshPassword = encryptProvisioningValue(meshPassword);
        } catch (error) {
          console.error('Mesh credential encryption configuration error:', error);
          return NextResponse.json({ error: 'Provisioning encryption is not configured securely on the server.' }, { status: 503 });
        }
      }
    }
  }

  if (!meshSsid || meshSsid.length > 32 || !encryptedMeshPassword) {
    return NextResponse.json({ error: 'A valid installation mesh configuration is unavailable.' }, { status: 503 });
  }
  try {
    meshPassword = decryptProvisioningValue(encryptedMeshPassword);
  } catch (error) {
    console.error('Could not decrypt installation mesh password:', error);
    return NextResponse.json({ error: 'The saved mesh password cannot be decrypted. Check PROVISIONING_ENCRYPTION_KEY.' }, { status: 503 });
  }

  const templateUrl = process.env.ESP32_FIRMWARE_TEMPLATE_URL ||
    'https://raw.githubusercontent.com/hemanth174/HOME_AUTOMATION/main/esp32.cpp';
  let source;
  try {
    const response = await fetch(templateUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Firmware template returned HTTP ' + response.status);
    source = await response.text();
  } catch (error) {
    return NextResponse.json({ error: 'Could not load the generic firmware template. No device credentials were changed.' }, { status: 503 });
  }

  const requiredAnchors = [
    'const char* BOARD_IDENTIFIER = "',
    'const char* MESH_SSID = "',
    'const char* MESH_PASS = "',
    'const char* DEVICE_AGENT_URL = "',
    'const char* DEVICE_TOKEN = "',
  ];
  if (!requiredAnchors.every((anchor) => source.includes(anchor))) {
    return NextResponse.json({
      error: 'The firmware template does not contain all device-agent and mesh placeholders yet. Deploy the updated firmware template first.',
    }, { status: 503 });
  }

  let encryptedDeviceToken = existing?.encrypted_device_token || null;
  if (!encryptedDeviceToken) {
    try {
      encryptedDeviceToken = encryptProvisioningValue(deviceToken);
    } catch (error) {
      console.error('Device token encryption configuration error:', error);
      return NextResponse.json({ error: 'Provisioning encryption is not configured securely on the server.' }, { status: 503 });
    }
  }
  const tokenHash = hashProvisioningToken(deviceToken);
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const agentUrl = supabaseUrl + '/functions/v1/device-agent';
  if (!agentUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL must be configured before provisioning.' }, { status: 503 });
  }
  const escapeCString = (value) => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, '');

  source = source
    .replace(/const char\* BOARD_IDENTIFIER = "[^"]*";/, 'const char* BOARD_IDENTIFIER = "' + escapeCString(board.board_identifier) + '";')
    .replace(/const char\* MESH_SSID = "[^"]*";/, 'const char* MESH_SSID = "' + escapeCString(meshSsid) + '";')
    .replace(/const char\* MESH_PASS = "[^"]*";/, 'const char* MESH_PASS = "' + escapeCString(meshPassword) + '";')
    .replace(/const char\* DEVICE_AGENT_URL = "[^"]*";/, 'const char* DEVICE_AGENT_URL = "' + escapeCString(agentUrl) + '";')
    .replace(/const char\* DEVICE_TOKEN = "[^"]*";/, 'const char* DEVICE_TOKEN = "' + deviceToken + '";');

  const now = new Date().toISOString();
  const base = existing || {
    board_id: board.id,
    user_id: board.user_id,
    wifi_ssid: '',
    wifi_security: 'wpa2_psk',
    encrypted_wifi_password: null,
    config_version: 1,
    applied_config_version: 0,
  };
  const row = {
    ...base,
    board_id: board.id,
    user_id: board.user_id,
    device_token_hash: tokenHash,
    encrypted_device_token: encryptedDeviceToken,
    mesh_ssid: meshSsid,
    encrypted_mesh_password: encryptedMeshPassword,
    config_update_status: existing?.wifi_ssid ? 'pending' : 'unprovisioned',
    updated_at: now,
  };
  const { error: saveError } = await auth.admin.from('device_runtime_configs')
    .upsert(row, { onConflict: 'board_id' });
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  await auth.admin.from('approval_audit_log').insert({
    user_id: board.user_id,
    actor_email: auth.user.email,
    action: 'esp32_device_agent_provisioned',
    metadata: { board_id: board.id, board_identifier: board.board_identifier, mesh_ssid: meshSsid },
  });

  return NextResponse.json({
    firmware: source,
    fileName: board.board_identifier + '-vikatech.ino.cpp',
    board: { id: board.id, name: board.name, boardIdentifier: board.board_identifier },
    meshSsid,
    requiresFlash: true,
    message: 'Flash this firmware once to enroll this board. Future Wi-Fi changes and restart requests can then be delivered remotely.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
