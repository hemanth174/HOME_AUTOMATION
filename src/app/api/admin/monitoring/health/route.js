import { errorPayload, fetchHealth } from '@/lib/monitoring/management';
import { normalizeProject, normalizeHealth } from '@/lib/monitoring/snapshot';
import { authorize, jsonOk, projectFromRequest } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  const project = projectFromRequest(request);
  try {
    const payload = await fetchHealth(project);
    return jsonOk({ health: { ...normalizeHealth(payload, 'UNKNOWN'), fetchedAt: new Date().toISOString(), error: null } });
  } catch (error) {
    const base = normalizeProject(null, project);
    return jsonOk({ health: { ...normalizeHealth(null, base.status), fetchedAt: new Date().toISOString(), availability: error?.availability || 'unavailable', error: errorPayload(error) } });
  }
}
