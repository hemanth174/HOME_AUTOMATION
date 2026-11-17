import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminServer';
import { getMqttControlClient, getMqttControlConfigError } from '@/lib/mqttControlServer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const mqtt = getMqttControlClient();
  if (!mqtt) return NextResponse.json({ error: getMqttControlConfigError() }, { status: 503 });
  const { data, error } = await mqtt.from('mqtt_server_schedules').select('id,owner_name,scheduled_at,status,created_by,created_at,completed_at').order('scheduled_at', { ascending: false }).limit(15);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ schedules: data || [] }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const mqtt = getMqttControlClient();
  if (!mqtt) return NextResponse.json({ error: getMqttControlConfigError() }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!['lrv', 'hemanth'].includes(body.owner) || !body.scheduledAt || !Number.isFinite(Date.parse(body.scheduledAt))) {
    return NextResponse.json({ error: 'Choose a laptop and a valid date and time.' }, { status: 400 });
  }
  const { data, error } = await mqtt.rpc('mqtt_schedule_start', { p_owner: body.owner, p_scheduled_at: new Date(body.scheduledAt).toISOString(), p_created_by: auth.user.email || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ schedule: data, message: 'One-time MQTT start scheduled.' }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const mqtt = getMqttControlClient();
  if (!mqtt) return NextResponse.json({ error: getMqttControlConfigError() }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'A schedule ID is required.' }, { status: 400 });
  const { data, error } = await mqtt.rpc('mqtt_cancel_schedule', { p_schedule_id: body.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (data?.ok !== true) return NextResponse.json({ error: 'This schedule has already started or finished.' }, { status: 409 });
  return NextResponse.json({ ok: true, message: 'Scheduled start cancelled.' });
}
