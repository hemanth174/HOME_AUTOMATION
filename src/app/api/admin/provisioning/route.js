import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/adminServer';
import { encryptProvisioningValue, createProvisioningToken, hashProvisioningToken } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const { orderId, userId } = body || {};
  if (!orderId || !userId) return NextResponse.json({ error: 'Order and user are required' }, { status: 400 });

  const { data: approvalRows, error: approvalError } = await auth.admin
    .from('account_approval_requests')
    .select('account_status, admin_one_approved_at, admin_two_approved_at')
    .eq('user_id', userId).limit(1);
  if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 503 });
  const approval = approvalRows?.[0];
  if (approval?.account_status !== 'approved' || !approval.admin_one_approved_at || !approval.admin_two_approved_at) {
    return NextResponse.json({ error: 'Both administrators must approve before provisioning' }, { status: 409 });
  }

  const { data: existing, error: existingError } = await auth.admin
    .from('provisioning_records').select('id')
    .eq('order_id', orderId).is('revoked_at', null).limit(1);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 503 });
  if (existing?.length) return NextResponse.json({ error: 'Provisioning has already been generated for this order' }, { status: 409 });

  const suffix = crypto.randomBytes(5).toString('hex').toUpperCase();
  const boardIdentifier = `vt-${suffix}`;
  const boardName = `HOME-leader-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const meshPassword = `VT-${crypto.randomBytes(6).toString('base64url').slice(0, 8)}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const deviceToken = createProvisioningToken();
  const setupToken = createProvisioningToken();

  const { data: board, error: boardError } = await auth.admin.from('boards').insert({
    user_id: userId,
    board_identifier: boardIdentifier,
    name: boardName,
    hardware_model: 'ESP32-4CH',
  }).select('id').single();
  if (boardError || !board) return NextResponse.json({ error: boardError?.message || 'Could not create board record' }, { status: 500 });

  const devices = Array.from({ length: 4 }, (_, index) => ({
    user_id: userId, board_id: board.id, relay_index: index,
    name: `Device ${index + 1}`, is_on: false,
  }));
  const { error: devicesError } = await auth.admin.from('devices').insert(devices);
  if (devicesError) {
    await auth.admin.from('boards').delete().eq('id', board.id);
    return NextResponse.json({ error: `Could not create board channels: ${devicesError.message}` }, { status: 500 });
  }

  let encryptedPassword, encryptedDeviceToken;
  try {
    encryptedPassword = encryptProvisioningValue(meshPassword);
    encryptedDeviceToken = encryptProvisioningValue(deviceToken);
  } catch (error) {
    await auth.admin.from('boards').delete().eq('id', board.id);
    return NextResponse.json({ error: 'Provisioning encryption is not configured securely on the server.' }, { status: 503 });
  }

  const { error: configError } = await auth.admin.from('device_runtime_configs').insert({
    board_id: board.id,
    user_id: userId,
    device_token_hash: hashProvisioningToken(deviceToken),
    wifi_ssid: '',
    wifi_security: 'wpa2_psk',
    encrypted_wifi_password: null,
    config_version: 1,
    applied_config_version: 0,
    config_update_status: 'unprovisioned',
  });
  if (configError) {
    await auth.admin.from('boards').delete().eq('id', board.id);
    return NextResponse.json({ error: `Could not create secure device enrollment: ${configError.message}` }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await auth.admin.from('provisioning_records').insert({
    user_id: userId,
    order_id: orderId,
    board_id: board.id,
    board_name: boardName,
    board_identifier: boardIdentifier,
    encrypted_password: encryptedPassword,
    encrypted_device_token: encryptedDeviceToken,
    setup_token_hash: hashProvisioningToken(setupToken),
    setup_token_expires_at: expiresAt,
  }).select('id, board_id, board_name, board_identifier, setup_token_expires_at').limit(1);

  if (error || !rows?.[0]) {
    await auth.admin.from('device_runtime_configs').delete().eq('board_id', board.id);
    await auth.admin.from('boards').delete().eq('id', board.id);
    return NextResponse.json({ error: error?.message || 'Could not save provisioning record' }, { status: 500 });
  }

  await auth.admin.from('approval_audit_log').insert({
    user_id: userId,
    order_id: orderId,
    actor_email: auth.user.email,
    action: 'provisioning_created',
    metadata: { provisioning_id: rows[0].id, board_id: board.id, board_identifier: boardIdentifier },
  });

  return NextResponse.json({ provisioning: rows[0], setupUrl: `/setup/${setupToken}` });
}
