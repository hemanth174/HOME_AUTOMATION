export const ADMIN_FEATURES = [
  { key: 'support', label: 'Support queue', detail: 'Read, reply, claim, and update customer tickets', tab: 'support' },
  { key: 'support_create', label: 'Create support issues', detail: 'Open a new issue from the admin support queue', requires: 'support' },
  { key: 'support_delete', label: 'Delete and restore tickets', detail: 'Move tickets to Deleted and restore them', requires: 'support' },
  { key: 'orders_view', label: 'Order summaries', detail: 'Read customer and order progress', tab: 'orders' },
  { key: 'orders_manage', label: 'Manage orders', detail: 'Change order stages and send updates', requires: 'orders_view' },
  { key: 'approvals', label: 'User approvals', detail: 'Approve, deny, and revoke accounts', tab: 'users' },
  { key: 'hardware', label: 'Hardware fleet', detail: 'View and control device provisioning and diagnostics', tab: 'hardware' },
  { key: 'mqtt', label: 'MQTT server', detail: 'View logs, start or stop, and schedule the MQTT server', tab: 'mqtt-server' },
  { key: 'monitoring', label: 'Monitoring', detail: 'View infrastructure health, usage, and logs', tab: 'monitoring' },
  { key: 'voice_plans', label: 'Voice plans', detail: 'View and change voice subscription settings', tab: 'subscriptions' },
];

export const ADMIN_FEATURE_KEYS = ADMIN_FEATURES.map((feature) => feature.key);
export const DEFAULT_SUB_ADMIN_PERMISSIONS = Object.freeze({ support: true, orders_view: true });

export function normalizeAdminPermissions(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value : DEFAULT_SUB_ADMIN_PERMISSIONS;
  return Object.fromEntries(ADMIN_FEATURE_KEYS.map((key) => [key, source[key] === true]));
}

export function hasAdminPermission(role, permissions, feature) {
  if (role === 'main_admin') return true;
  if (role !== 'sub_admin' || !ADMIN_FEATURE_KEYS.includes(feature)) return false;
  const current = normalizeAdminPermissions(permissions);
  const definition = ADMIN_FEATURES.find((item) => item.key === feature);
  return current[feature] && (!definition.requires || current[definition.requires]);
}
