import { NextResponse } from 'next/server';
import { authenticateUser, getStaffAccess } from '@/lib/adminServer';
import { hasAdminPermission } from '@/lib/adminPermissions';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, private' };
const CATEGORIES = new Set(['general', 'device', 'billing', 'account']);

export async function GET(request) {
  const auth = await authenticateUser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const scope = new URL(request.url).searchParams.get('scope');
  const staff = scope === 'staff';
  const deleted = scope === 'deleted';
  const access = staff || deleted ? await getStaffAccess(auth.admin, auth.user) : { role: null };
  if (deleted && !hasAdminPermission(access.role, access.permissions, 'support_delete')) {
    return NextResponse.json({ error: 'Ticket deletion access required' }, { status: 403 });
  }
  if (staff && !hasAdminPermission(access.role, access.permissions, 'support')) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }
  let query = auth.admin.from('support_tickets')
    .select('id, user_id, customer_email, subject, category, status, assigned_to, created_at, updated_at, last_reply_at, deleted_at')
    .order('updated_at', { ascending: false }).limit(200);
  query = deleted ? query.not('deleted_at', 'is', null)
    .gte('deleted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    : query.is('deleted_at', null);
  if (!staff && !deleted) query = query.eq('user_id', auth.user.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickets: data || [] }, { headers: noStore });
}

export async function POST(request) {
  const auth = await authenticateUser(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (new URL(request.url).searchParams.get('scope') === 'staff') {
    const access = await getStaffAccess(auth.admin, auth.user);
    if (!hasAdminPermission(access.role, access.permissions, 'support_create')) return NextResponse.json({ error: 'Support issue creation access required' }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const category = CATEGORIES.has(body.category) ? body.category : 'general';
  if (subject.length < 5 || subject.length > 120 || !message || message.length > 4000) {
    return NextResponse.json({ error: 'Add a subject (5–120 characters) and message (up to 4,000 characters)' }, { status: 400 });
  }
  const recent = await auth.admin.from('support_tickets').select('id')
    .eq('user_id', auth.user.id).gte('created_at', new Date(Date.now() - 60_000).toISOString()).limit(1);
  if (recent.error) return NextResponse.json({ error: recent.error.message }, { status: 500 });
  if (recent.data?.length) return NextResponse.json({ error: 'Please wait a minute before opening another ticket' }, { status: 429 });
  const { data: ticket, error } = await auth.admin.from('support_tickets').insert({
    user_id: auth.user.id, customer_email: auth.user.email || '', subject, category,
  }).select('id, user_id, customer_email, subject, category, status, assigned_to, created_at, updated_at, last_reply_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: messageError } = await auth.admin.from('support_ticket_messages').insert({
    ticket_id: ticket.id, sender_id: auth.user.id, sender_role: 'customer',
    sender_name: auth.user.email || 'Customer', body: message,
  });
  if (messageError) {
    await auth.admin.from('support_tickets').delete().eq('id', ticket.id);
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }
  return NextResponse.json({ ticket }, { status: 201, headers: noStore });
}
