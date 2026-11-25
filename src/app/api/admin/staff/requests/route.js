import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { ADMIN_FEATURE_KEYS, hasAdminPermission } from '@/lib/adminPermissions';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private' };

export async function GET(request) {
  const auth = await requireAdmin(request, { allowSubAdmin: true });
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let query = auth.admin.from('admin_feature_requests').select('*').order('created_at', { ascending: false }).limit(100);
  if (auth.role === 'sub_admin') query = query.eq('staff_email', auth.user.email.toLowerCase());
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data || [] }, { headers });
}

export async function POST(request) {
  const auth = await requireAdmin(request, { allowSubAdmin: true });
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.role !== 'sub_admin') return NextResponse.json({ error: 'Only sub admins can request access' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const feature = body?.feature;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!ADMIN_FEATURE_KEYS.includes(feature) || reason.length > 500) return NextResponse.json({ error: 'Choose a feature and keep the note under 500 characters' }, { status: 400 });
  if (hasAdminPermission(auth.role, auth.permissions, feature)) return NextResponse.json({ error: 'You already have this access' }, { status: 409 });
  const email = auth.user.email.toLowerCase();
  const { data: existing, error: checkError } = await auth.admin.from('admin_feature_requests').select('id')
    .eq('staff_email', email).eq('feature_key', feature).eq('status', 'pending').maybeSingle();
  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 500 });
  if (existing) return NextResponse.json({ error: 'A request for this feature is already pending' }, { status: 409 });
  const { data, error } = await auth.admin.from('admin_feature_requests').insert({ staff_email: email, feature_key: feature, reason }).select('*').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'A request for this feature is already pending' : error.message }, { status: error.code === '23505' ? 409 : 500 });
  return NextResponse.json({ request: data }, { status: 201, headers });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (typeof body?.requestId !== 'string' || typeof body?.approve !== 'boolean') return NextResponse.json({ error: 'Choose a request and decision' }, { status: 400 });
  const { data, error } = await auth.admin.rpc('resolve_admin_feature_request', {
    p_request_id: body.requestId, p_approve: body.approve, p_actor: auth.user.email.toLowerCase(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data }, { headers });
}
