export const PROJECT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'services', label: 'Services' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'logs', label: 'Logs' },
  { key: 'health', label: 'Health' },
];

export const RANGE_CHOICES = [
  { key: '1h', label: 'Last 1 hour' },
  { key: '6h', label: 'Last 6 hours' },
  { key: '24h', label: 'Last 24 hours' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Custom range' },
];

export const LOG_SOURCE_CHOICES = [
  'edge_logs',
  'auth_logs',
  'auth_audit_logs',
  'postgres_logs',
  'postgrest_logs',
  'function_edge_logs',
  'function_logs',
  'storage_logs',
  'realtime_logs',
  'supavisor_logs',
];

export const SEVERITY_CHOICES = ['', 'error', 'warning', 'info', 'debug', 'fatal'];

export class MonitoringClientError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MonitoringClientError';
    this.code = options.code || 'client_error';
    this.httpStatus = options.httpStatus || 0;
    this.availability = options.availability || 'unavailable';
  }
}

export async function adminFetch(path, { token, signal } = {}) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok === false) {
    const error = payload?.error || {};
    throw new MonitoringClientError(error.message || `Monitoring request failed (${response.status}).`, {
      code: error.code || 'request_failed',
      httpStatus: response.status,
      availability: error.availability || 'unavailable',
    });
  }
  return payload;
}

export function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function redactSensitive(value) {
  return String(value || '')
    .replace(/(authorization|apikey|api_key|x-api-key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/(password|passwd|secret|token|cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/(sb_secret_|sb_publishable_|service_role)[a-z0-9_-]+/gi, '[redacted-key]');
}

export function formatNumber(value, options = {}) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: options.digits ?? 0 }).format(Number(value));
}

export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

export function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = bytes;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return '—';
  if (value < 1000) return `${value.toFixed(0)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)} s`;
  return `${(value / 60000).toFixed(1)} min`;
}

export function formatTimestamp(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, options.short ? { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' } : undefined);
}

export function timeAgo(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function statusTone(status) {
  if (status === 'ACTIVE_HEALTHY' || status === 'healthy' || status === 'available' || status === 'success' || status === 'CONNECTED') return 'ok';
  if (status === 'UNHEALTHY' || status === 'critical' || status === 'server' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') return 'bad';
  if (status === 'COMING_UP' || status === 'warning' || status === 'client' || status === 'no_data' || status === 'warming_up') return 'warn';
  return 'unknown';
}

export function serviceLabel(source) {
  const labels = {
    edge_logs: 'API Gateway',
    auth_logs: 'Authentication',
    auth_audit_logs: 'Auth Audit',
    postgres_logs: 'PostgreSQL',
    postgrest_logs: 'PostgREST',
    function_edge_logs: 'Edge Functions',
    function_logs: 'Function Runtime',
    storage_logs: 'Storage',
    realtime_logs: 'Realtime',
    supavisor_logs: 'Supavisor',
  };
  return labels[source] || source;
}
