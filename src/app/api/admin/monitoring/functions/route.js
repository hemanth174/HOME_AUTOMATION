import { cached, cacheKey } from '@/lib/monitoring/cache';
import { fetchFunctionStats, fetchFunctions } from '@/lib/monitoring/management';
import { parseRange } from '@/lib/monitoring/range';
import { authorize, jsonError, jsonOk, projectFromRequest } from '@/lib/monitoring/routeHelpers';

export const dynamic = 'force-dynamic';

const FUNCTION_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.response) return auth.response;
  try {
    const project = projectFromRequest(request);
    const params = new URL(request.url).searchParams;
    const functionId = params.get('functionId') || '';
    if (functionId && !FUNCTION_ID_PATTERN.test(functionId)) {
      return jsonError({ code: 'invalid_function_id', message: 'A valid Edge Function identifier is required.', status: 400 });
    }
    const range = parseRange(params);
    const key = cacheKey(['functions', project.id, functionId || 'list', range.functionInterval, range.key === 'custom' ? `${range.start}:${range.end}` : 'rolling']);
    const data = await cached(key, 120000, async () => {
      const functionsPayload = await fetchFunctions(project);
      const functions = (Array.isArray(functionsPayload) ? functionsPayload : []).map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name || item.slug,
        status: item.status,
        version: item.version,
        updatedAt: item.updated_at,
        verifyJwt: item.verify_jwt,
      }));
      let stats = null;
      let statsError = null;
      if (functionId) {
        try {
          const payload = await fetchFunctionStats(project, { functionId, interval: range.functionInterval });
          stats = Array.isArray(payload?.result) ? payload.result.slice(0, 500) : [];
        } catch (error) {
          statsError = { code: error?.code || 'stats_unavailable', message: error?.message || 'Function statistics are unavailable.' };
        }
      }
      return {
        functions,
        functionId: functionId || null,
        interval: range.functionInterval,
        stats,
        statsError,
        source: 'management.functions',
        fetchedAt: new Date().toISOString(),
      };
    });
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
