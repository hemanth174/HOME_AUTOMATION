import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';
import { dispatchNotification } from '@/lib/serverNotifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const token = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');
  const admin = getAdminSupabase();
  if (!token || !admin) {
    return NextResponse.json(
      { error: 'Authentication is not configured' },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dispatchNotification(admin, {
      userId: user.id,
      type: 'system',
      title: 'Test notification',
      body: 'Notifications are working. You will receive alerts here and on your installed app.',
      url: '/settings',
      dedupeKey: `test:${user.id}:${Date.now()}`,
      data: { test: true },
    });

    return NextResponse.json({
      ok: true,
      push: result?.push || { sent: 0, skipped: 'not-inserted' },
    });
  } catch (testError) {
    return NextResponse.json(
      { error: testError.message || 'Could not send test notification' },
      { status: 500 },
    );
  }
}
