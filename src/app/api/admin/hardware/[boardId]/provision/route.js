import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { createProvisioningToken, encryptProvisioningValue, hashProvisioningToken, decryptProvisioningValue } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const boardId = (await params).boardId;
  if (!/^[0-9a-f-]{36}$/i.test(boardId || '')) return NextResponse.json({ error: 'Invalid board identifier' }, { status: 400 });

  const { data: board, error: boardError } = await auth.admin.from('boards')
    .select('id, user_id, name, board_identifier').eq('id', boardId).maybeSingle();
  if (boardError || !board) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });

  const { data: matchingRows, error: lookupError } = await auth.admin.from('provisioning_records')
    .select('id, user_id, order_id, board_name, encrypted_password, revoked_at')
    .eq('board_identifier', board.board_identifier).order('created_at', { ascending: false }).limit(1);
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  const matching = matchingRows?.[0] || null;
  if (matching && matching.user_id !== board.user_id) {
    return NextResponse.json({ error: 'Provisioning record belongs to another account. Stop and review the board assignment.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  let meshSSID = matching?.board_name || (typeof body.meshSSID === 'string' ? body.meshSSID.trim() : '');
  let meshPassword = '';
  if (matching?.encrypted_password && !matching.revoked_at) {
    try { meshPassword = decryptProvisioningValue(matching.encrypted_password); } catch {
      return NextResponse.json({ error: 'Saved mesh credentials cannot be decrypted. Fix the provisioning encryption key before proceeding.' }, { status: 500 });
    }
  }
  if (!meshSSID || !meshPassword) {
    meshSSID = typeof body.meshSSID === 'string' ? body.meshSSID.trim() : '';
    meshPassword = typeof body.meshPassword === 'string' ? body.meshPassword : '';
  }
  if (!meshSSID || meshSSID.length > 32 || meshPassword.length < 8 || meshPassword.length > 63) {
    return NextResponse.json({
      error: 'Enter the current mesh Wi-Fi name and password from the installed firmware. Do not use new values unless you intend to change the mesh network.',
      code: 'MESH_SETTINGS_REQUIRED',
    }, { status: 409 });
  }

  // Fail before changing stored credentials if the firmware source is unavailable.
  const sourceUrl = process.env.ESP32_FIRMWARE_SOURCE_URL ||
    'https://raw.githubusercontent.com/hemanth174/HOME_AUTOMATION/main/esp32.cpp';
  let sourceResponse;
  try { sourceResponse = await fetch(sourceUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) }); } catch {
    return NextResponse.json({ error: 'Could not fetch the current firmware source. No device token was rotated.' }, { status: 503 });
  }
  if (!sourceResponse.ok) return NextResponse.json({ error: 'Firmware source was not available. No device token was rotated.' }, { status: 503 });
  let firmware = await sourceResponse.text();
  const required = ['const char* BOARD_IDENTIFIER =', 'const char* MESH_SSID =', 'const char* MESH_PASS =', 'const char* DEVICE_AUTH_TOKEN ='];
  if (required.some((marker) => !firmware.includes(marker))) {
    return NextResponse.json({ error: 'Firmware source does not support secure device management yet. No device token was rotated.' }, { status: 409 });
  }

  const deviceAuthToken = createProvisioningToken();
  const cppString = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  firmware = firmware.replace(/const char\* BOARD_IDENTIFIER = "[^"]*";/,
    'const char* BOARD_IDENTIFIER = "' + cppString(board.board_identifier) + '";');
  firmware = firmware.replace(/const char\* MESH_SSID = "[^"]*";/,
    'const char* MESH_SSID = "' + cppString(meshSSID) + '";');
  firmware = firmware.replace(/const char\* MESH_PASS = "[^"]*";/,
    'const char* MESH_PASS = "' + cppString(meshPassword) + '";');
  firmware = firmware.replace(/const char\* DEVICE_AUTH_TOKEN = "[^"]*";/,
    'const char* DEVICE_AUTH_TOKEN = "' + cppString(deviceAuthToken) + '";');

  const now = Date.now();
  const recordData = {
    user_id: board.user_id,
    order_id: matching?.order_id || ('BOARD-' + board.id),
    board_name: meshSSID,
    board_identifier: board.board_identifier,
    encrypted_password: encryptProvisioningValue(meshPassword),
    device_auth_token_hash: hashProvisioningToken(deviceAuthToken),
    encrypted_device_auth_token: encryptProvisioningValue(deviceAuthToken),
    setup_token_hash: hashProvisioningToken(createProvisioningToken()),
    setup_token_expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
    setup_token_used_at: new Date().toISOString(),
    revoked_at: null,
    updated_at: new Date().toISOString(),
  };

  let persistResult;
  if (matching) {
    persistResult = await auth.admin.from('provisioning_records').update(recordData).eq('id', matching.id);
  } else {
    persistResult = await auth.admin.from('provisioning_records').insert(recordData);
  }
  if (persistResult.error) {
    return NextResponse.json({ error: 'Could not save the board credential: ' + persistResult.error.message }, { status: 500 });
  }

  await auth.admin.from('approval_audit_log').insert({
    user_id: board.user_id,
    actor_email: auth.user.email,
    action: 'esp32_secure_firmware_generated',
    metadata: { board_id: board.id, board_identifier: board.board_identifier },
  });

  return NextResponse.json({
    fileName: board.board_identifier + '-secure-provisioning.cpp',
    firmware,
    boardIdentifier: board.board_identifier,
    note: 'Flash this firmware once. Future remote configuration changes and restarts will use the device API.',
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
