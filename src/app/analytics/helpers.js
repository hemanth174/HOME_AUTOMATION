// Helper to estimate device wattage based on name
export const getDeviceWattage = (name) => {
  const n = name.toLowerCase();
  if (n.includes('ac') || n.includes('air conditioner')) return 1800;
  if (n.includes('heater') || n.includes('geyser') || n.includes('boiler')) return 1500;
  if (n.includes('pump') || n.includes('motor')) return 750;
  if (n.includes('microwave') || n.includes('oven')) return 1200;
  if (n.includes('fridge') || n.includes('refrigerator')) return 200;
  if (n.includes('tv') || n.includes('television') || n.includes('computer') || n.includes('pc')) return 150;
  if (n.includes('fan')) return 75;
  if (n.includes('light') || n.includes('lamp') || n.includes('bulb')) return 12;
  return 60; // default wattage
};

// Reconstruct only intervals supported by a state change or a known
// last_changed timestamp. Missing logs must never imply a whole day of use.
export const getDeviceRunHoursToday = (device, deviceLogs, currentTime = new Date()) => {
  const now = new Date(currentTime).getTime();
  if (!Number.isFinite(now)) return 0;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayStart = startOfToday.getTime();
  const lastChanged = device.last_changed ? new Date(device.last_changed).getTime() : NaN;
  const logs = (deviceLogs || [])
    .filter((log) => String(log.device_id) === String(device.id))
    .map((log) => ({ time: new Date(log.created_at).getTime(), action: String(log.action || '').toLowerCase() }))
    .filter((log) => Number.isFinite(log.time) && log.time <= now)
    .sort((a, b) => a.time - b.time);
  const stateOf = (action) => {
    if (/\b(off|deactivate|disabled)\b/.test(action)) return false;
    if (/\b(on|activate|enabled)\b/.test(action)) return true;
    return null;
  };

  const prior = [...logs].reverse().find((log) => log.time < dayStart && stateOf(log.action) !== null);
  let onSince = prior && stateOf(prior.action) === true ? dayStart : null;
  let totalMs = 0;
  for (const log of logs) {
    if (log.time < dayStart) continue;
    const state = stateOf(log.action);
    if (state === true && onSince === null) onSince = log.time;
    if (state === false && onSince !== null) {
      totalMs += Math.max(0, log.time - onSince);
      onSince = null;
    }
  }

  if (onSince !== null) {
    const end = device.is_on
      ? now
      : Number.isFinite(lastChanged)
        ? Math.min(now, Math.max(onSince, lastChanged))
        : onSince;
    totalMs += Math.max(0, end - onSince);
  } else if (device.is_on && Number.isFinite(lastChanged) && lastChanged <= now) {
    const lastOff = [...logs].reverse().find((log) => log.time >= dayStart && stateOf(log.action) === false);
    if (!lastOff || lastChanged > lastOff.time) {
      totalMs += Math.max(0, now - Math.max(dayStart, lastChanged));
    }
  }

  return Math.min(now - dayStart, totalMs) / 3_600_000;
};

// Helper to calculate exact milliseconds of device activity inside a specific window
export const getDeviceRunMsInWindow = (device, deviceLogs, windowStart, windowEnd) => {
  const dLogs = deviceLogs.filter(l => l.device_id === device.id);
  const now = new Date().getTime();

  if (dLogs.length === 0) {
    if (device.is_on) {
      const lastChanged = device.last_changed ? new Date(device.last_changed).getTime() : windowStart;
      const activeStart = Math.max(lastChanged, windowStart);
      const activeEnd = Math.min(now, windowEnd);
      return Math.max(0, activeEnd - activeStart);
    }
    return 0;
  }

  let isCurrentlyOn = false;
  let lastOnTime = null;

  // Check state prior to windowStart
  const priorLogs = dLogs.filter(l => new Date(l.created_at).getTime() < windowStart);
  if (priorLogs.length > 0) {
    const lastPriorLog = priorLogs[priorLogs.length - 1];
    if (lastPriorLog.action?.toLowerCase().includes('on') || lastPriorLog.action?.toLowerCase().includes('activate')) {
      isCurrentlyOn = true;
      lastOnTime = windowStart;
    }
  } else if (dLogs[0].action?.toLowerCase().includes('off')) {
    isCurrentlyOn = true;
    lastOnTime = windowStart;
  }

  let activeMs = 0;

  for (const log of dLogs) {
    const logTime = new Date(log.created_at).getTime();
    if (logTime < windowStart) continue;
    if (logTime > windowEnd) break;

    const isOnAction = log.action?.toLowerCase().includes('on') || log.action?.toLowerCase().includes('activate');

    if (isOnAction) {
      if (!isCurrentlyOn) {
        isCurrentlyOn = true;
        lastOnTime = logTime;
      }
    } else {
      if (isCurrentlyOn) {
        isCurrentlyOn = false;
        if (lastOnTime !== null) {
          activeMs += Math.max(0, logTime - lastOnTime);
        }
        lastOnTime = null;
      }
    }
  }

  if (isCurrentlyOn && lastOnTime !== null) {
    const activeEnd = Math.min(now, windowEnd);
    activeMs += Math.max(0, activeEnd - lastOnTime);
  }

  return activeMs;
};
