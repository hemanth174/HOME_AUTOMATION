import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireAdmin } from '@/lib/adminServer';
import { STAGES, CATEGORY_LABELS } from '@/lib/orderCategories';

export const dynamic = 'force-dynamic';

const adminEmails = ['lrvkausthubh@gmail.com', 'ramasaiahemanth@gmail.com'];

async function sendStageEmail(order, stage) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass || !order.email) return { skipped: true };
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
  const trackingUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/track/${order.order_id}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `VikaTech <${user}>`,
    to: order.email,
    bcc: adminEmails.join(','),
    subject: `${order.order_id} is now ${stage}`,
    text: `Hi ${order.full_name || 'there'}, your ${CATEGORY_LABELS[order.category] || 'project'} is now at the ${stage} stage. Track it here: ${trackingUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;padding:28px;color:#e2e2e8;background:#111317"><p style="color:#00ff41;font-weight:bold;letter-spacing:2px">VIKATECH SYSTEM UPDATE</p><h2>Your project is now ${stage}</h2><p>Hi ${order.full_name || 'there'}, your ${CATEGORY_LABELS[order.category] || 'project'} has moved forward.</p><p style="color:#00e5ff;font-weight:bold">Order ${order.order_id}</p><a href="${trackingUrl}" style="display:inline-block;background:#00ff41;color:#003907;padding:12px 18px;text-decoration:none;font-weight:bold">Track project →</a></div>`,
  });
  return { sent: true };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data: orders, error } = await auth.admin.from('order_trackings').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: usersData } = await auth.admin.auth.admin.listUsers({ perPage: 1000 });
  return NextResponse.json({ orders: orders || [], users: usersData?.users || [] });
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { orderId, recordId, status } = await request.json();
  if (!orderId || !STAGES.includes(status)) return NextResponse.json({ error: 'A valid order and stage are required' }, { status: 400 });
  // Update the exact row selected in the console when its primary key is
  // available. This prevents duplicate legacy order numbers from making the
  // UI appear updated while another row is returned after reload.
  let currentQuery = auth.admin.from('order_trackings').select('*');
  currentQuery = recordId ? currentQuery.eq('id', recordId) : currentQuery.eq('order_id', orderId).order('created_at', { ascending: false });
  const { data: currentRows, error: readError } = await currentQuery.limit(1);
  const current = currentRows?.[0];
  if (readError || !current) return NextResponse.json({ error: readError?.message || 'Order not found' }, { status: 404 });
  if (current.status === status) return NextResponse.json({ order: current, email: { skipped: true } });
  const history = Array.isArray(current.status_history) ? current.status_history : [];
  const status_history = [...history, { status, at: new Date().toISOString(), updated_by: auth.user.email }];
  let updateQuery = auth.admin
    .from('order_trackings')
    .update({ status, status_history });
  updateQuery = recordId ? updateQuery.eq('id', recordId) : updateQuery.eq('order_id', orderId);
  const { error } = await updateQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let refreshedQuery = auth.admin.from('order_trackings').select('*');
  refreshedQuery = recordId ? refreshedQuery.eq('id', recordId) : refreshedQuery.eq('order_id', orderId).order('created_at', { ascending: false });
  const { data: refreshedRows, error: refreshedError } = await refreshedQuery
    .limit(1);
  const order = refreshedRows?.[0];
  if (refreshedError || !order) return NextResponse.json({ error: refreshedError?.message || 'Order updated but could not be reloaded' }, { status: 500 });
  if (order.status !== status) return NextResponse.json({ error: `Database did not save the requested stage (still ${order.status})` }, { status: 409 });
  try {
    const email = await sendStageEmail(order, status);
    return NextResponse.json({ order, email });
  } catch (emailError) {
    return NextResponse.json({ order, email: { sent: false, error: emailError.message } });
  }
}
