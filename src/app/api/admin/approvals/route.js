import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from('account_approval_requests').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ approvals: data || [] });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { userId, action, rejectionReason = '' } = await request.json();
  if (!userId || !['approve', 'reject', 'revoke'].includes(action)) return NextResponse.json({ error: 'Valid user and approval action are required' }, { status: 400 });
  const { data: rows, error: readError } = await auth.admin.from('account_approval_requests').select('*').eq('user_id', userId).limit(1);
  const current = rows?.[0];
  if (readError || !current) return NextResponse.json({ error: readError?.message || 'Approval request not found' }, { status: 404 });
  const actor = auth.user.email.toLowerCase();
  const updates = { updated_at: new Date().toISOString() };
  if (action === 'reject' || action === 'revoke') {
    updates.account_status = action === 'revoke' ? 'revoked' : 'rejected';
    updates.rejection_reason = rejectionReason || `Rejected by ${actor}`;
  } else {
    if (current.admin_one_email === actor || current.admin_two_email === actor) return NextResponse.json({ error: 'You have already approved this request. The other administrator must review it.' }, { status: 409 });
    const approvedAt = new Date().toISOString();
    if (!current.admin_one_approved_at) {
      updates.admin_one_email = actor;
      updates.admin_one_approved_at = approvedAt;
      updates.first_approved_at = approvedAt;
      updates.last_requested_at = approvedAt;
    } else {
      updates.admin_two_email = actor;
      updates.admin_two_approved_at = approvedAt;
      updates.second_approved_at = approvedAt;
    }
  }
  const oneApproved = Boolean(updates.admin_one_approved_at || current.admin_one_approved_at);
  const twoApproved = Boolean(updates.admin_two_approved_at || current.admin_two_approved_at);
  if (action === 'approve' && oneApproved && twoApproved) updates.account_status = 'approved';
  const { data: updatedRows, error } = await auth.admin.from('account_approval_requests').update(updates).eq('user_id', userId).select('*').limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const updated = updatedRows?.[0];
  if (updated?.account_status === 'approved') {
    await auth.admin.from('order_trackings').update({ approval_status: 'approved' }).eq('user_id', userId);
  } else if (updated?.account_status === 'rejected' || updated?.account_status === 'revoked') {
    await auth.admin.from('order_trackings').update({ approval_status: 'rejected', rejection_reason: updated.rejection_reason }).eq('user_id', userId);
  } else if (action === 'approve') {
    await auth.admin.from('order_trackings').update({ approval_status: 'awaiting_second_admin' }).eq('user_id', userId);
  }
  await auth.admin.from('approval_audit_log').insert({ user_id: userId, actor_email: actor, action: `account_${action}`, metadata: { account_status: updated?.account_status } });
  return NextResponse.json({ approval: updated });
}
