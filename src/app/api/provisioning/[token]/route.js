import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';
import { decryptProvisioningValue, hashProvisioningToken } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const token = (await params).token;
  const admin = getAdminSupabase();
  if (!admin || !token) return NextResponse.json({ error: 'Setup link is unavailable' }, { status: 503 });

  const { data: rows, error } = await admin.from('provisioning_records')
    .select('*, order_trackings(full_name, email)')
    .eq('setup_token_hash', hashProvisioningToken(token))
    .is('revoked_at', null)
    .is('setup_token_used_at', null)
    .gt('setup_token_expires_at', new Date().toISOString())
    .limit(1);
  const record = rows?.[0];
  if (error || !record) return NextResponse.json({ error: 'This setup link is invalid, expired, or already used' }, { status: 404 });

  const { data: approval, error: approvalError } = await admin.from('account_approval_requests')
    .select('account_status, admin_one_approved_at, admin_two_approved_at')
    .eq('user_id', record.user_id).limit(1);
  if (approvalError || approval?.[0]?.account_status !== 'approved' ||
      !approval[0].admin_one_approved_at || !approval[0].admin_two_approved_at) {
    return NextResponse.json({ error: 'Account approval is not complete' }, { status: 403 });
  }

  let password, deviceToken, firmware;
  try {
    password = decryptProvisioningValue(record.encrypted_password);
    if (!record.encrypted_device_token) throw new Error('Provisioning record is missing a device-agent token; regenerate it after applying the device-management migration.');
    deviceToken = decryptProvisioningValue(record.encrypted_device_token);
    firmware = await buildFirmware(record, password, deviceToken);
  } catch (error) {
    console.error('Secure provisioning generation failed:', error);
    return NextResponse.json({ error: 'Could not generate secure device firmware. Check the firmware template and provisioning secrets.' }, { status: 503 });
  }

  const usedAt = new Date().toISOString();
  const { data: consumed, error: consumeError } = await admin.from('provisioning_records')
    .update({ setup_token_used_at: usedAt })
    .eq('id', record.id)
    .is('setup_token_used_at', null)
    .select('id');
  if (consumeError || !consumed?.length) {
    return NextResponse.json({ error: 'This setup link has already been used or is no longer available' }, { status: 409 });
  }

  await admin.from('approval_audit_log').insert({
    user_id: record.user_id,
    order_id: record.order_id,
    actor_email: record.order_trackings?.email || 'customer',
    action: 'provisioning_downloaded',
    metadata: { provisioning_id: record.id, board_id: record.board_id || null },
  });

  return NextResponse.json({
    boardName: record.board_name,
    boardIdentifier: record.board_identifier,
    password,
    firmware,
    fileName: record.board_identifier + '.ino',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

async function buildFirmware(record, password, deviceToken) {
  const templateUrl = process.env.ESP32_FIRMWARE_TEMPLATE_URL ||
    'https://raw.githubusercontent.com/hemanth174/HOME_AUTOMATION/main/esp32.cpp';
  const response = await fetch(templateUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Firmware template returned HTTP ' + response.status);
  let source = await response.text();

  const requiredAnchors = [
    'const char* BOARD_IDENTIFIER = "',
    'const char* MESH_SSID = "',
    'const char* MESH_PASS = "',
    'const char* DEVICE_AGENT_URL = "',
    'const char* DEVICE_TOKEN = "',
  ];
  if (!requiredAnchors.every((anchor) => source.includes(anchor))) {
    throw new Error('Firmware template is missing runtime configuration/device-agent placeholders');
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  if (!supabaseUrl.startsWith('https://')) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured as HTTPS');
  const deviceAgentUrl = supabaseUrl + '/functions/v1/device-agent';
  const escapeCString = (value) => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, '');

  source = source
    .replace(/const char\* BOARD_IDENTIFIER = "[^"]*";/, 'const char* BOARD_IDENTIFIER = "' + escapeCString(record.board_identifier) + '";')
    .replace(/const char\* MESH_SSID = "[^"]*";/, 'const char* MESH_SSID = "' + escapeCString(record.board_name) + '";')
    .replace(/const char\* MESH_PASS = "[^"]*";/, 'const char* MESH_PASS = "' + escapeCString(password) + '";')
    .replace(/const char\* DEVICE_AGENT_URL = "[^"]*";/, 'const char* DEVICE_AGENT_URL = "' + escapeCString(deviceAgentUrl) + '";')
    .replace(/const char\* DEVICE_TOKEN = "[^"]*";/, 'const char* DEVICE_TOKEN = "' + escapeCString(deviceToken) + '";');
  return source;
}
