import { cached, cacheKey } from '@/lib/monitoring/cache';
import { fetchLogRows, validateSource } from '@/lib/monitoring/logs';
import { parseRange, rangeMeta } from '@/lib/monitoring/range';
import { authorize, jsonError, jsonOk, projectFromRequest } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const project = projectFromRequest(request);
    const params = new URL(request.url).searchParams;
    const range = parseRange(params);
    const filters = {
      source: validateSource(params.get('source')),
      severity: params.get('severity') || '',
      status: params.get('status') || '',
      search: params.get('search') || '',
      sort: params.get('sort') === 'asc' ? 'asc' : 'desc',
      limit: Math.min(200, Math.max(1, Number(params.get('limit')) || 50)),
      start: range.start,
      end: range.end,
    };
    const key = cacheKey(['logs', project.id, filters.source, filters.severity, filters.status, filters.search, filters.sort, filters.limit, range.key, range.key === 'custom' ? `${range.start}:${range.end}` : 'rolling']);
    const data = await cached(key, 60000, async () => {
      const result = await fetchLogRows(project, filters);
      return {
        logs: result.rows,
        source: 'management.logs',
        range: rangeMeta(range),
        filters: { ...filters, start: undefined, end: undefined },
        meta: {
          fetchedAt: new Date().toISOString(),
          availability: result.rows.length ? 'available' : 'no_data',
          error: null,
          windows: result.windows,
          truncated: result.truncated,
          limit: filters.limit,
        },
      };
    });
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
