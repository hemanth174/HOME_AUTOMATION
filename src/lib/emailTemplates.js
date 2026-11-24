const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://home-automation-mauve-one.vercel.app';

export function escapeEmailHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function siteLink(path) {
  const base = BASE_URL.replace(/\/$/, '');
  return `${base}${path}`;
}

function emailFrame({ preview, eyebrow, title, introduction, rows = [], action, note }) {
  const safePreview = escapeEmailHtml(preview);
  const details = rows.map(([label, value]) => `
    <tr><td style="padding:10px 0;color:#5e6872;font-size:13px;vertical-align:top">${escapeEmailHtml(label)}</td>
    <td style="padding:10px 0;color:#16251e;font-size:13px;font-weight:700;text-align:right;vertical-align:top">${escapeEmailHtml(value)}</td></tr>`).join('');
  const actionHtml = action ? `<tr><td style="padding:22px 28px 8px;text-align:center"><a href="${escapeEmailHtml(action.url)}" style="display:inline-block;border-radius:10px;background:#08764b;color:#ffffff;font-size:14px;font-weight:700;line-height:20px;padding:13px 20px;text-decoration:none">${escapeEmailHtml(action.label)}</a></td></tr>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeEmailHtml(title)}</title></head>
  <body style="margin:0;padding:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#17241d">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${safePreview}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f6f4"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dce5df;border-radius:16px;overflow:hidden">
  <tr><td style="background:#073d2b;padding:20px 28px;color:#ffffff;font-size:21px;font-weight:800;letter-spacing:-.3px">Vika<span style="color:#79e8af">Tech</span></td></tr>
  <tr><td style="padding:28px 28px 8px"><p style="margin:0 0 9px;color:#08764b;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">${escapeEmailHtml(eyebrow)}</p><h1 style="margin:0;color:#17241d;font-size:25px;line-height:1.2">${escapeEmailHtml(title)}</h1><p style="margin:14px 0 0;color:#4a5b50;font-size:15px;line-height:1.6">${escapeEmailHtml(introduction)}</p></td></tr>
  ${rows.length ? `<tr><td style="padding:12px 28px 0"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e2e9e4;border-bottom:1px solid #e2e9e4">${details}</table></td></tr>` : ''}
  ${actionHtml}
  ${note ? `<tr><td style="padding:12px 28px 22px;color:#64736a;font-size:12px;line-height:1.5">${escapeEmailHtml(note)}</td></tr>` : '<tr><td style="height:20px"></td></tr>'}
  </table><p style="margin:18px 0 0;color:#6c7971;font-size:11px;line-height:1.5">VikaTech Home Automation · This is an account update.</p>
  </td></tr></table></body></html>`;
}

export function orderReceivedEmail(order, categoryLabel) {
  const url = siteLink(`/track/${encodeURIComponent(order.order_id)}`);
  const name = order.full_name || 'there';
  const subject = `VikaTech order ${order.order_id} received`;
  return {
    subject,
    text: `Hi ${name}, we received your ${categoryLabel || 'project'} request (${order.order_id}). It is waiting for administrator approval. Track its progress: ${url}`,
    html: emailFrame({
      preview: `Your request ${order.order_id} was received.`,
      eyebrow: 'Order confirmation', title: 'We received your request',
      introduction: `Hi ${name}, your ${categoryLabel || 'project'} request is waiting for administrator approval. We will email you when its status changes.`,
      rows: [['Order ID', order.order_id], ['Category', categoryLabel || 'Project'], ['Current status', 'Waiting for approval']],
      action: { label: 'Track your request', url },
      note: 'You can use the tracking page at any time to see the latest status.',
    }),
  };
}

export function orderStageEmail(order, stage, categoryLabel) {
  const url = siteLink(`/track/${encodeURIComponent(order.order_id)}`);
  const name = order.full_name || 'there';
  return {
    subject: `VikaTech order ${order.order_id}: ${stage}`,
    text: `Hi ${name}, your ${categoryLabel || 'project'} request (${order.order_id}) is now at the ${stage} stage. Track it here: ${url}`,
    html: emailFrame({
      preview: `Your order ${order.order_id} is now ${stage}.`,
      eyebrow: 'Order update', title: `Your project is now ${stage}`,
      introduction: `Hi ${name}, your ${categoryLabel || 'project'} request has moved to a new stage.`,
      rows: [['Order ID', order.order_id], ['Category', categoryLabel || 'Project'], ['Current stage', stage]],
      action: { label: 'View order status', url },
      note: 'This update reflects the latest stage recorded by the VikaTech team.',
    }),
  };
}

export function analyticsReportEmail({ frequency, startDate, endDate }) {
  const label = frequency === 'weekly' ? 'Weekly' : 'Monthly';
  const url = siteLink('/analytics');
  return {
    subject: `Your VikaTech ${label.toLowerCase()} energy report`,
    text: `Your ${label.toLowerCase()} energy report for ${startDate} through ${endDate} is attached as a PDF. Open your analytics dashboard: ${url}`,
    html: emailFrame({
      preview: `Your ${label.toLowerCase()} analytics PDF is attached.`,
      eyebrow: 'Energy report', title: `Your ${label.toLowerCase()} report is ready`,
      introduction: 'Your requested analytics report is attached as a PDF. The figures are estimates based on recorded device activity, not power meter readings.',
      rows: [['Reporting period', `${startDate} to ${endDate}`], ['Attachment', 'PDF report']],
      action: { label: 'Open analytics', url },
      note: 'You can change the report frequency in Settings at any time.',
    }),
  };
}
