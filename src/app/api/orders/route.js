import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminSupabase } from '@/lib/adminServer';
import { ORDER_APPROVAL_STATUSES } from '@/lib/approval';
import { STAGES, CATEGORY_LABELS, generateOrderId } from '@/lib/orderCategories';

export const dynamic = 'force-dynamic';

async function sendOrderEmail(order) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return { skipped: true };
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: parseInt(process.env.SMTP_PORT || '587', 10), secure: process.env.SMTP_SECURE === 'true', auth: { user, pass } });
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/track/${order.order_id}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `VikaTech <${user}>`,
    to: order.email,
    bcc: 'lrvkausthubh@gmail.com,ramasaiahemanth@gmail.com',
    subject: `VikaTech order ${order.order_id} received`,
    text: `Your VikaTech request was received. Track it here: ${url}`,
    html: `<div style="font-family:Arial,sans-serif;padding:28px;color:#17202a"><h2>VikaTech request received</h2><p>Your request is waiting for administrator approval.</p><p><b>Order ${order.order_id}</b></p><a href="${url}">View request status →</a></div>`,
  });
  return { sent: true };
}

export async function POST(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const admin = getAdminSupabase();
  if (!token || !admin) return NextResponse.json({ error: 'Order service is not configured' }, { status: 503 });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Please sign in before booking' }, { status: 401 });
  const body = await request.json();
  if (!body.full_name || !body.phone || !body.category || !body.email) return NextResponse.json({ error: 'Name, email, phone, and category are required' }, { status: 400 });
  const { data: approvals } = await admin.from('account_approval_requests').select('account_status, admin_one_approved_at, admin_two_approved_at').eq('user_id', user.id).limit(1);
  const approval = approvals?.[0];
  const fullyApproved = approval?.account_status === 'approved' && approval.admin_one_approved_at && approval.admin_two_approved_at;
  const approval_status = fullyApproved ? ORDER_APPROVAL_STATUSES.APPROVED : ORDER_APPROVAL_STATUSES.ACCOUNT;
  const order = { order_id: generateOrderId(), user_id: user.id, full_name: body.full_name, email: body.email, phone: body.phone, category: body.category, details: body.details || {}, address: body.address || '', lat: body.lat ?? null, lng: body.lng ?? null, status: STAGES[0], approval_status, status_history: [{ status: STAGES[0], at: new Date().toISOString() }] };
  const { data, error } = await admin.from('order_trackings').insert(order).select('*').limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const created = data?.[0];
  let email = { skipped: true };
  try { email = await sendOrderEmail({ ...created, email: body.email }); } catch (emailError) { email = { sent: false, error: emailError.message }; }
  return NextResponse.json({ order: created, email }, { status: 201 });
}
