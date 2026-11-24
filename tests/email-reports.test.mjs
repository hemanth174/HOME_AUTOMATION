import test from 'node:test';
import assert from 'node:assert/strict';
import { orderReceivedEmail, orderStageEmail, analyticsReportEmail } from '../src/lib/emailTemplates.js';
import { createAnalyticsReportPdf } from '../src/lib/analyticsReportPdf.js';

test('order emails include a trackable link and escape customer input in HTML', () => {
  const order = { order_id: 'VK-123', full_name: '<script>alert(1)</script>', category: 'home' };
  const received = orderReceivedEmail(order, 'Smart home');
  const updated = orderStageEmail(order, 'In progress', 'Smart home');
  assert.match(received.html, /track\/VK-123/);
  assert.doesNotMatch(received.html, /<script>/);
  assert.match(received.html, /&lt;script&gt;/);
  assert.match(updated.text, /In progress/);
  assert.match(updated.html, /track\/VK-123/);
});

test('report email names its date range and includes an attachment explanation', () => {
  const message = analyticsReportEmail({ frequency: 'weekly', startDate: '2026-11-16', endDate: '2026-11-22' });
  assert.match(message.subject, /weekly energy report/);
  assert.match(message.text, /2026-11-16 through 2026-11-22/);
  assert.match(message.html, /PDF/);
});

test('shared analytics PDF renders on the server with real historical rows', async () => {
  const { pdf } = await createAnalyticsReportPdf({
    generatedAt: new Date('2026-11-24T00:00:00.000Z'),
    periodLabel: 'Weekly report 2026-11-16 to 2026-11-22',
    boards: [{ id: 'board-1', name: 'Penthouse' }],
    devices: [{ id: 'device-1', name: 'Light' }],
    deviceStats: [{ id: 'device-1', board_id: 'board-1', name: 'Light', wattage: 12, runHours: null, kwh: null, verified: false }],
    dailyAnalytics: [{ date: '2026-11-20', total_kwh: 0.12, total_cost: 0.96, avg_on_time: 10, usage_duration: { 'device-1': 600 } }],
    userSettings: { currency: 'INR', tariff_per_kwh: 8 },
  });
  assert.ok(pdf.output('arraybuffer').byteLength > 10_000);
  assert.equal(pdf.internal.getNumberOfPages() >= 1, true);
});
