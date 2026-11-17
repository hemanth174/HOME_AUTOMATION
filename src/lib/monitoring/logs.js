import { splitWindows, mergeServiceRows } from './calculations.mjs';
import { MonitoringError, queryLogs } from './management';

export const LOG_SOURCES = ['edge_logs', 'auth_logs', 'auth_audit_logs', 'postgres_logs', 'postgrest_logs', 'function_edge_logs', 'function_logs', 'storage_logs', 'realtime_logs', 'supavisor_logs'];
const SERVICE_SOURCES = ['edge_logs', 'auth_logs', 'function_edge_logs', 'postgres_logs', 'realtime_logs', 'storage_logs'];
const SEVERITIES = ['error', 'warning', 'info', 'debug', 'fatal'];
const STATUS_SOURCES = new Set(['edge_logs', 'function_edge_logs', 'storage_logs', 'auth_logs']);
const MAX_ROW_LIMIT = 200;
const MAX_SEARCH_LENGTH = 160;

const STATUS_EXPR = "multiIf(source IN ('edge_logs','function_edge_logs'), toInt32OrZero(log_attributes['response.status_code']), source = 'storage_logs', toInt32OrZero(log_attributes['res.statusCode']), source = 'auth_logs', toInt32OrZero(log_attributes['status']), 0)";

function clickHouseTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new MonitoringError('Invalid time range supplied.', { code: 'invalid_range', status: 400, availability: 'unavailable' });
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function sqlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function timeBounds(start, end) {
  return `timestamp >= toDateTime64('${clickHouseTimestamp(start)}', 3, 'UTC') and timestamp < toDateTime64('${clickHouseTimestamp(end)}', 3, 'UTC')`;
}

export function validateSource(source) {
  return LOG_SOURCES.includes(source) ? source : 'edge_logs';
}

function validateSeverity(severity) {
  const value = String(severity || '').toLowerCase();
  return SEVERITIES.includes(value) ? value : '';
}

function validateStatus(status) {
  if (status === null || status === undefined || status === '') return null;
  const value = Number(status);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function validateSearch(search) {
  return String(search || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_SEARCH_LENGTH);
}

function redactText(value) {
  return String(value || '')
    .replace(/(authorization|apikey|api_key|x-api-key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/(password|passwd|secret|token|cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/(sb_secret_|sb_publishable_|service_role)[a-z0-9_-]+/gi, '[redacted-key]');
}

function redactRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    event_message: redactText(row.event_message),
    path: row.path ? redactText(row.path) : row.path,
    pathname: row.pathname ? redactText(row.pathname) : row.pathname,
  };
}

export function buildLogsQuery({ source, severity, status, search, start, end, sort = 'desc', limit = 50 }) {
  const safeSource = validateSource(source);
  const safeSeverity = validateSeverity(severity);
  const safeStatus = validateStatus(status);
  const safeSearch = validateSearch(search);
  const direction = sort === 'asc' ? 'asc' : 'desc';
  const safeLimit = Math.min(MAX_ROW_LIMIT, Math.max(1, Number(limit) || 50));
  const conditions = [`source = '${safeSource}'`, timeBounds(start, end)];
  if (safeSeverity) conditions.push(`lower(severity_text) = '${safeSeverity}'`);
  if (safeStatus) conditions.push(`${STATUS_EXPR} = ${safeStatus}`);
  if (safeSearch) {
    const escaped = sqlString(safeSearch);
    conditions.push(`(event_message ilike '%${escaped}%' or log_attributes['request_id'] = '${escaped}' or log_attributes['trace_id'] = '${escaped}')`);
  }
  return `select timestamp, id, source, severity_text, event_message, ${STATUS_EXPR} as status, log_attributes['request_id'] as request_id, log_attributes['trace_id'] as trace_id, log_attributes['request.method'] as method, log_attributes['request.path'] as path, log_attributes['request.pathname'] as pathname from logs where ${conditions.join(' and ')} order by timestamp ${direction} limit ${safeLimit}`;
}

function buildSummaryQuery(start, end) {
  return `select source, count() as events, countIf(${STATUS_EXPR} between 200 and 399) as success, countIf(${STATUS_EXPR} between 400 and 499) as client_errors, countIf(${STATUS_EXPR} between 500 and 599) as server_errors, countIf(${STATUS_EXPR} = 0) as unknown_status, countIf(lower(severity_text) in ('error','fatal','critical')) as error_events, countIf(lower(severity_text) in ('warning','warn')) as warning_events, avgIf(toFloat64OrZero(log_attributes['execution_time_ms']), log_attributes['execution_time_ms'] != '') as avg_execution_ms, maxIf(toFloat64OrZero(log_attributes['execution_time_ms']), log_attributes['execution_time_ms'] != '') as max_execution_ms from logs where source in ('${SERVICE_SOURCES.join("','")}') and ${timeBounds(start, end)} group by source limit 20`;
}

function buildMethodQuery(start, end) {
  return `select source, log_attributes['request.method'] as method, count() as events from logs where source in ('edge_logs','function_edge_logs') and log_attributes['request.method'] != '' and ${timeBounds(start, end)} group by source, method order by events desc limit 40`;
}

function buildPathQuery(start, end) {
  return `select source, log_attributes['request.path'] as path, count() as events from logs where source in ('edge_logs','function_edge_logs') and log_attributes['request.path'] != '' and ${timeBounds(start, end)} group by source, path order by events desc limit 30`;
}

function buildRecentFailuresQuery(start, end, limit = 20) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  return `select timestamp, id, source, severity_text, event_message, ${STATUS_EXPR} as status, log_attributes['request_id'] as request_id, log_attributes['trace_id'] as trace_id, log_attributes['request.method'] as method, log_attributes['request.path'] as path from logs where source in ('edge_logs','function_edge_logs','storage_logs','auth_logs') and ${STATUS_EXPR} between 400 and 599 and ${timeBounds(start, end)} order by timestamp desc limit ${safeLimit}`;
}

