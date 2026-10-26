import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: boards, error: boardError } = await auth.admin
    .from('boards')
    .select('id, user_id, name, board_identifier, created_at')
    .order('created_at', { ascending: false });
  if (boardError) return NextResponse.json({ error: boardError.message }, { status: 500 });

  const boardIds = (boards || []).map((board) => board.id);
  const userIds = [...new Set((boards || []).map((board) => board.user_id).filter(Boolean))];
  if (!boardIds.length) return NextResponse.json({ boards: [] });

  const [devicesResult, configResult, commandsResult, usersResult] = await Promise.all([
    auth.admin.from('devices').select('id, board_id, name, relay_index, is_on').in('board_id', boardIds).order('relay_index'),
    auth.admin.from('esp32_configurations')
      .select('board_id, wifi_ssid, wifi_security, config_version, last_applied_config_version, device_online, last_seen_at, last_boot_at, last_error, last_ip, device_auth_token_hash')
      .in('board_id', boardIds),
    auth.admin.from('esp32_commands')
      .select('id, board_id, command_type, status, created_at, accepted_at, completed_at, expires_at, result')
      .in('board_id', boardIds).order('created_at', { ascending: false }).limit(300),
    auth.admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const queryError = devicesResult.error || configResult.error || commandsResult.error;
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  const emailById = new Map((usersResult.data?.users || []).map((item) => [item.id, item.email || '']));
  const devicesByBoard = new Map();
  for (const device of devicesResult.data || []) {
    const list = devicesByBoard.get(device.board_id) || [];
    list.push(device);
    devicesByBoard.set(device.board_id, list);
  }
  const configByBoard = new Map((configResult.data || []).map((item) => [item.board_id, item]));
  const commandByBoard = new Map();
  for (const command of commandsResult.data || []) {
    if (!commandByBoard.has(command.board_id)) commandByBoard.set(command.board_id, command);
  }

  const now = Date.now();
  return NextResponse.json({
    boards: (boards || []).map((board) => {
      const config = configByBoard.get(board.id) || null;
      const lastCommand = commandByBoard.get(board.id) || null;
      const lastSeenMs = config?.last_seen_at ? now - new Date(config.last_seen_at).getTime() : null;
      return {
        ...board,
        ownerEmail: emailById.get(board.user_id) || 'Unknown account',
        devices: devicesByBoard.get(board.id) || [],
        provisioned: Boolean(config?.device_auth_token_hash),
        wifiSSID: config?.wifi_ssid || '',
        wifiSecurity: config?.wifi_security || 'wpa2_psk',
        configVersion: config?.config_version || 0,
        lastAppliedConfigVersion: config?.last_applied_config_version || 0,
        online: Number.isFinite(lastSeenMs) && lastSeenMs >= 0 && lastSeenMs < 90000,
        lastSeenAt: config?.last_seen_at || null,
        lastBootAt: config?.last_boot_at || null,
        lastIP: config?.last_ip || null,
        lastError: config?.last_error || null,
        latestCommand: lastCommand,
      };
    }),
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
