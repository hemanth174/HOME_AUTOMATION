export const DASHBOARD_SHORTCUTS = [
  { id: 'home', label: 'Dashboard', path: '/', defaultKey: '1' },
  { id: 'boards', label: 'Rooms & devices', path: '/boards', defaultKey: '2' },
  { id: 'presets', label: 'Presets', path: '/presets', defaultKey: '3' },
  { id: 'schedules', label: 'Schedules', path: '/schedules', defaultKey: '4' },
  { id: 'analytics', label: 'Energy', path: '/analytics', defaultKey: '5' },
  { id: 'alarms', label: 'Alarms', path: '/alarms', defaultKey: '6' },
  { id: 'support', label: 'Support', path: '/support', defaultKey: '7' },
  { id: 'settings', label: 'Settings', path: '/settings', defaultKey: '8' },
];

const storageKey = (userId) => `vikatech:shortcuts:${userId}`;

export function defaultShortcuts() {
  return Object.fromEntries(DASHBOARD_SHORTCUTS.map(({ id, defaultKey }) => [id, defaultKey]));
}

export function readShortcuts(userId) {
  const defaults = defaultShortcuts();
  if (!userId || typeof window === 'undefined') return defaults;
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(userId)) || '{}');
    const result = { ...defaults };
    for (const action of DASHBOARD_SHORTCUTS) {
      const key = saved?.[action.id];
      if (/^[1-9]$/.test(key)) result[action.id] = key;
      else if (key === '') result[action.id] = '';
    }
    return result;
  } catch {
    return defaults;
  }
}

export function writeShortcuts(userId, shortcuts) {
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(shortcuts));
  window.dispatchEvent(new CustomEvent('vikatech-shortcuts-change', { detail: { userId } }));
}

export function shortcutLabel(key) {
  return key ? `Ctrl + Shift + ${key}` : 'Off';
}