function buildRecentWarningsQuery(start, end, limit = 30) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  return `select timestamp, id, source, severity_text, event_message, ${STATUS_EXPR} as status, log_attributes['request_id'] as request_id, log_attributes['trace_id'] as trace_id from logs where source in ('${SERVICE_SOURCES.join("','")}') and lower(severity_text) in ('error','fatal','critical','warning','warn') and ${timeBounds(start, end)} order by timestamp desc limit ${safeLimit}`;
}

async function runWindow(project, sql, window) {
  const payload = await queryLogs(project, {
    sql,
    startIso: new Date(window.start).toISOString(),
    endIso: new Date(window.end).toISOString(),
  });
  return Array.isArray(payload?.result) ? payload.result : [];
}

export async function fetchLogRows(project, filters) {
  const windows = splitWindows(new Date(filters.start).getTime(), new Date(filters.end).getTime());
  if (!windows.length) throw new MonitoringError('The selected time range is invalid.', { code: 'invalid_range', status: 400, availability: 'unavailable' });
  const rows = [];
  for (const window of windows) {
    const windowSql = buildLogsQuery({ ...filters, start: new Date(window.start), end: new Date(window.end) });
    const result = await runWindow(project, windowSql, window);
    rows.push(...result.map(redactRow));
  }
  rows.sort((a, b) => {
    const left = new Date(a.timestamp).getTime() || 0;
    const right = new Date(b.timestamp).getTime() || 0;
    return filters.sort === 'asc' ? left - right : right - left;
  });
  const limit = Math.min(MAX_ROW_LIMIT, Math.max(1, Number(filters.limit) || 50));
  return { rows: rows.slice(0, limit), windows: windows.length, truncated: rows.length > limit };
}

export async function fetchServiceSummary(project, { start, end, maxWindows = 7 }) {
  const windows = splitWindows(new Date(start).getTime(), new Date(end).getTime()).slice(-maxWindows);
  const results = [];
  for (const window of windows) {
    results.push(...await runWindow(project, buildSummaryQuery(window.start, window.end), window));
  }
  return { summary: Object.fromEntries(mergeServiceRows(results).map((row) => [row.source, row])), windows: windows.length };
}

export async function fetchServiceDetail(project, { start, end, maxWindows = 7 }) {
  const windows = splitWindows(new Date(start).getTime(), new Date(end).getTime()).slice(-maxWindows);
  const summaryRows = [];
  const methods = new Map();
  const paths = new Map();
  const failures = [];
  const warnings = [];
  for (const window of windows) {
    const [summary, methodRows, pathRows, failureRows, warningRows] = await Promise.all([
      runWindow(project, buildSummaryQuery(window.start, window.end), window),
      runWindow(project, buildMethodQuery(window.start, window.end), window),
      runWindow(project, buildPathQuery(window.start, window.end), window),
      runWindow(project, buildRecentFailuresQuery(window.start, window.end), window),
      runWindow(project, buildRecentWarningsQuery(window.start, window.end), window),
    ]);
    summaryRows.push(...summary);
    for (const row of methodRows) {
      const key = `${row.source}:${row.method}`;
      const current = methods.get(key) || { source: row.source, method: row.method, events: 0 };
      current.events += Number(row.events) || 0;
      methods.set(key, current);
    }
    for (const row of pathRows) {
      const key = `${row.source}:${row.path}`;
      const current = paths.get(key) || { source: row.source, path: row.path, events: 0 };
      current.events += Number(row.events) || 0;
      paths.set(key, current);
    }
    failures.push(...failureRows.map(redactRow));
    warnings.push(...warningRows.map(redactRow));
  }
  const sortEvents = (left, right) => right.events - left.events;
  const sortNewest = (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
  return {
    summary: Object.fromEntries(mergeServiceRows(summaryRows).map((row) => [row.source, row])),
    methods: Array.from(methods.values()).sort(sortEvents).slice(0, 40),
    paths: Array.from(paths.values()).sort(sortEvents).slice(0, 30),
    failures: failures.sort(sortNewest).slice(0, 25),
    warnings: warnings.sort(sortNewest).slice(0, 40),
    windows: windows.length,
  };
}

export function isStatusSource(source) {
  return STATUS_SOURCES.has(source);
}
