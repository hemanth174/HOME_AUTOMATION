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

// Real calculations: Compute actual duration (in hours) a device has been running today
export const getDeviceRunHoursToday = (device, deviceLogs) => {
  let totalMs = 0;
  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Filter logs for this device
  const dLogs = deviceLogs.filter(l => l.device_id === device.id);

  if (dLogs.length === 0) {
    if (device.is_on) {
      // Device is currently ON and has been ON all day (or since last_changed)
      const lastChanged = device.last_changed ? new Date(device.last_changed) : startOfToday;
      const startTime = Math.max(lastChanged.getTime(), startOfToday.getTime());
      return Math.max(0, (now.getTime() - startTime) / (1000 * 60 * 60));
    }
    return 0;
  }

  // Process logs chronologically to reconstruct state intervals
  let isCurrentlyOn = false;
  let lastOnTime = null;

  // If the first log of today is a "turn OFF" action, it implies it was ON from midnight
  if (dLogs[0].action?.toLowerCase().includes('off')) {
    isCurrentlyOn = true;
    lastOnTime = startOfToday.getTime();
  }

  for (const log of dLogs) {
    const logTime = new Date(log.created_at).getTime();
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
          totalMs += Math.max(0, logTime - lastOnTime);
        }
        lastOnTime = null;
      }
    }
  }

  // If the device is still ON, add time from last switch until now
  if (isCurrentlyOn && lastOnTime !== null) {
    totalMs += Math.max(0, now.getTime() - lastOnTime);
  }

  return totalMs / (1000 * 60 * 60);
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
