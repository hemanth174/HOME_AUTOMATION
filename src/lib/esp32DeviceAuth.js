import { getAdminSupabase } from '@/lib/adminServer';
import { hashProvisioningToken } from '@/lib/provisioningServer';

export async function authenticateEsp32(request) {
  const admin = getAdminSupabase();
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!admin || !token) {
    return { error: 'Device API is not configured or the device token is missing', status: 503 };
  }

  const tokenHash = hashProvisioningToken(token);
  const { data: provisionings, error: provisioningError } = await admin
    .from('provisioning_records')
    .select('id, user_id, board_identifier, device_auth_token_hash, revoked_at')
    .eq('device_auth_token_hash', tokenHash)
    .is('revoked_at', null)
    .limit(1);

  const provisioning = provisionings?.[0];
  if (provisioningError || !provisioning) {
    return { error: 'Invalid or revoked device credential', status: 401 };
  }

  const { data: boards, error: boardError } = await admin
    .from('boards')
    .select('id, user_id, name, board_identifier')
    .eq('user_id', provisioning.user_id)
    .eq('board_identifier', provisioning.board_identifier)
    .limit(1);

  const board = boards?.[0];
  if (boardError || !board) {
    return { error: 'Board is not registered to the provisioned customer yet', status: 409 };
  }

  return { admin, provisioning, board, tokenHash };
}

export function validBoardIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
