import { NextResponse } from 'next/server';
import { authenticateUser, getStaffRole } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, private' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ticketContext(request, params) {
  const auth = await authenticateUser(request);
  if (auth.error) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const { ticketId } = await params;
  if (!UUID.test(ticketId)) return { response: NextResponse.json({ error: 'Invalid ticket' }, { status: 400 }) };
  const role = await getStaffRole(auth.admin, auth.user);
  const { data: ticket, error } = await auth.admin.from('support_tickets')
    .select('id, user_id').eq('id', ticketId).is('deleted_at', null).maybeSingle();
  if (error) return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!ticket || (!role && ticket.user_id !== auth.user.id)) {
    return { response: NextResponse.json({ error: 'Ticket not found' }, { status: 404 }) };
  }
  return { ...auth, role, ticket };
}

export async function GET(request, { params }) {
  const ctx = await ticketContext(request, params);
  if (ctx.response) return ctx.response;
  const { data, error } = await ctx.admin.from('support_ticket_typing')
    .select('actor_role').eq('ticket_id', ctx.ticket.id).neq('user_id', ctx.user.id)
    .gt('expires_at', new Date().toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer: data?.some((item) => item.actor_role === 'customer') || false,
    staff: data?.some((item) => item.actor_role === 'staff') || false }, { headers: noStore });
}

export async function POST(request, { params }) {
  const ctx = await ticketContext(request, params);
  if (ctx.response) return ctx.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (typeof body.typing !== 'boolean') return NextResponse.json({ error: 'Invalid typing state' }, { status: 400 });
  if (!body.typing) {
    const { error } = await ctx.admin.from('support_ticket_typing').delete()
      .eq('ticket_id', ctx.ticket.id).eq('user_id', ctx.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await ctx.admin.from('support_ticket_typing').upsert({
      ticket_id: ctx.ticket.id, user_id: ctx.user.id,
      actor_role: ctx.role ? 'staff' : 'customer',
      expires_at: new Date(Date.now() + 7_000).toISOString(),
    }, { onConflict: 'ticket_id,user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
