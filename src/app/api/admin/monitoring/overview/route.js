import { cached, cacheKey } from '@/lib/monitoring/cache';
import { parseRange } from '@/lib/monitoring/range';
import { buildOverview } from '@/lib/monitoring/snapshot';
import { authorize, jsonError, jsonOk, projectFromRequest } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const project = projectFromRequest(request);
    const range = parseRange(new URL(request.url).searchParams);
    const key = cacheKey(['overview', project.id, range.key, range.key === 'custom' ? `${range.start}:${range.end}` : 'rolling']);
    const data = await cached(key, 30000, () => buildOverview(project, range));
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
