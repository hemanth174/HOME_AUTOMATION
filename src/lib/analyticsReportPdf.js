export async function createAnalyticsReportPdf({
  devices = [], boards = [], deviceStats = [], userSettings = {}, dailyAnalytics = [],
  weeklyAnalytics = [], fullLogs = [], schedules = [], alarms = [],
  logoDataUrl = null, periodLabel = 'Last 30 days', overviewRows = null,
  generatedAt = new Date(),
}) {
  const [jspdfModule, autoTableModule] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'),
  ]);
  const JsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
  const autoTable = autoTableModule.autoTable || autoTableModule.default;
  const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const reportId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const boardById = new Map(boards.map((board) => [board.id, board.name]));
  const number = (value, digits = 2) => {
    const numeric = value === null || value === undefined ? NaN : Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : '—';
  };
  const durationHours = (durationByDevice) => {
    if (!durationByDevice || typeof durationByDevice !== 'object' || Array.isArray(durationByDevice)) return null;
    const minutes = Object.values(durationByDevice).reduce((sum, value) => {
      const numeric = Number(value);
      return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);
    return minutes / 60;
  };
  const oldestRebuildableDay = new Date(generatedAt);
  oldestRebuildableDay.setUTCDate(oldestRebuildableDay.getUTCDate() - 6);
  const oldestRebuildableDate = oldestRebuildableDay.toISOString().slice(0, 10);
  const unverifiedHistoricalRow = (row) =>
    row.date < oldestRebuildableDate && Number(row.total_kwh) === 0 &&
    Object.values(row.toggle_counts || {}).some((count) => Number(count) > 0);
  const date = (value) => value ? new Date(value).toLocaleString('en-IN') : 'Not recorded';
  const days = (value) => {
    if (!Array.isArray(value)) return value || 'Every day';
    if (value.length === 7) return 'Every day';
    return value.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(day)] || day).join(', ');
  };
  const currency = userSettings.currency || 'INR';

  pdf.setProperties({
    title: `Power Analytics Report ${reportId}`,
    subject: 'Home energy and device overview',
    author: 'VikaTech Home Automation',
    keywords: `report-id:${reportId}`,
  });
  pdf.setFillColor(24, 24, 24);
  pdf.rect(0, 0, pageWidth, 34, 'F');
  let titleX = 14;
  if (logoDataUrl) {
    const logoProperties = pdf.getImageProperties(logoDataUrl);
    const logoHeight = 16;
    const logoWidth = (logoProperties.width / logoProperties.height) * logoHeight;
    pdf.addImage(logoDataUrl, 'PNG', 14, 7, logoWidth, logoHeight);
    titleX = 14 + logoWidth + 7;
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('POWER ANALYTICS', titleX, 15);
  pdf.setTextColor(201, 168, 76);
  pdf.setFontSize(9);
  pdf.text(periodLabel.toUpperCase(), titleX, 22);
  pdf.setTextColor(210, 210, 210);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Generated ${date(generatedAt)}`, pageWidth - 14, 15, { align: 'right' });
  pdf.text(`${devices.length} devices / ${boards.length} boards`, pageWidth - 14, 22, { align: 'right' });
  pdf.setFontSize(6.5);
  pdf.setTextColor(170, 170, 170);
  pdf.text(`Report ID ${reportId}`, pageWidth - 14, 29, { align: 'right' });

  let cursorY = 43;
  const addSection = (title, head, body) => {
    if (cursorY > pageHeight - 48) { pdf.addPage(); cursorY = 18; }
    pdf.setTextColor(36, 36, 36);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, 14, cursorY);
    autoTable(pdf, {
      startY: cursorY + 4, head: [head],
      body: body.length ? body : [['No data available', ...Array(Math.max(0, head.length - 1)).fill('')]],
      theme: 'grid', margin: { left: 14, right: 14 },
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, textColor: [45, 45, 45], overflow: 'linebreak' },
      headStyles: { fillColor: [44, 44, 44], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 245, 239] },
      columnStyles: { 0: { cellWidth: 'auto' } },
    });
    cursorY = pdf.lastAutoTable.finalY + 10;
  };

  const defaultOverview = [
    ['Consumption today', `${number(deviceStats.reduce((sum, item) => sum + (item.kwh || 0), 0), 4)} kWh`, 'Estimated from recorded runtime'],
    ['Estimated cost today', `${currency} ${number(deviceStats.reduce((sum, item) => sum + (item.kwh || 0), 0) * Number(userSettings.tariff_per_kwh || 8), 4)}`, `Tariff ${number(userSettings.tariff_per_kwh, 2)} / kWh`],
    ['Current live draw', `${deviceStats.filter((item) => item.is_on).reduce((sum, item) => sum + (item.wattage || 0), 0)} W`, 'From current relay state; no power meter'],
    ['Active devices', `${deviceStats.filter((item) => item.is_on).length} of ${devices.length}`, 'Current relay state'],
  ];
  addSection('Overview', ['Metric', 'Value', 'Details'], overviewRows || defaultOverview);
  const historicalReport = deviceStats.some((device) => device.verified === false);
  addSection(historicalReport ? 'Configured Devices' : 'Current Devices', ['Board / room', 'Device', 'State', 'Watts est.', 'Hours today', 'kWh today'], deviceStats.map((device) => [
    boardById.get(device.board_id) || 'Unassigned', device.name || 'Unnamed device',
    device.verified === false ? 'Unverified' : device.is_on ? 'ON' : 'OFF', String(device.wattage ?? '—'), number(device.runHours), number(device.kwh, 4),
  ]));
  addSection('Daily Energy History', ['Date', 'Energy kWh', 'Cost', 'Avg on-time', 'Usage duration'], dailyAnalytics.map((row) =>
    unverifiedHistoricalRow(row)
      ? [row.date || '-', 'Unverified', 'Unverified', 'Unverified', 'Unverified']
      : [row.date || '-', number(row.total_kwh, 4), `${currency} ${number(row.total_cost, 2)}`,
        `${number(row.avg_on_time)} hrs`, `${number(durationHours(row.usage_duration))} hrs`],
  ));
  addSection('Weekly Comparison', ['Week', 'Energy kWh', 'Cost', 'Usage duration'], weeklyAnalytics.map((row) => [
    `${row.week_start || '-'} to ${row.week_end || '-'}`,
    number(row.total_kwh, 4), `${currency} ${number(row.total_cost, 2)}`,
    `${number(durationHours(row.usage_duration))} hrs`,
  ]));
  addSection('Activity Log', ['Timestamp', 'Device', 'Action', 'Triggered by'], fullLogs.map((log) => [
    date(log.created_at), log.device_name || 'Unknown', log.action || '-', log.triggered_by || '-',
  ]));
  addSection('Automation Schedules', ['Device', 'Time', 'Days', 'Action', 'Status'], schedules.map((schedule) => [
    schedule.devices?.name || 'Unknown', schedule.time || '-', days(schedule.days),
    schedule.action ? 'ON' : 'OFF', schedule.enabled ? 'Active' : 'Disabled',
  ]));
  addSection('Alarms', ['Device', 'Trigger time', 'Action', 'Status'], alarms.map((alarm) => [
    alarm.devices?.name || 'Unknown', date(alarm.trigger_at), alarm.action ? 'ON' : 'OFF', alarm.fired ? 'Executed' : 'Pending',
  ]));
  if (dailyAnalytics.some(unverifiedHistoricalRow)) {
    addSection('Data note', ['Historical limits'], [[
      'Unverified means device activity was logged, but the older stored energy total was zero. If the underlying activity logs were already removed, that estimate cannot be reconstructed.',
    ]]);
  }

  const totalPages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(220, 220, 220);
    pdf.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text('VikaTech Home Automation', 14, pageHeight - 7);
    pdf.text(`Page ${page} of ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }
  const filename = `power-analytics-${generatedAt.toISOString().slice(0, 10)}-${reportId}.pdf`;
  return { pdf, filename, reportId };
}
