import { hasAdminPermission } from './adminPermissions';

export async function hasAdminPageAccess(session, feature) {
  if (!session?.access_token) return false;
  const response = await fetch('/api/admin/role', {
    headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
  });
  if (!response.ok) return false;
  const access = await response.json();
  return hasAdminPermission(access.role, access.permissions, feature);
}
