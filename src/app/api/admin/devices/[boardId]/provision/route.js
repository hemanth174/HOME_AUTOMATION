import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { requireAdmin } from '@/lib/adminServer';
import { decryptProvisioningValue, encryptProvisioningValue, hashProvisioningToken } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WIFI_SSID_RE = /^[\x20-\x7e]{1,32}$/;
const WIFI_PASSWORD_RE = /^[\x20-\x7e]{8,63}$/;

export async function POST(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { boardId } = await params;
  if (!UUID_RE.test(boardId || '')) return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });

  const { data: board, error: boardError } = await auth.admin.from('boards')
    .select('id, user_id, name, board_identifier').eq('id', boardId).maybeSingle();
  if (boardError || !board) return NextResponse.json({ error: boardError?.message || 'Board not found' }, { status: 404 });

  const { data: existing, error: configError } = await auth.admin.from('device_runtime_configs')
    .select('board_id, user_id, device_token_hash, encrypted_device_token, first_seen_at, last_seen_at, last_direct_seen_at, last_mesh_seen_at, last_boot_id, last_boot_at, mesh_ssid, encrypted_mesh_password, wifi_ssid, wifi_security, encrypted_wifi_password, config_version, applied_config_version, applied_wifi_ssid, applied_wifi_security, config_update_status, revoked_at')
    .eq('board_id', boardId).maybeSingle();
  if (configError) return NextResponse.json({ error: configError.message }, { status: 503 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  body = body || {};

  let deviceToken = '';
  const reEnrollment = Boolean(existing?.revoked_at);
  const isInitialEnrollment = !existing?.first_seen_at || reEnrollment;

  // The local setup page is gone. For first enrollment (and controlled
  // re-enrollment) the customer Wi-Fi is baked into the downloadable firmware.
  const providedWifi = typeof body.wifiSsid === 'string' && body.wifiSsid.trim().length > 0;
  let targetWifiSsid = '';
  let targetWifiSecurity = 'wpa2_psk';
  let targetWifiPassword = '';
  let targetEncryptedWifiPassword = null;
  if (isInitialEnrollment) {
    if (providedWifi) {
      targetWifiSsid = body.wifiSsid.trim();
      targetWifiSecurity = body.wifiSecurity === 'open' ? 'open' : 'wpa2_psk';
      targetWifiPassword = typeof body.wifiPassword === 'string' ? body.wifiPassword : '';
      if (!WIFI_SSID_RE.test(targetWifiSsid)) {
        return NextResponse.json({ error: 'Wi-Fi name is required and must be 1–32 supported printable characters.' }, { status: 400 });
      }
      if (targetWifiSecurity === 'wpa2_psk' && !WIFI_PASSWORD_RE.test(targetWifiPassword)) {
        return NextResponse.json({ error: 'WPA2-PSK passwords must be 8–63 supported printable characters.' }, { status: 400 });
      }
      if (targetWifiSecurity === 'open' && targetWifiPassword.length > 0) {
        return NextResponse.json({ error: 'Open networks must not include a password.' }, { status: 400 });
      }
      if (targetWifiSecurity === 'wpa2_psk') {
        try { targetEncryptedWifiPassword = encryptProvisioningValue(targetWifiPassword); }
        catch (error) {
          console.error('Wi-Fi encryption configuration error:', error);
          return NextResponse.json({ error: 'Provisioning encryption is not configured securely on the server.' }, { status: 503 });
        }
      }
    } else if (existing?.wifi_ssid) {
      targetWifiSsid = String(existing.wifi_ssid).trim();
      targetWifiSecurity = existing.wifi_security === 'open' ? 'open' : 'wpa2_psk';
      targetEncryptedWifiPassword = existing.encrypted_wifi_password || null;
      if (!WIFI_SSID_RE.test(targetWifiSsid)) {
        return NextResponse.json({ error: 'The saved Wi-Fi name is invalid. Enter new Wi-Fi credentials for enrollment.' }, { status: 400 });
      }
      if (targetWifiSecurity === 'wpa2_psk') {
        if (!targetEncryptedWifiPassword) {
          return NextResponse.json({ error: 'A saved Wi-Fi password is unavailable. Enter the Wi-Fi password to generate enrollment firmware.', requiresWifi: true }, { status: 400 });
        }
        try { targetWifiPassword = decryptProvisioningValue(targetEncryptedWifiPassword); }
        catch (error) {
          console.error('Could not decrypt saved Wi-Fi password:', error);
          return NextResponse.json({ error: 'The saved Wi-Fi password cannot be decrypted. Enter the password again.', requiresWifi: true }, { status: 503 });
        }
      }
    } else {
      return NextResponse.json({ error: 'Wi-Fi name and password are required for first enrollment because this firmware no longer serves a local setup page.', requiresWifi: true }, { status: 400 });
    }
  } else {
    // A normal firmware refresh must not silently change Wi-Fi. Bake the saved
    // credentials when they are recoverable; otherwise leave the constants
    // empty and let the ESP32 keep using its NVS cache.
    targetWifiSsid = String(existing?.wifi_ssid || '').trim();
    targetWifiSecurity = existing?.wifi_security === 'open' ? 'open' : 'wpa2_psk';
    targetEncryptedWifiPassword = existing?.encrypted_wifi_password || null;
    if (targetWifiSsid && (targetWifiSecurity === 'open' || targetEncryptedWifiPassword)) {
      if (targetWifiSecurity === 'wpa2_psk') {
        try { targetWifiPassword = decryptProvisioningValue(targetEncryptedWifiPassword); }
        catch {
          targetWifiSsid = '';
          targetWifiPassword = '';
        }
      }
    } else {
      targetWifiSsid = '';
      targetWifiPassword = '';
    }
  }
  if (existing?.device_token_hash && !reEnrollment) {
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

  meshSsid = String(meshSsid || '').trim();
  if (!WIFI_SSID_RE.test(meshSsid) || !encryptedMeshPassword) {
    return NextResponse.json({ error: 'A valid installation mesh configuration is unavailable.' }, { status: 503 });
  }
  try {
    meshPassword = decryptProvisioningValue(encryptedMeshPassword);
  } catch (error) {
    console.error('Could not decrypt installation mesh password:', error);
    return NextResponse.json({ error: 'The saved mesh password cannot be decrypted. Check PROVISIONING_ENCRYPTION_KEY.' }, { status: 503 });
  }
  if (!WIFI_PASSWORD_RE.test(meshPassword)) {
    return NextResponse.json({ error: 'The installation mesh password is not a supported WPA2 passphrase.' }, { status: 503 });
  }

  const templateUrl = process.env.ESP32_FIRMWARE_TEMPLATE_URL || '';
  let source;
  try {
    if (templateUrl) {
      const response = await fetch(templateUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Firmware template returned HTTP ' + response.status);
      source = await response.text();
    } else {
      source = await fs.readFile(path.join(process.cwd(), 'esp32.cpp'), 'utf8');
    }
  } catch (error) {
    console.error('Could not load the generic firmware template:', error);
    return NextResponse.json({ error: 'Could not load the generic firmware template. Set ESP32_FIRMWARE_TEMPLATE_URL or include esp32.cpp in the server deployment. No device credentials were changed.' }, { status: 503 });
  }

  const requiredAnchors = [
    'const char* BOARD_IDENTIFIER = "',
    'const char* MESH_SSID = "',
    'const char* MESH_PASS = "',
    'const char* DEVICE_AGENT_URL = "',
    'const char* DEVICE_TOKEN = "',
    'const char* DISCOVERY_SUPABASE_URL = "',
    'const char* DISCOVERY_SUPABASE_ANON_KEY = "',
    'const char* DEVICE_WS_TOKEN = "',
    'const char* HOME_WIFI_SSID = "',
    'const char* HOME_WIFI_PASSWORD = "',
    'const char* HOME_WIFI_SECURITY = "',
    'const char* HOME_WIFI_SEED = "',
  ];
  if (!requiredAnchors.every((anchor) => source.includes(anchor))) {
    return NextResponse.json({
      error: 'The firmware template does not contain all device-agent, gateway, and mesh placeholders yet. Deploy the updated firmware template first.',
    }, { status: 503 });
  }

  let encryptedDeviceToken = reEnrollment ? null : existing?.encrypted_device_token || null;
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
  const discoverySupabaseUrl = String(
    process.env.ESP32_DISCOVERY_SUPABASE_URL ||
    process.env.MQTT_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  ).trim().replace(/\/$/, '');
  const discoveryAnonKey = String(
    process.env.ESP32_DISCOVERY_ANON_KEY ||
    process.env.MQTT_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  ).trim();
  const deviceWsToken = String(
    process.env.ESP32_DEVICE_WS_TOKEN || process.env.DEVICE_WS_TOKEN || '',
  ).trim();
  if (!discoverySupabaseUrl.startsWith('https://') || !discoveryAnonKey) {
    return NextResponse.json({ error: 'Configure ESP32_DISCOVERY_SUPABASE_URL and ESP32_DISCOVERY_ANON_KEY for app_discovery before provisioning.' }, { status: 503 });
  }
  if (!deviceWsToken) {
    return NextResponse.json({ error: 'Configure ESP32_DEVICE_WS_TOKEN (the custom MQTT backend DEVICE_WS_TOKEN) before provisioning.' }, { status: 503 });
  }

  source = source
    .replace(/const char\* BOARD_IDENTIFIER = "[^"]*";/, 'const char* BOARD_IDENTIFIER = "' + escapeCString(board.board_identifier) + '";')
    .replace(/const char\* MESH_SSID = "[^"]*";/, 'const char* MESH_SSID = "' + escapeCString(meshSsid) + '";')
    .replace(/const char\* MESH_PASS = "[^"]*";/, 'const char* MESH_PASS = "' + escapeCString(meshPassword) + '";')
    .replace(/const char\* DEVICE_AGENT_URL = "[^"]*";/, 'const char* DEVICE_AGENT_URL = "' + escapeCString(agentUrl) + '";')
    .replace(/const char\* DEVICE_TOKEN = "[^"]*";/, 'const char* DEVICE_TOKEN = "' + deviceToken + '";')
    .replace(/const char\* DISCOVERY_SUPABASE_URL = "[^"]*";/, 'const char* DISCOVERY_SUPABASE_URL = "' + escapeCString(discoverySupabaseUrl) + '";')
    .replace(/const char\* DISCOVERY_SUPABASE_ANON_KEY = "[^"]*";/, 'const char* DISCOVERY_SUPABASE_ANON_KEY = "' + escapeCString(discoveryAnonKey) + '";')
    .replace(/const char\* DEVICE_WS_TOKEN = "[^"]*";/, 'const char* DEVICE_WS_TOKEN = "' + escapeCString(deviceWsToken) + '";')
    .replace(/const char\* HOME_WIFI_SSID = "[^"]*";/, 'const char* HOME_WIFI_SSID = "' + escapeCString(targetWifiSsid) + '";')
    .replace(/const char\* HOME_WIFI_PASSWORD = "[^"]*";/, 'const char* HOME_WIFI_PASSWORD = "' + escapeCString(targetWifiSecurity === 'open' ? '' : targetWifiPassword) + '";')
    .replace(/const char\* HOME_WIFI_SECURITY = "[^"]*";/, 'const char* HOME_WIFI_SECURITY = "' + targetWifiSecurity + '";')
    .replace(/const char\* HOME_WIFI_SEED = "[^"]*";/, 'const char* HOME_WIFI_SEED = "' + crypto.randomBytes(16).toString('hex') + '";');

  const now = new Date().toISOString();
  const initialWifiPatch = isInitialEnrollment ? {
    wifi_ssid: targetWifiSsid,
    wifi_security: targetWifiSecurity,
    encrypted_wifi_password: targetEncryptedWifiPassword,
    config_version: 1,
    applied_config_version: 1,
    applied_wifi_ssid: targetWifiSsid,
    applied_wifi_security: targetWifiSecurity,
    config_update_status: 'applied',
    config_requested_at: now,
    config_applied_at: now,
    config_expires_at: null,
    last_error: null,
  } : {};
  const base = reEnrollment ? {
    ...existing,
    first_seen_at: null,
    last_seen_at: null,
    last_direct_seen_at: null,
    last_mesh_seen_at: null,
    last_boot_id: null,
    last_boot_at: null,
  } : existing || {
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
    ...initialWifiPatch,
    board_id: board.id,
    user_id: board.user_id,
    device_token_hash: tokenHash,
    encrypted_device_token: encryptedDeviceToken,
    mesh_ssid: meshSsid,
    encrypted_mesh_password: encryptedMeshPassword,
    config_update_status: initialWifiPatch.config_update_status || existing?.config_update_status || 'unprovisioned',
    revoked_at: null,
    updated_at: now,
  };
  const { error: saveError } = await auth.admin.from('device_runtime_configs')
    .upsert(row, { onConflict: 'board_id' });
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  const firmwareRegenerated = Boolean(existing?.first_seen_at || existing?.last_seen_at) && !reEnrollment;
  await auth.admin.from('approval_audit_log').insert({
    user_id: board.user_id,
    actor_email: auth.user.email,
    action: firmwareRegenerated ? 'esp32_firmware_regenerated' : 'esp32_device_agent_provisioned',
    metadata: { board_id: board.id, board_identifier: board.board_identifier, mesh_ssid: meshSsid, wifi_baked: isInitialEnrollment },
  });

  return NextResponse.json({
    firmware: source,
    fileName: board.board_identifier + '-vikatech.ino',
    board: { id: board.id, name: board.name, boardIdentifier: board.board_identifier },
    wifiSsid: targetWifiSsid,
    gatewayConfigured: true,
    requiresFlash: true,
    message: (firmwareRegenerated
      ? 'This is the latest firmware for an already-enrolled board. Existing device and Wi-Fi credentials were preserved; flash it over USB to apply the update.'
      : 'Flash this firmware once to enroll this board. The Wi-Fi credentials and WSS gateway credentials are built into the file, so no local setup page or MQTT broker configuration is required. Future Wi-Fi changes can be delivered from the admin panel.'),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
