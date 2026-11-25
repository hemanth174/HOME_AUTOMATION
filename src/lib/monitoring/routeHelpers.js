import { NextResponse } from 'next/server';
import { requireAdmin } from '../adminServer';
import { resolveProject } from './projects';
import { MonitoringError, errorPayload } from './management';

export async function authorize(request) {
  const auth = await requireAdmin(request, { permission: 'monitoring' });
  if (auth.error) return { response: NextResponse.json({ ok: false, error: { code: 'admin_required', message: auth.error, availability: 'permission_denied' } }, { status: auth.status }) };
  return { auth };
}

export function projectFromRequest(request) {
  const url = new URL(request.url);
  const project = resolveProject(url.searchParams.get('project') || 'vikatech');
  if (!project) throw new MonitoringError('Unknown monitoring project.', { code: 'unknown_project', status: 400, availability: 'unavailable' });
  return project;
}

export function jsonOk(payload) {
  return NextResponse.json({ ok: true, ...payload }, { headers: { 'Cache-Control': 'no-store' } });
}

export function jsonError(error) {
  const payload = errorPayload(error);
  return NextResponse.json({ ok: false, error: payload }, { status: payload.status && payload.status >= 400 ? payload.status : 502, headers: { 'Cache-Control': 'no-store' } });
}

export function settle(result) {
  if (result.status === 'fulfilled') return { value: result.value, error: null };
  return { value: null, error: errorPayload(result.reason) };
}
