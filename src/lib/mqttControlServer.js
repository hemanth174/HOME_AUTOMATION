import { createClient } from '@supabase/supabase-js';

export function getMqttControlClient() {
  const url = (process.env.MQTT_SUPABASE_URL || process.env.ESP32_DISCOVERY_SUPABASE_URL || '').trim();
  const key = (process.env.MQTT_SUPABASE_SERVICE_ROLE_KEY || process.env.MQTT_SUPABASE_SECRET_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function getMqttControlConfigError() {
  if (!process.env.MQTT_SUPABASE_URL && !process.env.ESP32_DISCOVERY_SUPABASE_URL) return 'MQTT_SUPABASE_URL is not configured on the VikaTech server.';
  if (!process.env.MQTT_SUPABASE_SERVICE_ROLE_KEY && !process.env.MQTT_SUPABASE_SECRET_KEY) return 'MQTT_SUPABASE_SERVICE_ROLE_KEY is not configured on the VikaTech server.';
  return null;
}
