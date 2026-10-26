import { NextResponse } from 'next/server';
import { authenticateEsp32 } from '@/lib/esp32DeviceAuth';
import { encryptProvisioningValue } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await authenticateEsp32(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  const wifiSSID = typeof body.wifiSSID === 'string' ? body.wifiSSID.trim() : '';
  const wifiSecurity = body.wifiSecurity === 'open' ? 'open' : 'wpa2_psk';
  const configVersion = Math.max(1, Math.min(2147483647, Number(body.configVersion) || 1));
  const bootId = typeof body.bootId === 'string' ? body.bootId.slice(0, 100) : '';
  if (!wifiSSID || wifiSSID.length > 32 || !bootId) {
    return NextResponse.json({ error: 'Valid Wi-Fi name and boot identifier are required' }, { status: 400 });
  }

  const { data: existing, error: readError } = await auth.admin.from('esp32_configurations')
    .select('id, config_version, last_boot_id, wifi_password_encrypted, wifi_security')
    .eq('board_id', auth.board.id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const now = new Date().toISOString();
  const currentWifiPassword = typeof body.wifiPassword === 'string' ? body.wifiPassword : '';
  const insertPassword = wifiSecurity === 'wpa2_psk' && currentWifiPassword
    ? encryptProvisioningValue(currentWifiPassword)
    : null;

  if (!existing) {
    const { error: insertError } = await auth.admin.from('esp32_configurations').insert({
      board_id: auth.board.id,
      user_id: auth.board.user_id,
      board_identifier: auth.board.board_identifier,
      device_auth_token_hash: auth.tokenHash,
      wifi_ssid: wifiSSID,
      wifi_security: wifiSecurity,
      wifi_password_encrypted: insertPassword,
      config_version: configVersion,
      last_applied_config_version: configVersion,
      device_online: true,
      last_seen_at: now,
      last_boot_at: now,
      last_boot_id: bootId,
      last_ip: typeof body.ip === 'string' ? body.ip.slice(0, 64) : null,
      last_error: null,
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  } else {
    const bootChanged = existing.last_boot_id !== bootId;
    const update = {
      device_online: true,
      last_seen_at: now,
      last_boot_id: bootId,
      last_ip: typeof body.ip === 'string' ? body.ip.slice(0, 64) : null,
      last_applied_config_version: Math.max(0, Number(body.configVersion) || 0),
      last_error: typeof body.lastError === 'string' && body.lastError ? body.lastError.slice(0, 300) : null,
      updated_at: now,
    };
    if (bootChanged) update.last_boot_at = now;
    const { error: updateError } = await auth.admin.from('esp32_configurations').update(update).eq('board_id', auth.board.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (bootChanged) {
      await auth.admin.from('esp32_commands').update({
        status: 'completed',
        completed_at: now,
        result: { message: 'ESP32 boot was observed after the command.' },
      }).eq('board_id', auth.board.id).eq('command_type', 'restart').eq('status', 'accepted').lt('created_at', now);
    }
  }

  const { data: config } = await auth.admin.from('esp32_configurations')
    .select('config_version, last_applied_config_version').eq('board_id', auth.board.id).maybeSingle();
  return NextResponse.json({
    ok: true,
    registered: true,
    configVersion: config?.config_version || configVersion,
    lastAppliedConfigVersion: config?.last_applied_config_version || configVersion,
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
