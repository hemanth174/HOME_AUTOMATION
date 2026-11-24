import { NextResponse } from 'next/server';
import { authenticateUser, getStaffRole } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, private' };
const STATUSES = new Set(['open', 'in_progress', 'waiting_customer', 'resolved']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function context(request, params, { includeDeleted = false } = {}) {
  const auth = await authenticateUser(request);
  if (auth.error) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const { ticketId } = await params;
  if (!UUID.test(ticketId)) return { response: NextResponse.json({ error: 'Invalid ticket' }, { status: 400 }) };
  const role = await getStaffRole(auth.admin, auth.user);
  const { data: ticket, error } = await auth.admin.from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
  if (error) return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!ticket || (!role && ticket.user_id !== auth.user.id)) {
    return { response: NextResponse.json({ error: 'Ticket not found' }, { status: 404 }) };
  }
  if (ticket.deleted_at && (!includeDeleted || role !== 'main_admin')) {
    return { response: NextResponse.json({ error: 'Ticket not found' }, { status: 404 }) };
  }
  return { ...auth, role, ticket };
}

export async function GET(request, { params }) {
  const ctx = await context(request, params, { includeDeleted: true });
  if (ctx.response) return ctx.response;
  const { data, error } = await ctx.admin.from('support_ticket_messages')
    .select('id, sender_role, sender_name, body, created_at')
    .eq('ticket_id', ctx.ticket.id).order('created_at').limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ticket: ctx.ticket, messages: data || [] }, { headers: noStore });
}

export async function POST(request, { params }) {
  const ctx = await context(request, params);
  if (ctx.response) return ctx.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 4000) return NextResponse.json({ error: 'Message must be 1–4,000 characters' }, { status: 400 });
  const recent = await ctx.admin.from('support_ticket_messages').select('id')
    .eq('ticket_id', ctx.ticket.id).eq('sender_id', ctx.user.id)
    .gte('created_at', new Date(Date.now() - 3_000).toISOString()).limit(1);
  if (recent.error) return NextResponse.json({ error: recent.error.message }, { status: 500 });
  if (recent.data?.length) return NextResponse.json({ error: 'Please wait a moment before sending another reply' }, { status: 429 });
  const isStaff = Boolean(ctx.role);
  const { data, error } = await ctx.admin.from('support_ticket_messages').insert({
    ticket_id: ctx.ticket.id, sender_id: ctx.user.id,
    sender_role: isStaff ? 'staff' : 'customer',
    sender_name: ctx.user.email || (isStaff ? 'Support' : 'Customer'), body: message,
  }).select('id, sender_role, sender_name, body, created_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const nextStatus = isStaff ? 'waiting_customer' : 'open';
  return NextResponse.json({ message: data, status: nextStatus }, { status: 201, headers: noStore });
}

export async function PATCH(request, { params }) {
  const ctx = await context(request, params, { includeDeleted: true });
  if (ctx.response) return ctx.response;
  if (!ctx.role) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (body.restore === true) {
    if (ctx.role !== 'main_admin' || !ctx.ticket.deleted_at) {
      return NextResponse.json({ error: 'Main admin access required to restore this ticket' }, { status: 403 });
    }
    if (new Date(ctx.ticket.deleted_at).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'The 30-day restore period has ended' }, { status: 410 });
    }
    const { data, error } = await ctx.admin.from('support_tickets')
      .update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
      .eq('id', ctx.ticket.id).eq('deleted_at', ctx.ticket.deleted_at).select('*').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Ticket changed. Refresh and try again.' }, { status: 409 });
    return NextResponse.json({ ticket: data }, { headers: noStore });
  }
  if (ctx.ticket.deleted_at) return NextResponse.json({ error: 'Restore this ticket before editing it' }, { status: 409 });
  const updates = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    updates.status = body.status;
  }
  if (body.claim !== undefined) {
    if (typeof body.claim !== 'boolean') return NextResponse.json({ error: 'Invalid assignment' }, { status: 400 });
    if (body.claim && ctx.ticket.assigned_to && ctx.ticket.assigned_to !== ctx.user.email && ctx.role !== 'main_admin') {
      return NextResponse.json({ error: 'This ticket is already assigned' }, { status: 409 });
    }
    if (!body.claim && ctx.ticket.assigned_to !== ctx.user.email && ctx.role !== 'main_admin') return NextResponse.json({ error: 'Only the assigned admin can release this ticket' }, { status: 403 });
    updates.assigned_to = body.claim ? ctx.user.email : null;
  }
  if (body.status === undefined && body.claim === undefined) return NextResponse.json({ error: 'No change requested' }, { status: 400 });
  let query = ctx.admin.from('support_tickets').update(updates).eq('id', ctx.ticket.id).is('deleted_at', null);
  if (body.claim === true && !ctx.ticket.assigned_to) query = query.is('assigned_to', null);
  if (body.claim === false && ctx.role !== 'main_admin') query = query.eq('assigned_to', ctx.user.email);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Ticket changed. Refresh and try again.' }, { status: 409 });
  return NextResponse.json({ ticket: data }, { headers: noStore });
}

export async function DELETE(request, { params }) {
  const ctx = await context(request, params);
  if (ctx.response) return ctx.response;
  if (ctx.role !== 'main_admin') {
    return NextResponse.json({ error: 'Main admin access required' }, { status: 403 });
  }
  const { data, error } = await ctx.admin.from('support_tickets')
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.user.id, updated_at: new Date().toISOString() })
    .eq('id', ctx.ticket.id).is('deleted_at', null).select('id, deleted_at').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Ticket changed. Refresh and try again.' }, { status: 409 });
  return NextResponse.json({ ticket: data }, { headers: noStore });
}
