import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { ADMIN_EMAILS } from '@/lib/adminEmails';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from('admin_staff')
    .select('email, role, active, created_at, updated_at').order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: [
    ...ADMIN_EMAILS.map((email) => ({ email, role: 'main_admin', active: true })),
    ...(data || []),
  ] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || ADMIN_EMAILS.includes(email) || typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'Choose a sub admin and an access state' }, { status: 400 });
  }
  const { data, error } = await auth.admin.rpc('set_sub_admin_active', {
    p_email: email, p_active: body.active, p_actor: auth.user.email.toLowerCase(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}
