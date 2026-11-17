import { cached, cacheKey } from '@/lib/monitoring/cache';
import { fetchRequestCount, fetchUsageCounts, errorPayload } from '@/lib/monitoring/management';
import { parseRange, rangeMeta } from '@/lib/monitoring/range';
import { normalizeRequestCount, normalizeUsage } from '@/lib/monitoring/snapshot';
import { authorize, jsonError, jsonOk, projectFromRequest } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const project = projectFromRequest(request);
    const range = parseRange(new URL(request.url).searchParams);
    const key = cacheKey(['usage', project.id, range.key, range.key === 'custom' ? `${range.start}:${range.end}` : 'rolling']);
    const data = await cached(key, 30000, async () => {
      const [usageResult, requestResult] = await Promise.allSettled([
        fetchUsageCounts(project, range.usageInterval),
        fetchRequestCount(project),
      ]);
      const fetchedAt = new Date().toISOString();
      const usage = usageResult.status === 'fulfilled'
        ? normalizeUsage(usageResult.value, range)
        : { interval: range.usageInterval, series: [], totals: { auth: 0, realtime: 0, rest: 0, storage: 0, total: 0 }, source: 'management.usage.api-counts', availability: 'unavailable', error: errorPayload(usageResult.reason) };
      const requestCount = requestResult.status === 'fulfilled'
        ? normalizeRequestCount(requestResult.value)
        : { value: null, source: 'management.usage.api-requests-count', availability: 'unavailable', note: null, error: errorPayload(requestResult.reason) };
      return {
        usage: { ...usage, fetchedAt },
        requestCount: { ...requestCount, fetchedAt },
        range: rangeMeta(range),
        meta: { fetchedAt },
      };
    });
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
