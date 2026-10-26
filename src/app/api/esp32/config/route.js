import { NextResponse } from 'next/server';
import { authenticateEsp32 } from '@/lib/esp32DeviceAuth';
import { decryptProvisioningValue } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authenticateEsp32(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data: config, error } = await auth.admin.from('esp32_configurations')
    .select('wifi_ssid, wifi_security, wifi_password_encrypted, config_version, last_applied_config_version')
    .eq('board_id', auth.board.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!config) return NextResponse.json({ error: 'Device has not registered yet' }, { status: 409 });

  const requestedVersion = Number(new URL(request.url).searchParams.get('version')) || 0;
  if (requestedVersion >= config.config_version) {
    return NextResponse.json({ changed: false, configVersion: config.config_version }, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  let wifiPassword = '';
  if (config.wifi_security === 'wpa2_psk') {
    if (!config.wifi_password_encrypted) {
      return NextResponse.json({ error: 'WPA2 password is not stored; re-enter it in the admin panel.', code: 'WIFI_SECRET_MISSING' }, { status: 409 });
    }
    wifiPassword = decryptProvisioningValue(config.wifi_password_encrypted);
  }

  return NextResponse.json({
    changed: true,
    configuration: {
      boardIdentifier: auth.board.board_identifier,
      wifiSSID: config.wifi_ssid,
      wifiSecurity: config.wifi_security,
      wifiPassword,
      configVersion: config.config_version,
    },
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
