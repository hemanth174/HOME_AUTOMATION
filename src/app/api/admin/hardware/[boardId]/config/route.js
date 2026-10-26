import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { encryptProvisioningValue } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const boardId = (await params).boardId;
  const body = await request.json().catch(() => ({}));
  const wifiSSID = typeof body.wifiSSID === 'string' ? body.wifiSSID.trim() : '';
  const wifiSecurity = body.wifiSecurity;
  const newPassword = typeof body.wifiPassword === 'string' ? body.wifiPassword : '';
  if (!/^[0-9a-f-]{36}$/i.test(boardId || '')) return NextResponse.json({ error: 'Invalid board identifier' }, { status: 400 });
  if (!wifiSSID || wifiSSID.length > 32) return NextResponse.json({ error: 'Wi-Fi name is required and must be 1–32 characters.' }, { status: 400 });
  if (!['open', 'wpa2_psk'].includes(wifiSecurity)) return NextResponse.json({ error: 'Choose None (Open Network) or WPA2-PSK.' }, { status: 400 });
  if (wifiSecurity === 'wpa2_psk' && newPassword && (newPassword.length < 8 || newPassword.length > 63)) {
    return NextResponse.json({ error: 'WPA2-PSK passwords must be 8–63 characters.' }, { status: 400 });
  }

  const { data: board, error: boardError } = await auth.admin.from('boards')
    .select('id, user_id, name, board_identifier').eq('id', boardId).maybeSingle();
  if (boardError || !board) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });

  const { data: existing, error: configError } = await auth.admin.from('esp32_configurations')
    .select('wifi_security, wifi_password_encrypted, config_version, device_auth_token_hash')
    .eq('board_id', boardId).maybeSingle();
  if (configError) return NextResponse.json({ error: configError.message }, { status: 500 });
  if (!existing?.device_auth_token_hash) {
    return NextResponse.json({
      error: 'This board has not checked in with secure provisioning firmware yet. Install the one-time provisioning firmware before remote updates are enabled.',
      code: 'DEVICE_NOT_PROVISIONED',
    }, { status: 409 });
  }

  let encryptedPassword = existing.wifi_password_encrypted;
  if (wifiSecurity === 'open') encryptedPassword = null;
  else if (newPassword) encryptedPassword = encryptProvisioningValue(newPassword);
  else if (existing.wifi_security !== 'wpa2_psk' || !encryptedPassword) {
    return NextResponse.json({ error: 'Enter the Wi-Fi password for this WPA2 network. Existing passwords are not revealed.' }, { status: 400 });
  }

  const nextVersion = Math.max(1, Number(existing.config_version || 0) + 1);
  const { error: updateError } = await auth.admin.from('esp32_configurations').update({
    wifi_ssid: wifiSSID,
    wifi_security: wifiSecurity,
    wifi_password_encrypted: encryptedPassword,
    config_version: nextVersion,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('board_id', boardId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: command, error: commandError } = await auth.admin.from('esp32_commands').insert({
    board_id: boardId,
    user_id: board.user_id,
    command_type: 'apply_config',
    status: 'queued',
    payload: { config_version: nextVersion },
    requested_by: auth.user.id,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }).select('id, status, created_at').single();
  if (commandError) return NextResponse.json({ error: 'Configuration was saved but the delivery command could not be queued: ' + commandError.message }, { status: 500 });

  await auth.admin.from('approval_audit_log').insert({
    user_id: board.user_id, actor_email: auth.user.email, action: 'esp32_config_update_requested',
    metadata: { board_id: boardId, board_identifier: board.board_identifier, config_version: nextVersion, command_id: command.id },
  });

  return NextResponse.json({ commandId: command.id, status: command.status, configVersion: nextVersion }, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
