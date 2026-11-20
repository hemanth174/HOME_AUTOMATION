import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceRunHoursToday } from '../src/app/analytics/helpers.js';

const at = (hour, minute = 0) => new Date(2026, 10, 20, hour, minute);
const log = (hour, action) => ({ device_id: 'device-1', created_at: at(hour).toISOString(), action });

test('counts logged on/off intervals even when logs arrive newest first', () => {
  const device = { id: 'device-1', is_on: false, last_changed: at(11).toISOString() };
  assert.equal(getDeviceRunHoursToday(device, [log(11, 'turned OFF'), log(9, 'turned ON')], at(12)), 2);
});

test('does not invent usage when an on relay has no timestamp or logs', () => {
  assert.equal(getDeviceRunHoursToday({ id: 'device-1', is_on: true }, [], at(12)), 0);
});

test('uses last_changed for an active relay with no matching log', () => {
  const device = { id: 'device-1', is_on: true, last_changed: at(10).toISOString() };
  assert.equal(getDeviceRunHoursToday(device, [], at(12)), 2);
});

test('does not assume a first off event means the relay ran since midnight', () => {
  const device = { id: 'device-1', is_on: false, last_changed: at(10).toISOString() };
  assert.equal(getDeviceRunHoursToday(device, [log(10, 'turned OFF')], at(12)), 0);
});

test('does not continue an old on event when the relay is now off without a stop time', () => {
  assert.equal(getDeviceRunHoursToday({ id: 'device-1', is_on: false }, [log(9, 'turned ON')], at(12)), 0);
});
