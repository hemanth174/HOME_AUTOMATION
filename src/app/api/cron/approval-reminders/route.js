import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminSupabase } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = getAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Admin service is not configured' }, { status: 503 });
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: requests, error } = await admin.from('account_approval_requests').select('*').eq('account_status', 'pending').not('admin_one_approved_at', 'is', null).is('admin_two_approved_at', null).lte('last_requested_at', cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const smtpReady = process.env.SMTP_USER && process.env.SMTP_PASS;
  let sent = 0;
  for (const item of requests || []) {
    if (smtpReady && item.admin_one_email) {
      const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: parseInt(process.env.SMTP_PORT || '587', 10), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      await transporter.sendMail({ from: process.env.SMTP_FROM || `VikaTech <${process.env.SMTP_USER}>`, to: item.admin_one_email, subject: `VikaTech approval reminder: ${item.email}`, text: `The second administrator approval is still pending for ${item.email}. Please review the request again in the VikaTech admin console. First approval: ${item.first_approved_at}.` });
      sent += 1;
    }
    await admin.from('account_approval_requests').update({ last_requested_at: new Date().toISOString() }).eq('id', item.id);
    await admin.from('approval_audit_log').insert({ user_id: item.user_id, actor_email: 'system@vikatech.local', action: 'second_admin_reminder', metadata: { sent_to: item.admin_one_email, first_approved_at: item.first_approved_at } });
  }
  return NextResponse.json({ processed: requests?.length || 0, sent });
}
