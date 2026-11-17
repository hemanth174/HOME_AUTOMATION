import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY_MS,
  buildAlerts,
  classifyStatus,
  counterDelta,
  counterRate,
  cpuUsagePercent,
  mergeServiceRows,
  normalizeHealth,
  ratioPercent,
  splitWindows,
  successRate,
} from '../src/lib/monitoring/calculations.mjs';

test('classifyStatus separates success, client, server and unknown', () => {
  assert.equal(classifyStatus(200), 'success');
  assert.equal(classifyStatus(301), 'success');
  assert.equal(classifyStatus(404), 'client');
  assert.equal(classifyStatus(503), 'server');
  assert.equal(classifyStatus(0), 'unknown');
  assert.equal(classifyStatus('nope'), 'unknown');
});

test('successRate ignores unknown statuses and returns null without data', () => {
  assert.equal(successRate({}), null);
  assert.equal(successRate({ success: 0, client: 0, server: 0 }), null);
  assert.equal(successRate({ success: 95, client: 3, server: 2 }), 95);
  assert.ok(Math.abs(successRate({ success: 1, client: 1, server: 1, unknown: 99 }) - 100 / 3) < 1e-9);
});

test('ratioPercent clamps to 0-100 and rejects invalid totals', () => {
  assert.equal(ratioPercent(50, 100), 50);
  assert.equal(ratioPercent(150, 100), 100);
  assert.equal(ratioPercent(-5, 100), 0);
  assert.equal(ratioPercent(1, 0), null);
  assert.equal(ratioPercent('x', 10), null);
});

test('counter helpers reject resets and non-positive elapsed time', () => {
  assert.equal(counterDelta(10, 30), 20);
  assert.equal(counterDelta(30, 10), null);
  assert.equal(counterDelta(-1, 10), null);
  assert.equal(counterRate(10, 40, 30), 1);
  assert.equal(counterRate(10, 40, 0), null);
  assert.equal(counterRate(40, 10, 30), null);
});

test('cpuUsagePercent derives busy time from total and idle counters', () => {
  const previous = { total: 1000, idle: 600 };
  const current = { total: 1200, idle: 700 };
  assert.equal(cpuUsagePercent(previous, current), 50);
  assert.equal(cpuUsagePercent(previous, { total: 900, idle: 700 }), null);
  assert.equal(cpuUsagePercent(null, current), null);
  assert.equal(cpuUsagePercent({ total: 100, idle: 100 }, { total: 100, idle: 100 }), null);
});

test('splitWindows bounds each query to 24 hours', () => {
  const start = Date.UTC(2026, 0, 1);
  const end = start + DAY_MS * 2 + 1000;
  const windows = splitWindows(start, end);
  assert.equal(windows.length, 3);
  assert.equal(windows[0].start, start);
  assert.equal(windows[0].end, start + DAY_MS);
  assert.equal(windows[1].end, start + DAY_MS * 2);
  assert.equal(windows[2].end, end);
  assert.deepEqual(splitWindows(end, start), []);
});

test('mergeServiceRows aggregates overlapping windows and weights duration', () => {
  const merged = mergeServiceRows([
    { source: 'edge_logs', events: 10, success: 8, client_errors: 1, server_errors: 1, error_events: 1, avg_execution_ms: 100 },
    { source: 'edge_logs', events: 30, success: 30, client_errors: 0, server_errors: 0, avg_execution_ms: 200 },
    { source: 'postgres_logs', events: 2, error_events: 2 },
  ]);
  const edge = merged.find((row) => row.source === 'edge_logs');
  assert.equal(edge.events, 40);
  assert.equal(edge.success, 38);
  assert.equal(edge.client_errors, 1);
  assert.equal(edge.server_errors, 1);
  assert.equal(edge.error_events, 1);
  assert.equal(edge.avg_execution_ms, 175);
  assert.equal(merged.find((row) => row.source === 'postgres_logs').avg_execution_ms, null);
});

test('normalizeHealth prioritizes unhealthy services and handles missing data', () => {
  assert.equal(normalizeHealth('ACTIVE_HEALTHY', []), 'healthy');
  assert.equal(normalizeHealth('ACTIVE_UNHEALTHY', []), 'critical');
  assert.equal(normalizeHealth('UNKNOWN', []), 'unknown');
  assert.equal(normalizeHealth('ACTIVE_HEALTHY', [{ status: 'ACTIVE_HEALTHY' }, { status: 'ACTIVE_HEALTHY' }]), 'healthy');
  assert.equal(normalizeHealth('ACTIVE_HEALTHY', [{ status: 'ACTIVE_HEALTHY' }, { status: 'UNHEALTHY' }]), 'critical');
  assert.equal(normalizeHealth('ACTIVE_HEALTHY', [{ status: 'ACTIVE_HEALTHY' }, { status: 'COMING_UP' }]), 'warning');
});

test('buildAlerts returns no alerts for healthy inputs', () => {
  assert.deepEqual(buildAlerts({}), []);
  assert.deepEqual(buildAlerts({
    overview: { services: { summary: { edge_logs: { success: 100, client_errors: 0, server_errors: 0 } } } },
    metrics: { metrics: { cpu: { value: 10 }, memory: { value: 20 }, disk: { value: 30 }, connections: { value: 10 } } },
  }), []);
});

test('buildAlerts flags failure rate, database errors and resource pressure', () => {
  const alerts = buildAlerts({
    overview: {
      services: {
        summary: {
          edge_logs: { success: 90, client_errors: 5, server_errors: 5 },
          postgres_logs: { error_events: 12 },
          function_edge_logs: { success: 90, client_errors: 10, server_errors: 0 },
        },
      },
    },
    metrics: { metrics: { cpu: { value: 86 }, memory: { value: 76 }, disk: { value: 50 }, connections: { value: 91 } } },
  });
  const keys = alerts.map((alert) => `${alert.severity}:${alert.service}:${alert.title}`);
  assert.ok(keys.includes('critical:API Gateway:Elevated API Gateway failures'));
  assert.ok(keys.includes('critical:PostgreSQL:Database error events observed'));
  assert.ok(keys.includes('warning:Edge Functions:Edge Function HTTP failures'));
  assert.ok(keys.includes('critical:Database host:CPU utilization above critical threshold'));
  assert.ok(keys.includes('warning:Database host:Memory utilization above warning threshold'));
  assert.ok(keys.includes('critical:PostgreSQL:Connection utilization above critical threshold'));
});
