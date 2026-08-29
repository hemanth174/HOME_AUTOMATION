import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { encryptProvisioningValue, createProvisioningToken, hashProvisioningToken } from '@/lib/provisioningServer';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { orderId, userId } = await request.json();
  if (!orderId || !userId) return NextResponse.json({ error: 'Order and user are required' }, { status: 400 });
  const { data: approval } = await auth.admin.from('account_approval_requests').select('account_status, admin_one_approved_at, admin_two_approved_at').eq('user_id', userId).limit(1);
  const account = approval?.[0];
  if (account?.account_status !== 'approved' || !account.admin_one_approved_at || !account.admin_two_approved_at) return NextResponse.json({ error: 'Both administrators must approve before provisioning' }, { status: 409 });
  const boardIdentifier = `vt-${cryptoSafeSuffix()}`;
  const boardName = `HOME-leader-${cryptoSafeSuffix(4)}`;
  const password = randomPassword();
  const token = createProvisioningToken();
  const { data: existing } = await auth.admin.from('provisioning_records').select('id').eq('order_id', orderId).is('revoked_at', null).limit(1);
  if (existing?.length) return NextResponse.json({ error: 'Provisioning has already been generated for this order' }, { status: 409 });
  const { data: rows, error } = await auth.admin.from('provisioning_records').insert({ user_id: userId, order_id: orderId, board_name: boardName, board_identifier: boardIdentifier, encrypted_password: encryptProvisioningValue(password), setup_token_hash: hashProvisioningToken(token), setup_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }).select('id, board_name, board_identifier, setup_token_expires_at').limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auth.admin.from('approval_audit_log').insert({ user_id: userId, order_id: orderId, actor_email: auth.user.email, action: 'provisioning_created', metadata: { provisioning_id: rows?.[0]?.id } });
  return NextResponse.json({ provisioning: rows?.[0], setupUrl: `/setup/${token}` });
}

function cryptoSafeSuffix(length = 8) { return Math.random().toString(36).slice(2, 2 + length).toUpperCase(); }
function randomPassword() { return `VT-${cryptoSafeSuffix(6)}-${cryptoSafeSuffix(6)}`; }
