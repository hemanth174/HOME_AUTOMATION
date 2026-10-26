import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/adminServer';
import { hashProvisioningToken } from '@/lib/provisioningServer';

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
    .select('board_id, user_id, device_token_hash, wifi_ssid, wifi_security, encrypted_wifi_password, config_version, applied_config_version')
    .eq('board_id', boardId).maybeSingle();
  if (configError) return NextResponse.json({ error: configError.message }, { status: 503 });
  if (existing?.device_token_hash) {
    return NextResponse.json({ error: 'This board already has a device credential. Credential rotation requires a separate controlled workflow.' }, { status: 409 });
  }

  const templateUrl = process.env.ESP32_FIRMWARE_TEMPLATE_URL ||
    'https://raw.githubusercontent.com/hemanth174/HOME_AUTOMATION/main/esp32.cpp';
  let source;
  try {
    const response = await fetch(templateUrl, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Firmware template returned HTTP ${response.status}`);
    source = await response.text();
  } catch (error) {
    return NextResponse.json({ error: 'Could not load the generic firmware template. No device credentials were changed.' }, { status: 503 });
  }

  const requiredAnchors = [
    'const char* BOARD_IDENTIFIER = "',
    'const char* DEVICE_AGENT_URL = "',
    'const char* DEVICE_TOKEN = "',
  ];
  if (!requiredAnchors.every((anchor) => source.includes(anchor))) {
    return NextResponse.json({
      error: 'The firmware template does not contain the device-agent placeholders yet. Deploy the updated firmware template first.',
    }, { status: 503 });
  }

  const deviceToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashProvisioningToken(deviceToken);
  const agentUrl = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/device-agent`;
  if (!agentUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL must be configured before provisioning.' }, { status: 503 });
  }
  const escapeCString = (value) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  source = source
    .replace(/const char\* BOARD_IDENTIFIER = "[^"]*";/, `const char* BOARD_IDENTIFIER = "${escapeCString(board.board_identifier)}";`)
    .replace(/const char\* DEVICE_AGENT_URL = "[^"]*";/, `const char* DEVICE_AGENT_URL = "${escapeCString(agentUrl)}";`)
    .replace(/const char\* DEVICE_TOKEN = "[^"]*";/, `const char* DEVICE_TOKEN = "${deviceToken}";`);

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
    metadata: { board_id: board.id, board_identifier: board.board_identifier },
  });

  return NextResponse.json({
    firmware: source,
    fileName: `${board.board_identifier}-vikatech.ino.cpp`,
    board: { id: board.id, name: board.name, boardIdentifier: board.board_identifier },
    requiresFlash: true,
    message: 'Flash this firmware once to enroll this board. Future Wi-Fi changes and restart requests can then be delivered remotely.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
