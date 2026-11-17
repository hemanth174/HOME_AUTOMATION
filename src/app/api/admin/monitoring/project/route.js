import { errorPayload, fetchProjectInfo } from '@/lib/monitoring/management';
import { normalizeProject } from '@/lib/monitoring/snapshot';
import { authorize, jsonOk, projectFromRequest } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  const project = projectFromRequest(request);
  try {
    const payload = await fetchProjectInfo(project);
    return jsonOk({ project: { ...normalizeProject(payload, project), error: null } });
  } catch (error) {
    return jsonOk({ project: { ...normalizeProject(null, project), availability: error?.availability || 'unavailable', error: errorPayload(error) } });
  }
}
