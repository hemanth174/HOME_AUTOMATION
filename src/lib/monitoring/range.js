import { MonitoringError } from './management';

export const RANGE_OPTIONS = [
  { key: '1h', label: 'Last 1 hour', ms: 60 * 60 * 1000, usageInterval: '1hr', functionInterval: '15min' },
  { key: '6h', label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000, usageInterval: '1day', functionInterval: '1hr' },
  { key: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000, usageInterval: '1day', functionInterval: '1hr' },
  { key: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000, usageInterval: '7day', functionInterval: '1day' },
  { key: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000, usageInterval: '7day', functionInterval: '1day' },
];

export function parseRange(searchParams) {
  const requested = searchParams.get('range') || '24h';
  if (requested === 'custom') {
    const start = new Date(searchParams.get('start') || '');
    const end = new Date(searchParams.get('end') || '');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new MonitoringError('A valid custom start and end time is required.', { code: 'invalid_range', status: 400, availability: 'unavailable' });
    }
    if (end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new MonitoringError('Custom ranges are limited to 31 days.', { code: 'range_too_large', status: 400, availability: 'unavailable' });
    }
    const duration = end.getTime() - start.getTime();
    const usageInterval = duration <= 60 * 60 * 1000 ? '1hr' : duration <= 24 * 60 * 60 * 1000 ? '1day' : duration <= 3 * 24 * 60 * 60 * 1000 ? '3day' : '7day';
    return { key: 'custom', label: 'Custom range', start: start.getTime(), end: end.getTime(), usageInterval, functionInterval: '1hr' };
  }
  const option = RANGE_OPTIONS.find((item) => item.key === requested) || RANGE_OPTIONS[2];
  const end = Date.now();
  return { key: option.key, label: option.label, start: end - option.ms, end, usageInterval: option.usageInterval, functionInterval: option.functionInterval };
}

export function rangeMeta(range) {
  return {
    key: range.key,
    label: range.label,
    start: new Date(range.start).toISOString(),
    end: new Date(range.end).toISOString(),
  };
}
