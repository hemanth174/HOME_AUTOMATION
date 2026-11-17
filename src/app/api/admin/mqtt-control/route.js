import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { getMqttControlClient, getMqttControlConfigError } from '@/lib/mqttControlServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const configurationError = getMqttControlConfigError();
  const mqtt = getMqttControlClient();
  if (!mqtt) return NextResponse.json({ error: configurationError, configured: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const [{ data: state, error: stateError }, { data: discovery, error: discoveryError }] = await Promise.all([
    mqtt.from('mqtt_server_control').select('is_mqtt_on,owner_name,owner_device,runtime_details,heartbeat_at,lease_until,desired_run,requested_owner,server_started_at,updated_at').eq('id', true).maybeSingle(),
    mqtt.from('app_discovery').select('backend_url,updated_at').eq('id', true).maybeSingle(),
  ]);
  if (stateError || discoveryError) {
    const error = stateError?.message || discoveryError?.message;
    return NextResponse.json({ error, configured: true }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ configured: true, state: state || null, backendUrl: discovery?.backend_url || null }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const mqtt = getMqttControlClient();
  if (!mqtt) return NextResponse.json({ error: getMqttControlConfigError() }, { status: 503 });
  let payload;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  let data;
  let error;
  if (payload.action === 'start' && ['lrv', 'hemanth'].includes(payload.owner)) {
    ({ data, error } = await mqtt.rpc('mqtt_request_start', { p_owner: payload.owner }));
  } else if (payload.action === 'stop') {
    ({ data, error } = await mqtt.rpc('mqtt_request_stop'));
  } else {
    return NextResponse.json({ error: 'Choose a valid laptop to start on, or stop the current server.' }, { status: 400 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (data?.ok === false) {
    const message = data.reason === 'already_running'
      ? `MQTT is already owned by ${data.owner_name}.`
      : data.reason === 'request_pending'
      ? `A start request for ${data.requested_owner} was accepted first.`
      : 'The MQTT request could not be accepted.';
    return NextResponse.json({ ...data, error: message }, { status: 409 });
  }
  return NextResponse.json({ ...data, message: data?.message || (payload.action === 'start' ? `Start requested on ${payload.owner}. The laptop controller will start Docker if that laptop is online.` : 'Stop requested. The current owner will stop Docker shortly.') }, { headers: { 'Cache-Control': 'no-store' } });
}
