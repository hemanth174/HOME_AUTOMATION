import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

test('offline alert uses a delayed heartbeat check and one dedupe key per outage', async () => {
  const route = await read('src/app/api/cron/notifications/route.js');
  assert.match(route, /runDeviceOfflineChecks/);
  assert.match(route, /device_runtime_configs/);
  assert.match(route, /isDeviceOffline\(lastSeenAt, now, DEVICE_OFFLINE_AFTER_MS\)/);
  assert.match(route, /device-offline:\$\{config\.board_id\}:\$\{lastSeenAt\}/);
  assert.match(route, /notify_device_offline/);
});

test('offline setting migration defaults alerts to enabled', async () => {
  const migration = await read('supabase/device_power_notifications.sql');
  assert.match(migration, /notify_device_offline boolean not null default true/);
});
