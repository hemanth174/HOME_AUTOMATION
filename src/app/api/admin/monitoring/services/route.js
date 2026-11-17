import { cached, cacheKey } from '@/lib/monitoring/cache';
import { fetchServiceDetail } from '@/lib/monitoring/logs';
import { parseRange, rangeMeta } from '@/lib/monitoring/range';
import { authorize, jsonError, jsonOk, projectFromRequest } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const project = projectFromRequest(request);
    const range = parseRange(new URL(request.url).searchParams);
    const key = cacheKey(['services', project.id, range.key, range.key === 'custom' ? `${range.start}:${range.end}` : 'rolling']);
    const data = await cached(key, 120000, async () => {
      const detail = await fetchServiceDetail(project, { start: range.start, end: range.end, maxWindows: 7 });
      return {
        ...detail,
        source: 'management.logs',
        range: rangeMeta(range),
        fetchedAt: new Date().toISOString(),
        note: range.end - range.start > 7 * 24 * 60 * 60 * 1000 ? 'Service log aggregates are limited to the most recent 7 days to keep the Logs API load bounded.' : null,
      };
    });
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
