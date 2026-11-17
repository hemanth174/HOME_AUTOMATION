export const DAY_MS = 24 * 60 * 60 * 1000;

export function classifyStatus(status) {
  const code = Number(status);
  if (!Number.isFinite(code) || code <= 0) return 'unknown';
  if (code >= 200 && code < 400) return 'success';
  if (code >= 400 && code < 500) return 'client';
  if (code >= 500 && code < 600) return 'server';
  return 'other';
}

export function successRate(counts = {}) {
  const success = Number(counts.success) || 0;
  const client = Number(counts.client ?? counts.client_errors) || 0;
  const server = Number(counts.server ?? counts.server_errors) || 0;
  const denominator = success + client + server;
  if (denominator <= 0) return null;
  return (success / denominator) * 100;
}

export function ratioPercent(part, total) {
  const value = Number(part);
  const whole = Number(total);
  if (!Number.isFinite(value) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.min(100, Math.max(0, (value / whole) * 100));
}

export function counterDelta(previous, current) {
  const before = Number(previous);
  const after = Number(current);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < 0) return null;
  if (after < before) return null;
  return after - before;
}

export function counterRate(previous, current, elapsedSeconds) {
  const delta = counterDelta(previous, current);
  const seconds = Number(elapsedSeconds);
  if (delta === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return delta / seconds;
}

export function cpuUsagePercent(previous, current) {
  if (!previous || !current) return null;
  const totalDelta = counterDelta(previous.total, current.total);
  const idleDelta = counterDelta(previous.idle, current.idle);
  if (totalDelta === null || idleDelta === null || totalDelta <= 0) return null;
  const busy = totalDelta - idleDelta;
  return Math.min(100, Math.max(0, (busy / totalDelta) * 100));
}

export function splitWindows(startMs, endMs, maxWindowMs = DAY_MS) {
  const start = Number(startMs);
  const end = Number(endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const windows = [];
  let cursor = start;
  while (cursor < end) {
    const next = Math.min(end, cursor + maxWindowMs);
    windows.push({ start: cursor, end: next });
    cursor = next;
  }
  return windows;
}

export function sumSeries(rows, keys) {
  const totals = {};
  for (const key of keys) totals[key] = 0;
  for (const row of rows || []) {
    for (const key of keys) {
      const value = Number(row?.[key]);
      if (Number.isFinite(value)) totals[key] += value;
    }
  }
  return totals;
}

export function mergeServiceRows(rows) {
  const merged = new Map();
  for (const row of rows || []) {
    const source = row?.source;
    if (!source) continue;
    const current = merged.get(source) || {
      source,
      events: 0,
      success: 0,
      client_errors: 0,
      server_errors: 0,
      unknown_status: 0,
      error_events: 0,
      warning_events: 0,
      execution_weight_ms: 0,
      execution_weight: 0,
      max_execution_ms: null,
    };
    current.events += Number(row.events) || 0;
    current.success += Number(row.success) || 0;
    current.client_errors += Number(row.client_errors) || 0;
    current.server_errors += Number(row.server_errors) || 0;
    current.unknown_status += Number(row.unknown_status) || 0;
    current.error_events += Number(row.error_events) || 0;
    current.warning_events += Number(row.warning_events) || 0;
    const avg = Number(row.avg_execution_ms);
    const weighted = Number(row.execution_weight) || Number(row.events) || 0;
    if (Number.isFinite(avg) && weighted > 0) {
      current.execution_weight_ms += avg * weighted;
      current.execution_weight += weighted;
    }
    const max = Number(row.max_execution_ms);
    if (Number.isFinite(max)) current.max_execution_ms = Math.max(current.max_execution_ms || 0, max);
    merged.set(source, current);
  }
  return Array.from(merged.values()).map((item) => ({
    source: item.source,
    events: item.events,
    success: item.success,
    client_errors: item.client_errors,
    server_errors: item.server_errors,
    unknown_status: item.unknown_status,
    error_events: item.error_events,
    warning_events: item.warning_events,
    avg_execution_ms: item.execution_weight > 0 ? item.execution_weight_ms / item.execution_weight : null,
    max_execution_ms: item.max_execution_ms,
  }));
}

export function normalizeHealth(projectStatus, services) {
  const items = Array.isArray(services) ? services : [];
  const healthyServices = items.filter((item) => item.status === 'ACTIVE_HEALTHY');
  const unhealthyServices = items.filter((item) => item.status === 'UNHEALTHY');
  if (!items.length) {
    if (projectStatus === 'ACTIVE_HEALTHY') return 'healthy';
    if (projectStatus === 'ACTIVE_UNHEALTHY') return 'critical';
    return 'unknown';
  }
  if (unhealthyServices.length) return 'critical';
  if (healthyServices.length === items.length) return 'healthy';
  if (items.some((item) => item.status === 'COMING_UP')) return 'warning';
  return 'warning';
}

export function buildAlerts({ overview, metrics } = {}) {
  const alerts = [];
  const observedAt = metrics?.meta?.fetchedAt || overview?.meta?.fetchedAt || new Date().toISOString();
  const edge = overview?.services?.summary?.edge_logs;
  const rate = successRate(edge || {});
  if (rate !== null) {
    const failureRate = 100 - rate;
    if (failureRate > 5) {
      alerts.push({ severity: 'critical', service: 'API Gateway', title: 'Elevated API Gateway failures', value: `${failureRate.toFixed(2)}%`, threshold: '> 5%', observedAt, explanation: 'More than 5% of valid API Gateway responses were 4xx or 5xx.' });
    } else if (failureRate > 1) {
      alerts.push({ severity: 'warning', service: 'API Gateway', title: 'API Gateway failure rate above baseline', value: `${failureRate.toFixed(2)}%`, threshold: '> 1%', observedAt, explanation: 'Between 1% and 5% of valid API Gateway responses were 4xx or 5xx.' });
    }
  }
  const postgres = overview?.services?.summary?.postgres_logs;
  if (postgres && Number(postgres.error_events) > 0) {
    alerts.push({ severity: Number(postgres.error_events) > 10 ? 'critical' : 'warning', service: 'PostgreSQL', title: 'Database error events observed', value: String(postgres.error_events), threshold: '> 0 events', observedAt, explanation: 'PostgreSQL emitted error-severity log events in the observed range.' });
  }
  const functions = overview?.services?.summary?.function_edge_logs;
  if (functions) {
    const fnRate = successRate(functions);
    if (fnRate !== null && 100 - fnRate > 5) {
      alerts.push({ severity: 'warning', service: 'Edge Functions', title: 'Edge Function HTTP failures', value: `${(100 - fnRate).toFixed(2)}%`, threshold: '> 5%', observedAt, explanation: 'Edge Function invocations returned more than 5% 4xx/5xx responses.' });
    }
  }
  const values = metrics?.metrics || {};
  const check = (key, service, label, warn, critical) => {
    const value = values[key]?.value;
    if (!Number.isFinite(value)) return;
    if (value >= critical) {
      alerts.push({ severity: 'critical', service, title: `${label} above critical threshold`, value: `${value.toFixed(1)}%`, threshold: `>= ${critical}%`, observedAt, explanation: `${label} is critically high.` });
    } else if (value >= warn) {
      alerts.push({ severity: 'warning', service, title: `${label} above warning threshold`, value: `${value.toFixed(1)}%`, threshold: `>= ${warn}%`, observedAt, explanation: `${label} is above the configured warning threshold.` });
    }
  };
  check('cpu', 'Database host', 'CPU utilization', 70, 85);
  check('memory', 'Database host', 'Memory utilization', 75, 90);
  check('disk', 'Database host', 'Disk utilization', 80, 90);
  check('connections', 'PostgreSQL', 'Connection utilization', 75, 90);
  return alerts;
}
