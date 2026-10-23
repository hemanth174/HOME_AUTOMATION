import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const admin = getAdminSupabase();
  if (!token || !admin) return NextResponse.json({ error: 'Account service is not configured' }, { status: 503 });

  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { data: approval, error } = await admin
    .from('account_approval_requests')
    .select('account_status, rejection_reason, admin_one_email, admin_one_approved_at, admin_two_email, admin_two_approved_at')
    .eq('user_id', user.id)
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    {
      user: { id: user.id, email: user.email },
      approval: approval?.[0] || { account_status: 'pending' },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
