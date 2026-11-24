import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAdminSupabase } from '@/lib/adminServer';
import { analyticsReportEmail } from '@/lib/emailTemplates';
import { createAnalyticsReportPdf } from '@/lib/analyticsReportPdf';
import { reportPeriodDue } from '@/lib/analyticsReportPeriod';
import { getDeviceWattage } from '@/app/analytics/helpers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function loadReportData(admin, userId, period) {
  const [boards, devices, daily, weekly, logs, schedules, alarms] = await Promise.all([
    admin.from('boards').select('id,name').eq('user_id', userId).is('deleted_at', null),
    admin.from('devices').select('id,name,board_id').eq('user_id', userId).is('deleted_at', null),
    admin.from('daily_analytics').select('date,total_kwh,total_cost,avg_on_time,usage_duration,toggle_counts')
      .eq('user_id', userId).gte('date', period.startDate).lte('date', period.endDate).order('date'),
    admin.from('weekly_analytics').select('week_start,week_end,total_kwh,total_cost,usage_duration')
      .eq('user_id', userId).gte('week_start', period.startDate).lte('week_start', period.endDate).order('week_start'),
    admin.from('activity_logs').select('created_at,device_name,action,triggered_by')
      .eq('user_id', userId).gte('created_at', period.startAt).lt('created_at', period.endAt)
      .order('created_at', { ascending: false }).limit(1000),
    admin.from('schedules').select('time,days,action,enabled,devices(name)')
      .eq('user_id', userId).is('deleted_at', null),
    admin.from('alarms').select('trigger_at,action,fired,devices(name)')
      .eq('user_id', userId).is('deleted_at', null),
  ]);
  const failure = [boards, devices, daily, weekly, logs, schedules, alarms].find((item) => item.error)?.error;
  if (failure) throw new Error(failure.message);
  return {
    boards: boards.data || [], devices: devices.data || [],
    dailyAnalytics: daily.data || [], weeklyAnalytics: weekly.data || [],
    fullLogs: logs.data || [], schedules: schedules.data || [], alarms: alarms.data || [],
  };
}

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({ error: 'SMTP is not configured' }, { status: 503 });
  }
  const admin = getAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Admin service is not configured' }, { status: 503 });
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const now = new Date();
  const stats = { considered: 0, sent: 0, alreadySent: 0, failed: 0, errors: [] };
  for (let offset = 0; ; offset += 500) {
    const { data: preferences, error } = await admin.from('user_settings')
      .select('user_id,analytics_report_frequency,timezone,tariff_per_kwh,voltage,currency')
      .neq('analytics_report_frequency', 'off').order('user_id').range(offset, offset + 499);
    if (error) return NextResponse.json({ error: `Could not load report preferences: ${error.message}` }, { status: 500 });
    for (const settings of preferences || []) {
      const frequency = settings.analytics_report_frequency;
      let period;
      try { period = reportPeriodDue(now, settings.timezone || 'Asia/Kolkata', frequency); }
      catch (caught) { stats.errors.push(`Invalid time zone for ${settings.user_id}: ${caught.message}`); continue; }
      if (!period) continue;
      stats.considered += 1;
      const { data: deliveryId, error: claimError } = await admin.rpc('claim_analytics_report_delivery', {
        p_user_id: settings.user_id, p_frequency: frequency,
        p_period_start: period.startDate, p_period_end: period.endDate,
      });
      if (claimError) { stats.errors.push(`Could not claim report for ${settings.user_id}: ${claimError.message}`); continue; }
      if (!deliveryId) { stats.alreadySent += 1; continue; }
      let sentToSmtp = false;
      try {
        const { data: account, error: accountError } = await admin.auth.admin.getUserById(settings.user_id);
        if (accountError || !account?.user?.email) throw new Error(accountError?.message || 'Account email is missing');
        const report = await loadReportData(admin, settings.user_id, period);
        const periodKwh = report.dailyAnalytics.reduce((sum, row) => sum + (Number(row.total_kwh) || 0), 0);
        const periodCost = report.dailyAnalytics.reduce((sum, row) => sum + (Number(row.total_cost) || 0), 0);
        const { pdf, filename } = await createAnalyticsReportPdf({
          ...report, userSettings: settings,
          deviceStats: report.devices.map((device) => ({ ...device, wattage: getDeviceWattage(device.name || ''), runHours: null, kwh: null, verified: false })),
          periodLabel: `${frequency} report ${period.startDate} to ${period.endDate}`,
          overviewRows: [
            ['Reporting period', `${period.startDate} to ${period.endDate}`, `${frequency} summary`],
            ['Estimated consumption', `${periodKwh.toFixed(4)} kWh`, 'From stored daily analytics; not a power meter'],
            ['Estimated cost', `${settings.currency || 'INR'} ${periodCost.toFixed(2)}`, 'From stored daily analytics'],
            ['Days with records', String(report.dailyAnalytics.length), 'Missing days have no verified total'],
          ],
        });
        const email = analyticsReportEmail(period);
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `VikaTech <${process.env.SMTP_USER}>`,
          to: account.user.email, ...email,
          attachments: [{ filename, content: Buffer.from(pdf.output('arraybuffer')), contentType: 'application/pdf' }],
        });
        sentToSmtp = true;
        const { error: updateError } = await admin.from('analytics_report_deliveries')
          .update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', deliveryId);
        if (updateError) throw new Error(`Email sent but delivery record failed: ${updateError.message}`);
        stats.sent += 1;
      } catch (caught) {
        stats.failed += 1;
        stats.errors.push(`Report ${deliveryId}: ${caught.message}`);
        // Once SMTP accepted the message, keep the claim in place rather than
        // marking it retryable and sending a duplicate report.
        if (!sentToSmtp) {
          await admin.from('analytics_report_deliveries')
            .update({ status: 'failed', error: String(caught.message).slice(0, 500) }).eq('id', deliveryId);
        }
      }
    }
    if ((preferences || []).length < 500) break;
  }
  return NextResponse.json({ ok: stats.errors.length === 0, ranAt: now.toISOString(), ...stats });
}
