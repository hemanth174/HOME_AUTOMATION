import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { ADMIN_EMAILS } from '@/lib/adminEmails';
import { ADMIN_FEATURE_KEYS } from '@/lib/adminPermissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdmin(request, { allowSubAdmin: true });
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.role === 'sub_admin') return NextResponse.json({ staff: [{ email: auth.user.email.toLowerCase(), role: 'sub_admin', active: true, permissions: auth.permissions }] }, { headers: { 'Cache-Control': 'no-store' } });
  const { data, error } = await auth.admin.from('admin_staff')
    .select('email, role, active, permissions, created_at, updated_at').order('created_at');
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
  if (!email || ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Choose a sub admin' }, { status: 400 });
  }
  const changingFeature = typeof body.feature === 'string';
  if (changingFeature ? !ADMIN_FEATURE_KEYS.includes(body.feature) || typeof body.enabled !== 'boolean' : typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'Choose a valid access change' }, { status: 400 });
  }
  const { data, error } = changingFeature
    ? await auth.admin.rpc('set_sub_admin_permission', { p_email: email, p_feature: body.feature, p_enabled: body.enabled, p_actor: auth.user.email.toLowerCase() })
    : await auth.admin.rpc('set_sub_admin_active', { p_email: email, p_active: body.active, p_actor: auth.user.email.toLowerCase() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.email?.toLowerCase() !== email) {
    return NextResponse.json({ error: 'The updated account did not match the selected sub admin. Refresh and try again.' }, { status: 409 });
  }
  return NextResponse.json({ staff: data });
}
