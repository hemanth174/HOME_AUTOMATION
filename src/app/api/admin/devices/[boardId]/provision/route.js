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

  let deviceToken = '';
  const reEnrollment = Boolean(existing?.revoked_at);
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
    'const char* MQTT_BROKER_HOST = "',
    'const char* MQTT_BROKER_USERNAME = "',
    'const char* MQTT_BROKER_PASSWORD = "',
    'const uint16_t MQTT_BROKER_PORT = ',
  ];
  if (!requiredAnchors.every((anchor) => source.includes(anchor))) {
    return NextResponse.json({
      error: 'The firmware template does not contain all device-agent and mesh placeholders yet. Deploy the updated firmware template first.',
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
  const mqttBrokerHost = String(process.env.ESP32_MQTT_BROKER_HOST || '').trim();
  const mqttBrokerPort = Number(process.env.ESP32_MQTT_BROKER_PORT || 1883);
  const mqttBrokerUsername = String(process.env.ESP32_MQTT_USERNAME || '').trim();
  const mqttBrokerPassword = String(process.env.ESP32_MQTT_PASSWORD || '');
  if (!Number.isInteger(mqttBrokerPort) || mqttBrokerPort < 1 || mqttBrokerPort > 65535) {
    return NextResponse.json({ error: 'ESP32_MQTT_BROKER_PORT must be a valid TCP port.' }, { status: 503 });
  }
  if (mqttBrokerHost && /^(localhost|127\.|0\.0\.0\.0$|\[?::1\]?$)/i.test(mqttBrokerHost)) {
    return NextResponse.json({ error: 'ESP32_MQTT_BROKER_HOST must be a LAN IP or hostname reachable from the ESP32, not localhost.' }, { status: 503 });
  }
  if (Boolean(mqttBrokerUsername) !== Boolean(mqttBrokerPassword)) {
    return NextResponse.json({ error: 'Set both ESP32_MQTT_USERNAME and ESP32_MQTT_PASSWORD, or leave both empty.' }, { status: 503 });
  }

  source = source
    .replace(/const char\* BOARD_IDENTIFIER = "[^"]*";/, 'const char* BOARD_IDENTIFIER = "' + escapeCString(board.board_identifier) + '";')
    .replace(/const char\* MESH_SSID = "[^"]*";/, 'const char* MESH_SSID = "' + escapeCString(meshSsid) + '";')
    .replace(/const char\* MESH_PASS = "[^"]*";/, 'const char* MESH_PASS = "' + escapeCString(meshPassword) + '";')
    .replace(/const char\* DEVICE_AGENT_URL = "[^"]*";/, 'const char* DEVICE_AGENT_URL = "' + escapeCString(agentUrl) + '";')
    .replace(/const char\* DEVICE_TOKEN = "[^"]*";/, 'const char* DEVICE_TOKEN = "' + deviceToken + '";')
    .replace(/const char\* MQTT_BROKER_HOST = "[^"]*";/, 'const char* MQTT_BROKER_HOST = "' + escapeCString(mqttBrokerHost) + '";')
    .replace(/const uint16_t MQTT_BROKER_PORT = \d+;/, 'const uint16_t MQTT_BROKER_PORT = ' + mqttBrokerPort + ';')
    .replace(/const char\* MQTT_BROKER_USERNAME = "[^"]*";/, 'const char* MQTT_BROKER_USERNAME = "' + escapeCString(mqttBrokerUsername) + '";')
    .replace(/const char\* MQTT_BROKER_PASSWORD = "[^"]*";/, 'const char* MQTT_BROKER_PASSWORD = "' + escapeCString(mqttBrokerPassword) + '";');

  const now = new Date().toISOString();
  const base = reEnrollment ? {
    ...existing,
    wifi_ssid: '',
    wifi_security: 'wpa2_psk',
    encrypted_wifi_password: null,
    config_version: 1,
    applied_config_version: 0,
    applied_wifi_ssid: null,
    applied_wifi_security: null,
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
    board_id: board.id,
    user_id: board.user_id,
    device_token_hash: tokenHash,
    encrypted_device_token: encryptedDeviceToken,
    mesh_ssid: meshSsid,
    encrypted_mesh_password: encryptedMeshPassword,
    config_update_status: existing?.config_update_status || 'unprovisioned',
    revoked_at: null,
    updated_at: now,
  };
  if (reEnrollment) row.config_update_status = 'unprovisioned';
  const { error: saveError } = await auth.admin.from('device_runtime_configs')
    .upsert(row, { onConflict: 'board_id' });
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  const firmwareRegenerated = Boolean(existing?.first_seen_at || existing?.last_seen_at) && !reEnrollment;
  await auth.admin.from('approval_audit_log').insert({
    user_id: board.user_id,
    actor_email: auth.user.email,
    action: firmwareRegenerated ? 'esp32_firmware_regenerated' : 'esp32_device_agent_provisioned',
    metadata: { board_id: board.id, board_identifier: board.board_identifier, mesh_ssid: meshSsid },
  });

  return NextResponse.json({
    firmware: source,
    fileName: board.board_identifier + '-vikatech.ino',
    board: { id: board.id, name: board.name, boardIdentifier: board.board_identifier },
    meshSsid,
    setupUrl: 'http://192.168.4.1/setup',
    requiresFlash: true,
    message: firmwareRegenerated
      ? 'This is the latest firmware for an already-enrolled board. Existing device and mesh credentials were preserved; flash it over USB to apply the update.'
      : 'Flash this firmware once to enroll this board. Future Wi-Fi changes and restart requests can then be delivered remotely.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
