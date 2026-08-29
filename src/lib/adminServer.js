import { createClient } from '@supabase/supabase-js';

export function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireAdmin(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const admin = getAdminSupabase();
  if (!token || !admin) return { error: 'Admin service is not configured', status: 503 };
  const { data: { user }, error } = await admin.auth.getUser(token);
  const allowed = user?.email && ['lrvkausthubh@gmail.com', 'ramasaiahemanth@gmail.com'].includes(user.email.toLowerCase());
  if (error || !allowed) return { error: 'Admin access required', status: 403 };
  return { admin, user };
}
