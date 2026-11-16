import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/adminServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function validGatewayToken(request) {
  const expected = process.env.ESP32_DEVICE_WS_TOKEN || process.env.DEVICE_WS_TOKEN;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request) {
  if (!validGatewayToken(request)) {
    return NextResponse.json({ error: 'Gateway authorization failed' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const boardIdentifier = typeof body.boardIdentifier === 'string'
    ? body.boardIdentifier.trim()
    : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(boardIdentifier)) {
    return NextResponse.json({ error: 'A valid board identifier is required' }, { status: 400 });
  }

  const admin = getAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Board presence service is not configured' }, { status: 503 });

  const { data: matches, error: lookupError } = await admin
    .from('boards')
    .select('id')
    .eq('board_identifier', boardIdentifier)
    .limit(2);
  if (lookupError) return NextResponse.json({ error: 'Could not look up board presence' }, { status: 500 });
  if (!matches?.length) return NextResponse.json({ error: 'Board is not registered' }, { status: 404 });
  if (matches.length !== 1) return NextResponse.json({ error: 'Board identifier is ambiguous' }, { status: 409 });

  const { error: updateError } = await admin
    .from('boards')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', matches[0].id);
  if (updateError) return NextResponse.json({ error: 'Could not update board presence' }, { status: 500 });

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, private' } });
}
