import { NextResponse } from 'next/server';
import { authenticateEsp32 } from '@/lib/esp32DeviceAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authenticateEsp32(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const now = new Date().toISOString();
  await auth.admin.from('esp32_commands').update({ status: 'expired' })
    .eq('board_id', auth.board.id).in('status', ['queued', 'accepted']).lt('expires_at', now);

  const { data: commands, error } = await auth.admin.from('esp32_commands')
    .select('id, command_type, status, payload, created_at, expires_at')
    .eq('board_id', auth.board.id).in('status', ['queued', 'accepted'])
    .gt('expires_at', now).order('created_at', { ascending: true }).limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const command = commands?.[0] || null;
  if (!command) return NextResponse.json({ command: null }, { headers: { 'Cache-Control': 'no-store, private' } });

  if (command.status === 'queued') {
    const { error: acceptError } = await auth.admin.from('esp32_commands').update({
      status: 'accepted', accepted_at: now,
    }).eq('id', command.id).eq('status', 'queued');
    if (acceptError) return NextResponse.json({ error: acceptError.message }, { status: 500 });
    command.status = 'accepted';
  }
  return NextResponse.json({ command }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request) {
  const auth = await authenticateEsp32(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  if (typeof body.commandId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.commandId)) {
    return NextResponse.json({ error: 'A valid commandId is required' }, { status: 400 });
  }
  if (!['accepted', 'completed', 'failed'].includes(body.status)) {
    return NextResponse.json({ error: 'Status must be accepted, completed or failed' }, { status: 400 });
  }
  const patch = {
    status: body.status,
    result: { message: String(body.message || '').slice(0, 300) },
  };
  if (body.status === 'completed' || body.status === 'failed') patch.completed_at = new Date().toISOString();
  else patch.completed_at = null;
  const { data: updated, error } = await auth.admin.from('esp32_commands').update(patch)
    .eq('id', body.commandId).eq('board_id', auth.board.id).in('status', ['queued', 'accepted'])
    .select('id, status').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Command not found or already finalized' }, { status: 409 });
  return NextResponse.json({ ok: true, command: updated }, { headers: { 'Cache-Control': 'no-store, private' } });
}
