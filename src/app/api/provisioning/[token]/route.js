import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';
import { decryptProvisioningValue, hashProvisioningToken } from '@/lib/provisioningServer';

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
  const firmware = await buildFirmware(record, password);
  await admin.from('provisioning_records').update({ setup_token_used_at: new Date().toISOString() }).eq('id', record.id);
  await admin.from('approval_audit_log').insert({ user_id: record.user_id, order_id: record.order_id, actor_email: record.order_trackings?.email || 'customer', action: 'provisioning_downloaded', metadata: { provisioning_id: record.id } });
  return NextResponse.json({ boardName: record.board_name, boardIdentifier: record.board_identifier, password, firmware, fileName: `${record.board_identifier}.cpp` });
}

async function buildFirmware(record, password) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/esp32.cpp`, { cache: 'no-store' });
  let source = response.ok ? await response.text() : '#include <WiFi.h>\n';
  source = source.replace(/const char\* BOARD_IDENTIFIER = "[^"]*";/, `const char* BOARD_IDENTIFIER = "${record.board_identifier}";`);
  source = source.replace(/const char\* MESH_SSID = "[^"]*";/, `const char* MESH_SSID = "${record.board_name}";`);
  source = source.replace(/const char\* MESH_PASS = "[^"]*";/, `const char* MESH_PASS = "${password}";`);
  return source;
}
