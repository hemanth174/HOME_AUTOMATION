import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const boardId = (await params).boardId;
  if (!/^[0-9a-f-]{36}$/i.test(boardId || '')) return NextResponse.json({ error: 'Invalid board identifier' }, { status: 400 });

  const { data: board, error: boardError } = await auth.admin.from('boards')
    .select('id, user_id, name, board_identifier').eq('id', boardId).maybeSingle();
  if (boardError || !board) return NextResponse.json({ error: 'Board not found.' }, { status: 404 });
  const { data: config, error: configError } = await auth.admin.from('esp32_configurations')
    .select('device_auth_token_hash, last_seen_at, device_online').eq('board_id', boardId).maybeSingle();
  if (configError) return NextResponse.json({ error: configError.message }, { status: 500 });
  if (!config?.device_auth_token_hash) {
    return NextResponse.json({ error: 'Remote restart is unavailable until this board installs its one-time secure provisioning firmware.', code: 'DEVICE_NOT_PROVISIONED' }, { status: 409 });
  }
  const lastSeenMs = config.last_seen_at ? Date.now() - new Date(config.last_seen_at).getTime() : Infinity;
  if (!config.device_online || lastSeenMs < 0 || lastSeenMs > 90000) {
    return NextResponse.json({ error: 'This ESP32 is offline. Reconnect it before sending a restart command.', code: 'DEVICE_OFFLINE' }, { status: 409 });
  }

  const { data: activeCommands, error: activeError } = await auth.admin.from('esp32_commands')
    .select('id').eq('board_id', boardId).eq('command_type', 'restart')
    .in('status', ['queued', 'accepted']).limit(1);
  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
  if (activeCommands?.length) {
    return NextResponse.json({ error: 'A restart command is already in progress.', commandId: activeCommands[0].id }, { status: 409 });
  }

  const { data: command, error: commandError } = await auth.admin.from('esp32_commands').insert({
    board_id: boardId,
    user_id: board.user_id,
    command_type: 'restart',
    status: 'queued',
    payload: {},
    requested_by: auth.user.id,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }).select('id, status, created_at').single();
  if (commandError) return NextResponse.json({ error: commandError.message }, { status: 500 });

  await auth.admin.from('approval_audit_log').insert({
    user_id: board.user_id, actor_email: auth.user.email, action: 'esp32_restart_requested',
    metadata: { board_id: boardId, board_identifier: board.board_identifier, command_id: command.id },
  });

  return NextResponse.json({ commandId: command.id, status: command.status, boardIdentifier: board.board_identifier }, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
