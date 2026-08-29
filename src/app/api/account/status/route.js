import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';
import { APPROVAL_ADMINS } from '@/lib/approval';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const admin = getAdminSupabase();
  if (!token || !admin) return NextResponse.json({ error: 'Account service is not configured' }, { status: 503 });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { data: approval, error } = await admin.from('account_approval_requests').select('*').eq('user_id', user.id).limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let current = approval?.[0] || { account_status: 'pending', email: user.email };
  const isAdmin = APPROVAL_ADMINS.includes((user.email || '').toLowerCase());
  // Normalize records created by the earlier fixed-email slot behavior so the
  // first person who actually approved appears as the first approver.
  if (!isAdmin && !current.admin_one_approved_at && current.admin_two_approved_at) {
    const normalized = { admin_one_email: current.admin_two_email, admin_one_approved_at: current.admin_two_approved_at, first_approved_at: current.admin_two_approved_at, admin_two_email: null, admin_two_approved_at: null, second_approved_at: null, updated_at: new Date().toISOString() };
    const { data: migrated } = await admin.from('account_approval_requests').update(normalized).eq('user_id', user.id).select('*').limit(1);
    current = migrated?.[0] || { ...current, ...normalized };
  }
  // Older records were backfilled as approved without the two-admin review.
  // Treat those legacy customer records as pending so they enter the new
  // approval workflow; never downgrade the configured administrators.
  if (!isAdmin && current.account_status === 'approved' && !(current.admin_one_approved_at && current.admin_two_approved_at)) {
    const { data: migrated } = await admin.from('account_approval_requests').update({ account_status: 'pending', updated_at: new Date().toISOString() }).eq('user_id', user.id).select('*').limit(1);
    current = migrated?.[0] || { ...current, account_status: 'pending' };
  }
  return NextResponse.json({ user: { id: user.id, email: user.email }, approval: current });
}
