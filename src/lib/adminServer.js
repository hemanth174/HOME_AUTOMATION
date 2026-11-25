import { createClient } from '@supabase/supabase-js';
import { isAdminEmail } from './adminEmails';
import { hasAdminPermission, normalizeAdminPermissions } from './adminPermissions';

export function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function authenticateUser(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const admin = getAdminSupabase();
  if (!admin) return { error: 'Account service is not configured', status: 503 };
  if (!token) return { error: 'Authentication required', status: 401 };
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: 'Authentication required', status: 401 };
  return { admin, user };
}

export async function getStaffRole(admin, user) {
  return (await getStaffAccess(admin, user)).role;
}

export async function getStaffAccess(admin, user) {
  if (isAdminEmail(user?.email)) return { role: 'main_admin', permissions: null };
  if (!user?.email || !user.email_confirmed_at) return { role: null, permissions: null };
  const { data, error } = await admin.from('admin_staff').select('role, active, permissions')
    .eq('email', user.email.trim().toLowerCase()).maybeSingle();
  if (error || !data?.active || data.role !== 'sub_admin') return { role: null, permissions: null };
  return { role: 'sub_admin', permissions: normalizeAdminPermissions(data.permissions) };
}

export async function requireAdmin(request, { allowSubAdmin = false, permission = null } = {}) {
  const auth = await authenticateUser(request);
  if (auth.error) return auth;
  const { role, permissions } = await getStaffAccess(auth.admin, auth.user);
  if (role !== 'main_admin' && !(role === 'sub_admin' && (permission ? hasAdminPermission(role, permissions, permission) : allowSubAdmin))) {
    return { error: 'Admin access required', status: 403 };
  }
  return { ...auth, role, permissions };
}
