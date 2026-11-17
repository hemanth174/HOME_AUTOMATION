const DEFINITIONS = [
  {
    id: 'vikatech',
    label: 'VikaTech Application',
    description: 'Orders, approvals, device fleet, auth and automation',
    refEnv: ['SUPABASE_MONITORING_VIKATECH_REF', 'SUPABASE_MONITORING_PROJECT_REF'],
    urlEnv: ['NEXT_PUBLIC_SUPABASE_URL'],
    tokenEnv: ['SUPABASE_MONITORING_VIKATECH_MANAGEMENT_TOKEN', 'SUPABASE_MANAGEMENT_TOKEN'],
    secretEnv: ['SUPABASE_MONITORING_VIKATECH_SECRET_KEY', 'SUPABASE_MONITORING_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    realtimeUrlEnv: ['NEXT_PUBLIC_SUPABASE_URL'],
    realtimeKeyEnv: ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    tables: ['order_trackings', 'account_approval_requests', 'boards', 'devices', 'device_commands', 'device_runtime_configs'],
  },
  {
    id: 'mqtt',
    label: 'MQTT Supabase',
    description: 'Cloudflare tunnel discovery and MQTT bridge metadata',
    refEnv: ['SUPABASE_MONITORING_MQTT_REF'],
    urlEnv: ['SUPABASE_MONITORING_MQTT_URL', 'ESP32_DISCOVERY_SUPABASE_URL'],
    tokenEnv: ['SUPABASE_MONITORING_MQTT_MANAGEMENT_TOKEN', 'SUPABASE_MANAGEMENT_TOKEN'],
    secretEnv: ['SUPABASE_MONITORING_MQTT_SECRET_KEY', 'SUPABASE_MONITORING_SECRET_KEY'],
    realtimeUrlEnv: ['NEXT_PUBLIC_MQTT_SUPABASE_URL'],
    realtimeKeyEnv: ['NEXT_PUBLIC_MQTT_SUPABASE_ANON_KEY'],
    tables: ['app_discovery'],
  },
];

function readEnv(keys) {
  for (const key of keys) {
    const value = (process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function refFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    const ref = host.split('.')[0];
    return /^[a-z0-9]{16,32}$/i.test(ref) ? ref.toLowerCase() : '';
  } catch {
    return '';
  }
}

function normalizeRef(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[a-z0-9]{16,32}$/i.test(raw)) return raw.toLowerCase();
  return refFromUrl(raw);
}

export function resolveProject(id) {
  const definition = DEFINITIONS.find((item) => item.id === id);
  if (!definition) return null;
  const url = readEnv(definition.urlEnv).replace(/\/$/, '');
  const ref = normalizeRef(readEnv(definition.refEnv)) || refFromUrl(url);
  const token = readEnv(definition.tokenEnv);
  const secret = readEnv(definition.secretEnv);
  const realtimeUrl = readEnv(definition.realtimeUrlEnv).replace(/\/$/, '');
  const realtimeKey = readEnv(definition.realtimeKeyEnv);
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    ref: ref || null,
    url: url || (ref ? `https://${ref}.supabase.co` : null),
    token: token || null,
    secret: secret || null,
    realtimeUrl: realtimeUrl || null,
    realtimeKey: realtimeKey || null,
    tables: definition.tables,
    configured: {
      management: Boolean(ref && token),
      metrics: Boolean(ref && secret),
      realtime: Boolean(realtimeUrl && realtimeKey),
    },
    envKeys: {
      ref: definition.refEnv[0],
      token: definition.tokenEnv[0],
      secret: definition.secretEnv[0],
      realtimeUrl: definition.realtimeUrlEnv[0],
      realtimeKey: definition.realtimeKeyEnv[0],
    },
  };
}

export function publicProject(project) {
  return {
    id: project.id,
    label: project.label,
    description: project.description,
    ref: project.ref,
    url: project.url,
    tables: project.tables,
    configured: project.configured,
    envKeys: project.envKeys,
    realtime: project.configured.realtime ? { url: project.realtimeUrl, key: project.realtimeKey } : null,
  };
}

export function listProjects() {
  return DEFINITIONS.map((definition) => publicProject(resolveProject(definition.id))).filter(Boolean);
}

export function isValidProjectRef(ref) {
  return /^[a-z0-9]{16,32}$/i.test(String(ref || ''));
}
