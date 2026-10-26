import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { boardId } = await params;
  if (!UUID_RE.test(boardId || '')) return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });

  const { data: config, error: configError } = await auth.admin
    .from('device_runtime_configs')
    .select('board_id, user_id, device_token_hash, last_seen_at')
    .eq('board_id', boardId)
    .maybeSingle();
  if (configError) return NextResponse.json({ error: configError.message }, { status: 503 });
  if (!config?.device_token_hash) {
    return NextResponse.json({ error: 'This ESP32 needs the new device-agent firmware flashed once before remote restart is available.' }, { status: 409 });
  }
  const lastSeen = config.last_seen_at ? new Date(config.last_seen_at).getTime() : 0;
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 120_000) {
    return NextResponse.json({ error: 'This ESP32 is offline or has not checked in recently. Restart was not queued.' }, { status: 409 });
  }

  const { data: board, error: boardError } = await auth.admin.from('boards')
    .select('id, user_id, name, board_identifier').eq('id', boardId).maybeSingle();
  if (boardError || !board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

  const { data: command, error } = await auth.admin.from('device_commands').insert({
    board_id: board.id,
    user_id: board.user_id,
    command_type: 'restart',
    status: 'pending',
    requested_by: auth.user.id,
  }).select('id, status, requested_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auth.admin.from('approval_audit_log').insert({
    user_id: board.user_id,
    actor_email: auth.user.email,
    action: 'esp32_restart_requested',
    metadata: { board_id: board.id, board_identifier: board.board_identifier, command_id: command.id },
  });

  return NextResponse.json({ command, board: { id: board.id, name: board.name, boardIdentifier: board.board_identifier } }, {
    status: 202, headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { boardId } = await params;
  if (!UUID_RE.test(boardId || '')) return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });

  const { data: commands, error } = await auth.admin.from('device_commands')
    .select('id, command_type, status, requested_at, accepted_at, completed_at, last_error')
    .eq('board_id', boardId).order('requested_at', { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ commands: commands || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
