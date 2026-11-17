import { errorPayload, fetchHealth, fetchProjectInfo, fetchRequestCount, fetchUsageCounts } from './management';
import { fetchServiceSummary } from './logs';
import { normalizeHealth as resolveOverallHealth } from './calculations.mjs';
import { rangeMeta } from './range';

function isoFromProvider(timestamp) {
  if (!timestamp) return null;
  try {
    if (typeof timestamp === 'string' && /z$|[+-]\d\d:?\d\d$/i.test(timestamp)) return new Date(timestamp).toISOString();
    const normalized = String(timestamp).replace(' ', 'T');
    return new Date(`${normalized}Z`).toISOString();
  } catch {
    return null;
  }
}

export function normalizeUsage(payload, range) {
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  const mapped = rows
    .map((row) => ({
      timestamp: isoFromProvider(row.timestamp),
      auth: Number(row.total_auth_requests) || 0,
      realtime: Number(row.total_realtime_requests) || 0,
      rest: Number(row.total_rest_requests) || 0,
      storage: Number(row.total_storage_requests) || 0,
    }))
    .filter((row) => row.timestamp && new Date(row.timestamp).getTime() <= range.end)
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  const gaps = mapped.slice(1).map((row, index) => new Date(row.timestamp).getTime() - new Date(mapped[index].timestamp).getTime()).filter((gap) => gap > 0);
  const bucketMs = gaps.length ? gaps.sort((left, right) => left - right)[Math.floor(gaps.length / 2)] : 0;
  const series = mapped.filter((row) => new Date(row.timestamp).getTime() + bucketMs > range.start);
  const totals = series.reduce(
    (accumulator, row) => ({
      auth: accumulator.auth + row.auth,
      realtime: accumulator.realtime + row.realtime,
      rest: accumulator.rest + row.rest,
      storage: accumulator.storage + row.storage,
    }),
    { auth: 0, realtime: 0, rest: 0, storage: 0 }
  );
  const requestedMs = range.end - range.start;
  const limited = requestedMs > 7 * 24 * 60 * 60 * 1000 && series.length > 0;
  return {
    interval: range.usageInterval,
    series,
    totals: { ...totals, total: totals.auth + totals.realtime + totals.rest + totals.storage },
    source: 'management.usage.api-counts',
    availability: series.length ? 'available' : 'no_data',
    note: limited ? 'Supabase usage.api-counts returns at most the latest 7 days; totals cover that available window, not the full selected range.' : null,
    error: series.length ? null : { code: 'no_data', message: 'No usage buckets were returned for the selected range.' },
  };
}

export function normalizeRequestCount(payload) {
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  const value = rows.map((row) => Number(row.count)).find((count) => Number.isFinite(count));
  return {
    value: Number.isFinite(value) ? value : null,
    source: 'management.usage.api-requests-count',
    availability: Number.isFinite(value) ? 'available' : 'unavailable',
    note: 'Provider-defined reporting period reported by Supabase. This total is not merged with the time-range usage series.',
    error: Number.isFinite(value) ? null : { code: 'no_data', message: 'The provider returned no request count.' },
  };
}

export function normalizeProject(payload, project) {
  return {
    id: project.id,
    label: project.label,
    description: project.description,
    ref: payload?.ref || project.ref,
    url: project.url,
    region: payload?.region || null,
    status: payload?.status || 'UNKNOWN',
    databaseVersion: payload?.database?.version || null,
    postgresEngine: payload?.database?.postgres_engine || null,
    releaseChannel: payload?.database?.release_channel || null,
    createdAt: payload?.created_at || null,
    availability: payload ? 'available' : 'unavailable',
  };
}

export function normalizeHealth(payload, projectStatus) {
  const services = Array.isArray(payload) ? payload.map((item) => ({ name: item.name, status: item.status, error: item.error || null, info: item.info || null })) : [];
  return {
    overall: resolveOverallHealth(projectStatus, services),
    services,
    availability: services.length ? 'available' : 'unavailable',
    error: services.length ? null : { code: 'no_data', message: 'No service health records were returned.' },
  };
}

export async function buildOverview(project, range) {
  const logStart = Math.max(range.start, range.end - 24 * 60 * 60 * 1000);
  const results = await Promise.allSettled([
    fetchProjectInfo(project),
    fetchHealth(project),
    fetchUsageCounts(project, range.usageInterval),
    fetchRequestCount(project),
    fetchServiceSummary(project, { start: logStart, end: range.end, maxWindows: 1 }),
  ]);
  const [projectResult, healthResult, usageResult, requestResult, serviceResult] = results;
  const fetchedAt = new Date().toISOString();
  const projectInfo = projectResult.status === 'fulfilled' ? normalizeProject(projectResult.value, project) : normalizeProject(null, project);
  const health = healthResult.status === 'fulfilled' ? normalizeHealth(healthResult.value, projectInfo.status) : { overall: 'unknown', services: [], availability: 'unavailable', error: errorPayload(healthResult.reason) };
  const usage = usageResult.status === 'fulfilled'
    ? normalizeUsage(usageResult.value, range)
    : { interval: range.usageInterval, series: [], totals: { auth: 0, realtime: 0, rest: 0, storage: 0, total: 0 }, source: 'management.usage.api-counts', availability: 'unavailable', error: errorPayload(usageResult.reason) };
  const requestCount = requestResult.status === 'fulfilled'
    ? normalizeRequestCount(requestResult.value)
    : { value: null, source: 'management.usage.api-requests-count', availability: 'unavailable', note: null, error: errorPayload(requestResult.reason) };
  const services = serviceResult.status === 'fulfilled'
    ? { summary: serviceResult.value.summary, source: 'management.logs', availability: Object.keys(serviceResult.value.summary).length ? 'available' : 'no_data', error: null, window: { start: new Date(logStart).toISOString(), end: new Date(range.end).toISOString() }, windows: serviceResult.value.windows }
    : { summary: {}, source: 'management.logs', availability: 'unavailable', error: errorPayload(serviceResult.reason), window: { start: new Date(logStart).toISOString(), end: new Date(range.end).toISOString() }, windows: 0 };
  return {
    project: projectInfo,
    health,
    usage: { ...usage, fetchedAt },
    requestCount: { ...requestCount, fetchedAt },
    services: { ...services, fetchedAt, note: range.end - range.start > 24 * 60 * 60 * 1000 ? 'Service log counters use the most recent 24 hours because the Logs API window is limited to 24 hours per query.' : null },
    range: rangeMeta(range),
    meta: { fetchedAt },
  };
}
