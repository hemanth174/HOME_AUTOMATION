import { cpuUsagePercent, counterRate, ratioPercent } from './calculations.mjs';
import { parsePrometheus, sumValues, maxValue } from './prometheus';
import { MonitoringError } from './management';

const history = new Map();
const HISTORY_TTL_MS = 15 * 60 * 1000;

function metric(id, label, value, unit, options = {}) {
  return {
    id,
    label,
    value: Number.isFinite(value) ? value : null,
    unit,
    availability: options.availability || (Number.isFinite(value) ? 'available' : 'unavailable'),
    note: options.note || null,
    source: 'metrics.prometheus',
    ...options.extra,
  };
}

function unavailableMetric(id, label, unit, note) {
  return metric(id, label, null, unit, { availability: 'unavailable', note });
}

async function fetchMetricsText(project) {
  if (!project?.configured?.metrics) {
    throw new MonitoringError('Database metrics are not configured for this project.', { code: 'unconfigured', status: 503, availability: 'unconfigured' });
  }
  const url = `${project.url}/customer/v1/privileged/metrics`;
  const auth = Buffer.from(`service_role:${project.secret}`).toString('base64');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'text/plain' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401) throw new MonitoringError('The metrics secret key is invalid.', { code: 'metrics_key_invalid', status: 401, availability: 'permission_denied' });
        if (response.status === 403) throw new MonitoringError('The metrics key does not have permission to read metrics.', { code: 'permission_denied', status: 403, availability: 'permission_denied' });
        if (response.status === 429) throw new MonitoringError('Metrics API rate limit reached.', { code: 'rate_limited', status: 429, availability: 'rate_limited', retryable: true });
        if (response.status === 400) throw new MonitoringError('Metrics are not available for this project while it is not active and healthy.', { code: 'metrics_unavailable', status: 400, availability: 'unavailable' });
        throw new MonitoringError('Database metrics are temporarily unavailable.', { code: 'metrics_upstream_error', status: 502, availability: 'unavailable', retryable: response.status >= 500 });
      }
      return await response.text();
    } catch (error) {
      if (error instanceof MonitoringError && !error.retryable) throw error;
      if (attempt === 1) {
        if (error instanceof MonitoringError) throw error;
        throw new MonitoringError('Could not reach the Supabase metrics endpoint.', { code: 'network_error', status: 502, availability: 'unavailable', retryable: true });
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new MonitoringError('Database metrics are temporarily unavailable.', { code: 'metrics_upstream_error', status: 502, availability: 'unavailable' });
}

function buildSnapshot(series) {
  return {
    cpuTotal: sumValues(series, 'node_cpu_seconds_total'),
    cpuIdle: sumValues(series, 'node_cpu_seconds_total', { mode: 'idle' }),
    diskReads: sumValues(series, 'node_disk_reads_completed_total'),
    diskWrites: sumValues(series, 'node_disk_writes_completed_total'),
    xactCommit: sumValues(series, 'pg_stat_database_xact_commit_total'),
    xactRollback: sumValues(series, 'pg_stat_database_xact_rollback_total'),
  };
}

export async function getDatabaseMetrics(project) {
  const fetchedAt = new Date().toISOString();
  try {
    const text = await fetchMetricsText(project);
    const series = parsePrometheus(text);
    if (!series.length) {
      return {
        metrics: {},
        meta: { fetchedAt, source: 'metrics.prometheus', availability: 'unavailable', error: { code: 'empty_response', message: 'The metrics endpoint returned no series.' }, seriesCount: 0 },
      };
    }
    const now = Date.now();
    const snapshot = buildSnapshot(series);
    const previous = history.get(project.id);
    const previousValid = previous && now - previous.at < HISTORY_TTL_MS;
    const elapsedSeconds = previousValid ? (now - previous.at) / 1000 : null;

    const memoryTotal = sumValues(series, 'node_memory_MemTotal_bytes');
    const memoryAvailable = sumValues(series, 'node_memory_MemAvailable_bytes');
    const memoryUsed = memoryTotal !== null && memoryAvailable !== null ? memoryTotal - memoryAvailable : null;

    let diskTotal = sumValues(series, 'node_filesystem_size_bytes', { mountpoint: '/' });
    let diskAvailable = sumValues(series, 'node_filesystem_avail_bytes', { mountpoint: '/' });
    if (diskTotal === null || diskAvailable === null) {
      diskTotal = sumValues(series, 'node_filesystem_size_bytes');
      diskAvailable = sumValues(series, 'node_filesystem_avail_bytes');
    }
    const diskUsed = diskTotal !== null && diskAvailable !== null ? diskTotal - diskAvailable : null;

    const connections = sumValues(series, 'pg_stat_database_num_backends');
    const connectionLimit = maxValue(series, 'max_connections_connection_count');
    const walMb = sumValues(series, 'pg_wal_size_mb');
    const databaseBytes = sumValues(series, 'pg_database_size_bytes');
    const blocksHit = sumValues(series, 'pg_stat_database_blks_hit_total');
    const blocksRead = sumValues(series, 'pg_stat_database_blks_read_total');
    const cacheHit = blocksHit !== null && blocksRead !== null ? ratioPercent(blocksHit, blocksHit + blocksRead) : null;

    const cpu = previousValid
      ? cpuUsagePercent({ total: previous.snapshot.cpuTotal, idle: previous.snapshot.cpuIdle }, { total: snapshot.cpuTotal, idle: snapshot.cpuIdle })
      : null;
    const readRate = previousValid ? counterRate(previous.snapshot.diskReads, snapshot.diskReads, elapsedSeconds) : null;
    const writeRate = previousValid ? counterRate(previous.snapshot.diskWrites, snapshot.diskWrites, elapsedSeconds) : null;
    const commitRate = previousValid ? counterRate(previous.snapshot.xactCommit, snapshot.xactCommit, elapsedSeconds) : null;
    const rollbackRate = previousValid ? counterRate(previous.snapshot.xactRollback, snapshot.xactRollback, elapsedSeconds) : null;

    history.set(project.id, { at: now, snapshot });

    const metrics = {
      cpu: cpu !== null
        ? metric('cpu', 'CPU utilization', cpu, '%', { note: `Derived from node_cpu_seconds_total over ${Math.round(elapsedSeconds)}s` })
        : metric('cpu', 'CPU utilization', null, '%', { availability: 'warming_up', note: 'A second real metrics sample is required before CPU usage can be calculated. The next refresh will use a valid rate.' }),
      memory: memoryUsed !== null && memoryTotal !== null
        ? metric('memory', 'Memory utilization', ratioPercent(memoryUsed, memoryTotal), '%', { extra: { usedBytes: memoryUsed, totalBytes: memoryTotal } })
        : unavailableMetric('memory', 'Memory utilization', '%', 'Metric unavailable from the current Supabase source.'),
      disk: diskUsed !== null && diskTotal !== null
        ? metric('disk', 'Disk utilization', ratioPercent(diskUsed, diskTotal), '%', { extra: { usedBytes: diskUsed, totalBytes: diskTotal } })
        : unavailableMetric('disk', 'Disk utilization', '%', 'Metric unavailable from the current Supabase source.'),
      connections: connections !== null
        ? metric('connections', 'Connection utilization', ratioPercent(connections, connectionLimit), '%', { extra: { active: connections, limit: connectionLimit } })
        : unavailableMetric('connections', 'Connection utilization', '%', 'Metric unavailable from the current Supabase source.'),
      wal: walMb !== null ? metric('wal', 'WAL size', walMb, 'MB') : unavailableMetric('wal', 'WAL size', 'MB', 'Metric unavailable from the current Supabase source.'),
      database: databaseBytes !== null ? metric('database', 'Database size', databaseBytes / (1024 * 1024), 'MB') : unavailableMetric('database', 'Database size', 'MB', 'Metric unavailable from the current Supabase source.'),
      diskReads: readRate !== null ? metric('diskReads', 'Disk reads', readRate, 'ops/s') : metric('diskReads', 'Disk reads', null, 'ops/s', { availability: 'warming_up', note: 'Counter rate requires a previous sample.' }),
      diskWrites: writeRate !== null ? metric('diskWrites', 'Disk writes', writeRate, 'ops/s') : metric('diskWrites', 'Disk writes', null, 'ops/s', { availability: 'warming_up', note: 'Counter rate requires a previous sample.' }),
      commits: commitRate !== null ? metric('commits', 'Transactions committed', commitRate, '/s') : metric('commits', 'Transactions committed', null, '/s', { availability: 'warming_up', note: 'Counter rate requires a previous sample.' }),
      rollbacks: rollbackRate !== null ? metric('rollbacks', 'Transactions rolled back', rollbackRate, '/s') : metric('rollbacks', 'Transactions rolled back', null, '/s', { availability: 'warming_up', note: 'Counter rate requires a previous sample.' }),
      cacheHit: cacheHit !== null ? metric('cacheHit', 'Buffer cache hit ratio', cacheHit, '%') : unavailableMetric('cacheHit', 'Buffer cache hit ratio', '%', 'Metric unavailable from the current Supabase source.'),
      postgresUp: sumValues(series, 'pg_up'),
    };

    return {
      metrics,
      meta: {
        fetchedAt,
        source: 'metrics.prometheus',
        availability: 'available',
        seriesCount: series.length,
        sampleWindowSeconds: previousValid ? Math.round(elapsedSeconds) : null,
        error: null,
      },
    };
  } catch (error) {
    return {
      metrics: {},
      meta: {
        fetchedAt,
        source: 'metrics.prometheus',
        availability: error?.availability || 'unavailable',
        error: { code: error?.code || 'metrics_error', message: error?.message || 'Database metrics are temporarily unavailable.' },
        seriesCount: 0,
        sampleWindowSeconds: null,
      },
    };
  }
}
