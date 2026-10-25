import { getDeviceWattage, getDeviceRunHoursToday, getDeviceRunMsInWindow } from './helpers';

export function useAnalyticsChartData({ devices, boards, logs, dailyAnalytics, weeklyAnalytics, deviceStats }) {
  const thisWeek = weeklyAnalytics[0];
  const lastWeek = weeklyAnalytics[1];
  const hourlyData = Array.from({ length: 24 }).map((_, i) => { const target = new Date(); target.setHours(new Date().getHours() - (23 - i), 0, 0, 0); const next = new Date(target.getTime() + 60 * 60 * 1000); let usage = 0; devices.forEach((device) => { const runMs = getDeviceRunMsInWindow(device, logs, target.getTime(), next.getTime()); usage += (getDeviceWattage(device.name) * (runMs / (1000 * 60 * 60))) / 1000; }); return { time: `${target.getHours().toString().padStart(2, '0')}:00`, Usage: parseFloat(usage.toFixed(4)) }; });
  const boardData = boards.map((board) => ({ name: board.name, Usage: parseFloat(deviceStats.filter((d) => d.board_id === board.id).reduce((sum, d) => sum + d.kwh, 0).toFixed(4)) }));
  const pieData = deviceStats.map((d) => ({ id: d.id, name: d.name, value: parseFloat(d.kwh.toFixed(4)) })).filter((item) => item.value > 0);
  const uptimeData = deviceStats.map((d) => ({ name: d.name, Hours: parseFloat(d.runHours.toFixed(2)) })).sort((a, b) => b.Hours - a.Hours);
  const heatmapData = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, Events: logs.filter((l) => new Date(l.created_at).getHours() === h).length }));
  const activeDevices2 = deviceStats.filter((d) => d.runHours > 0 || d.kwh > 0);
  const ghostDevices = deviceStats.filter((d) => d.runHours === 0 && d.kwh === 0);
  const ghostPie = [{ name: 'Active', value: activeDevices2.length, fill: '#c9a84c' }, { name: 'Idle / Ghost', value: ghostDevices.length, fill: '#444' }].filter((d) => d.value > 0);
  const thisWeekDays = dailyAnalytics.slice(-7).map((d) => ({ date: d.date, 'This Week': parseFloat((d.total_kwh || 0).toFixed(4)), 'Last Week': 0 }));
  const lastWeekDailyAvg = lastWeek ? parseFloat((lastWeek.total_kwh / 7).toFixed(4)) : 0;
  const wowData = thisWeekDays.map((d) => ({ ...d, 'Last Week': lastWeekDailyAvg }));
  const radarData = boards.map((board) => ({ board: board.name, 'Active Hours': parseFloat(deviceStats.filter((d) => d.board_id === board.id).reduce((sum, d) => sum + d.runHours, 0).toFixed(2)) }));
  const scatterData = devices.map((dev) => { const toggles = thisWeek ? parseInt(thisWeek.toggle_counts?.[dev.id] || 0) : logs.filter((l) => l.device_id === dev.id).length; const minutes = thisWeek ? parseFloat(thisWeek.usage_duration?.[dev.id] || 0) : parseFloat((getDeviceRunHoursToday(dev, logs) * 60).toFixed(1)); return { name: dev.name, toggles, avgMinutes: toggles > 0 ? parseFloat((minutes / toggles).toFixed(1)) : 0 }; }).filter((d) => d.toggles > 0 || d.avgMinutes > 0);
  const errorDevices = devices.filter((d) => d.feedback_on !== null && d.is_on !== d.feedback_on);
  const reliabilityPct = devices.length > 0 ? Math.round(((devices.length - errorDevices.length) / devices.length) * 100) : 100;
  const gaugeColor = reliabilityPct >= 90 ? '#22c55e' : reliabilityPct >= 70 ? '#f59e0b' : '#ef4444';
  const gaugeData = [{ name: 'Reliability', value: reliabilityPct, fill: gaugeColor }];
  const peakMap = thisWeek?.peak_hours || {};
  const sortedPeaks = Object.entries(peakMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([hour, count]) => ({ hour, count: parseInt(count) }));
  const automationData = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, Events: parseInt(peakMap[`${String(h).padStart(2, '0')}:00`] || 0) }));
  const alwaysOnData = devices.map((dev) => { const minutes = thisWeek ? parseFloat(thisWeek.usage_duration?.[dev.id] || 0) : parseFloat((getDeviceRunHoursToday(dev, logs) * 60).toFixed(1)); return { name: dev.name, Minutes: minutes, alwaysOn: minutes >= 60 * 20 }; }).sort((a, b) => b.Minutes - a.Minutes);
  const relayColors = ['#c9a84c', '#e6c875', '#8c7030', '#ffd670'];
  const relayData = boards.map((board) => { const entry = { board: board.name }; for (let r = 0; r <= 3; r++) { const dev = deviceStats.find((d) => d.board_id === board.id && d.relay_index === r); entry[`Relay ${r}`] = dev ? parseFloat(dev.runHours.toFixed(2)) : 0; } return entry; });
  return { thisWeek, lastWeek, hourlyData, boardData, pieData, uptimeData, heatmapData, activeDevices2, ghostDevices, ghostPie, wowData, radarData, scatterData, errorDevices, reliabilityPct, gaugeColor, gaugeData, peakMap, sortedPeaks, automationData, alwaysOnData, hasAlwaysOn: alwaysOnData.some((d) => d.alwaysOn), relayColors, relayData, relayHasData: relayData.some((b) => [0, 1, 2, 3].some((r) => b[`Relay ${r}`] > 0)) };
}
