import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { getMqttControlClient, getMqttControlConfigError } from '@/lib/mqttControlServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdmin(request, { permission: 'mqtt' });
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sharedSecret = process.env.MQTT_CONTROL_SHARED_SECRET;
  if (!sharedSecret) return NextResponse.json({ error: 'MQTT_CONTROL_SHARED_SECRET is not configured on the VikaTech server.' }, { status: 503 });
  const mqtt = getMqttControlClient();
  if (!mqtt) return NextResponse.json({ error: getMqttControlConfigError() }, { status: 503 });
  const { data: discovery, error } = await mqtt.from('app_discovery').select('backend_url').eq('id', true).maybeSingle();
  if (error || !discovery?.backend_url) return NextResponse.json({ error: error?.message || 'No active MQTT backend URL is published.' }, { status: 503 });
  const base = String(discovery.backend_url).replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/api/admin/control-logs`, {
      headers: { 'x-mqtt-control-secret': sharedSecret },
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: result.error || `MQTT backend returned HTTP ${response.status}.` }, { status: 502 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (fetchError) {
    return NextResponse.json({ error: fetchError.message || 'Could not reach the MQTT backend.' }, { status: 502 });
  }
}
