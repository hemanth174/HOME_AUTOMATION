import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const commandId = (await params).commandId;
  const { data: command, error } = await auth.admin.from('esp32_commands')
    .select('id, board_id, command_type, status, created_at, accepted_at, completed_at, expires_at, result')
    .eq('id', commandId).maybeSingle();
  if (error || !command) return NextResponse.json({ error: 'Command not found.' }, { status: 404 });
  const { data: board } = await auth.admin.from('boards').select('name, board_identifier').eq('id', command.board_id).maybeSingle();
  const { data: config } = await auth.admin.from('esp32_configurations')
    .select('last_seen_at, last_boot_at, device_online, config_version, last_applied_config_version')
    .eq('board_id', command.board_id).maybeSingle();

  const now = Date.now();
  const lastSeenMs = config?.last_seen_at ? now - new Date(config.last_seen_at).getTime() : Infinity;
  const deviceOnline = Boolean(config?.device_online && lastSeenMs >= 0 && lastSeenMs < 90000);
  if (['queued', 'accepted'].includes(command.status) && new Date(command.expires_at).getTime() < now) {
    const { error: expireError } = await auth.admin.from('esp32_commands')
      .update({ status: 'expired', completed_at: new Date().toISOString(), result: { message: 'Command expired before device confirmation.' } })
      .eq('id', command.id).in('status', ['queued', 'accepted']);
    if (!expireError) {
      command.status = 'expired';
      command.result = { message: 'Command expired before device confirmation.' };
    }
  }
  return NextResponse.json({
    command,
    board: board || null,
    deviceOnline,
    lastSeenAt: config?.last_seen_at || null,
    lastBootAt: config?.last_boot_at || null,
    configVersion: config?.config_version || 0,
    lastAppliedConfigVersion: config?.last_applied_config_version || 0,
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
