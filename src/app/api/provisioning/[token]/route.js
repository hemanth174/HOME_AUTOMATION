import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';
import { decryptProvisioningValue, encryptProvisioningValue, createProvisioningToken, hashProvisioningToken } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const token = (await params).token;
  const admin = getAdminSupabase();
  if (!admin || !token) return NextResponse.json({ error: 'Setup link is unavailable' }, { status: 503 });
  const { data: rows, error } = await admin.from('provisioning_records').select('*, order_trackings(full_name, email)').eq('setup_token_hash', hashProvisioningToken(token)).is('revoked_at', null).is('setup_token_used_at', null).gt('setup_token_expires_at', new Date().toISOString()).limit(1);
  const record = rows?.[0];
  if (error || !record) return NextResponse.json({ error: 'This setup link is invalid, expired, or already used' }, { status: 404 });
  const { data: approval } = await admin.from('account_approval_requests').select('account_status, admin_one_approved_at, admin_two_approved_at').eq('user_id', record.user_id).limit(1);
  if (approval?.[0]?.account_status !== 'approved' || !approval[0].admin_one_approved_at || !approval[0].admin_two_approved_at) return NextResponse.json({ error: 'Account approval is not complete' }, { status: 403 });
  const password = decryptProvisioningValue(record.encrypted_password);
  let deviceAuthToken = '';
  if (record.encrypted_device_auth_token && record.device_auth_token_hash) {
    deviceAuthToken = decryptProvisioningValue(record.encrypted_device_auth_token);
  } else {
    // Upgrade older pending provisioning records during their one-time setup download.
    deviceAuthToken = createProvisioningToken();
    const { error: tokenError } = await admin.from('provisioning_records').update({
      device_auth_token_hash: hashProvisioningToken(deviceAuthToken),
      encrypted_device_auth_token: encryptProvisioningValue(deviceAuthToken),
    }).eq('id', record.id).is('device_auth_token_hash', null);
    if (tokenError) return NextResponse.json({ error: 'Could not secure the board credentials. Please contact VikaTech support.' }, { status: 500 });
  }
  const firmware = await buildFirmware(record, password, deviceAuthToken);
  if (!firmware) return NextResponse.json({ error: 'Firmware source unavailable; no setup file was generated. Please retry after firmware source is restored.' }, { status: 503 });
  const { error: usedError } = await admin.from('provisioning_records').update({ setup_token_used_at: new Date().toISOString() }).eq('id', record.id).is('setup_token_used_at', null);
  if (usedError) return NextResponse.json({ error: 'Could not finalize the one-time setup token. Please contact VikaTech support.' }, { status: 500 });
  await admin.from('approval_audit_log').insert({ user_id: record.user_id, order_id: record.order_id, actor_email: record.order_trackings?.email || 'customer', action: 'provisioning_downloaded', metadata: { provisioning_id: record.id } });
  return NextResponse.json({ boardName: record.board_name, boardIdentifier: record.board_identifier, password, firmware, fileName: `${record.board_identifier}.cpp` }, { headers: { 'Cache-Control': 'no-store, private' } });
}

async function buildFirmware(record, password, deviceAuthToken) {
  const sourceUrl = process.env.ESP32_FIRMWARE_SOURCE_URL ||
    'https://raw.githubusercontent.com/hemanth174/HOME_AUTOMATION/main/esp32.cpp';
  let response;
  try {
    response = await fetch(sourceUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let source = await response.text();
  const requiredMarkers = [
    'const char* BOARD_IDENTIFIER =',
    'const char* MESH_SSID =',
    'const char* MESH_PASS =',
    'const char* DEVICE_AUTH_TOKEN =',
  ];
  if (requiredMarkers.some((marker) => !source.includes(marker))) return null;

  const cppString = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  source = source.replace(/const char\* BOARD_IDENTIFIER = "[^"]*";/,
    `const char* BOARD_IDENTIFIER = "${cppString(record.board_identifier)}";`);
  source = source.replace(/const char\* MESH_SSID = "[^"]*";/,
    `const char* MESH_SSID = "${cppString(record.board_name)}";`);
  source = source.replace(/const char\* MESH_PASS = "[^"]*";/,
    `const char* MESH_PASS = "${cppString(password)}";`);
  source = source.replace(/const char\* DEVICE_AUTH_TOKEN = "[^"]*";/,
    `const char* DEVICE_AUTH_TOKEN = "${cppString(deviceAuthToken)}";`);
  return source;
}
