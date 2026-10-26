import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const commandId = (await params).commandId;
  const { data: command, error } = await auth.admin.from('device_commands')
    .select('id, board_id, command_type, status, requested_at, accepted_at, completed_at, expires_at, last_error, result')
    .eq('id', commandId).maybeSingle();
  if (error || !command) return NextResponse.json({ error: 'Command not found.' }, { status: 404 });
  const { data: board } = await auth.admin.from('boards').select('name, board_identifier').eq('id', command.board_id).maybeSingle();
  const { data: config } = await auth.admin.from('device_runtime_configs')
    .select('last_seen_at, last_direct_seen_at, last_mesh_seen_at, last_boot_at, last_boot_id, config_version, applied_config_version')
    .eq('board_id', command.board_id).maybeSingle();

  const now = Date.now();
  const directOnline = Boolean(config?.last_direct_seen_at && now - new Date(config.last_direct_seen_at).getTime() >= 0 && now - new Date(config.last_direct_seen_at).getTime() < 120000);
  const meshOnline = Boolean(config?.last_mesh_seen_at && now - new Date(config.last_mesh_seen_at).getTime() >= 0 && now - new Date(config.last_mesh_seen_at).getTime() < 120000);
  const deviceOnline = directOnline || meshOnline;
  if (['pending', 'accepted'].includes(command.status) && new Date(command.expires_at).getTime() < now) {
    const { error: expireError } = await auth.admin.from('device_commands')
      .update({ status: 'cancelled', completed_at: new Date().toISOString(), last_error: 'Command expired before device confirmation.', result: { message: 'Command expired before device confirmation.' } })
      .eq('id', command.id).in('status', ['pending', 'accepted']);
    if (!expireError) {
      command.status = 'cancelled';
      command.last_error = 'Command expired before device confirmation.';
      command.result = { message: 'Command expired before device confirmation.' };
    }
  }
  command.created_at = command.requested_at;
  return NextResponse.json({
    command,
    board: board || null,
    deviceOnline,
    lastSeenAt: config?.last_seen_at || null,
    lastBootAt: config?.last_boot_at || null,
    lastBootId: config?.last_boot_id || null,
    configVersion: config?.config_version || 0,
    lastAppliedConfigVersion: config?.applied_config_version || 0,
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
