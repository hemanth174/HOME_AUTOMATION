import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { boardId } = await params;
  if (!UUID_RE.test(boardId || '')) return NextResponse.json({ error: 'Invalid board ID' }, { status: 400 });

  const { data: board, error: boardError } = await auth.admin
    .from('boards')
    .select('id, user_id, board_identifier')
    .eq('id', boardId)
    .maybeSingle();
  if (boardError || !board) return NextResponse.json({ error: boardError?.message || 'Board not found' }, { status: 404 });

  const now = new Date().toISOString();
  const { data: revoked, error } = await auth.admin
    .from('device_runtime_configs')
    .update({ revoked_at: now, updated_at: now })
    .eq('board_id', boardId)
    .select('board_id, revoked_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  if (!revoked) return NextResponse.json({ error: 'This board has no device credential to revoke.' }, { status: 409 });

  await auth.admin.from('provisioning_records')
    .update({ revoked_at: now, updated_at: now })
    .eq('user_id', board.user_id)
    .eq('board_identifier', board.board_identifier)
    .is('revoked_at', null);

  await auth.admin.from('approval_audit_log').insert({
    user_id: board.user_id,
    actor_email: auth.user.email,
    action: 'esp32_device_credential_revoked',
    metadata: { board_id: board.id, board_identifier: board.board_identifier },
  });

  return NextResponse.json({ revoked: true, boardId, revokedAt: now }, {
    status: 202,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
