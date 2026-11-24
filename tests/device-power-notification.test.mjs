import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isBoardOnline, isBoardRecentlyOnline } from '../src/lib/boardPresence.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

test('offline alert uses a delayed heartbeat check and one dedupe key per outage', async () => {
  const route = await read('src/app/api/cron/notifications/route.js');
  assert.match(route, /runDeviceOfflineChecks/);
  assert.match(route, /device_runtime_configs/);
  assert.match(route, /isDeviceOffline\(lastSeenAt, now, DEVICE_OFFLINE_AFTER_MS\)/);
  assert.match(route, /device-offline:\$\{config\.board_id\}:\$\{currentLastSeenAt\}/);
  assert.match(route, /notify_device_offline/);
});

test('energy alerts require a recent board check-in', () => {
  const now = Date.parse('2026-11-24T10:00:00Z');
  assert.equal(isBoardRecentlyOnline({ id: 'board-1', last_seen: '2026-11-24T09:59:00Z' }, now), true);
  assert.equal(isBoardRecentlyOnline({ id: 'board-1', last_seen: '2026-11-24T09:55:00Z' }, now), false);
  assert.equal(isBoardRecentlyOnline({ id: 'board-1', last_seen: null }, now), false);
  assert.equal(isBoardRecentlyOnline({ id: 'board-1', last_seen: '2026-11-24T09:59:00Z', deleted_at: '2026-11-24T09:59:30Z' }, now), false);
});

test('dashboard board presence helper remains available', () => {
  const now = Date.parse('2026-11-24T10:00:00Z');
  assert.equal(isBoardOnline('2026-11-24T09:59:00Z', now), true);
  assert.equal(isBoardOnline({ last_seen: '2026-11-24T09:55:00Z' }, now), false);
});

test('offline setting migration defaults alerts to enabled', async () => {
  const migration = await read('supabase/device_power_notifications.sql');
  assert.match(migration, /notify_device_offline boolean not null default true/);
});
