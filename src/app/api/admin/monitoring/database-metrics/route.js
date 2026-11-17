import { cached, cacheKey } from '@/lib/monitoring/cache';
import { getDatabaseMetrics } from '@/lib/monitoring/metrics';
import { authorize, jsonError, jsonOk, projectFromRequest } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const project = projectFromRequest(request);
    const key = cacheKey(['database-metrics', project.id]);
    const data = await cached(key, 20000, () => getDatabaseMetrics(project));
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
