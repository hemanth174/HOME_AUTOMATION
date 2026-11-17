import { isValidProjectRef } from './projects';

const BASE = 'https://api.supabase.com/v1';

export class MonitoringError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MonitoringError';
    this.code = options.code || 'monitoring_error';
    this.status = options.status || 502;
    this.availability = options.availability || 'unavailable';
    this.retryable = Boolean(options.retryable);
    this.retryAfter = options.retryAfter || null;
  }
}

export function errorPayload(error) {
  return {
    code: error?.code || 'monitoring_error',
    message: error?.message || 'Supabase monitoring request failed',
    availability: error?.availability || 'unavailable',
    status: error?.status || 502,
    retryable: Boolean(error?.retryable),
  };
}

function extractMessage(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error?.message) return payload.error.message;
  if (typeof payload.message === 'string') return payload.message;
  return '';
}

function normalizeHttpError(status, payload, retryAfter) {
  const upstream = extractMessage(payload);
  if (status === 401) return new MonitoringError('The Supabase Management token is missing, invalid, or expired.', { code: 'management_token_invalid', status: 401, availability: 'permission_denied' });
  if (status === 402) return new MonitoringError('The Supabase plan or usage allowance blocks this analytics request.', { code: 'plan_restricted', status: 402, availability: 'plan_restricted' });
  if (status === 403) return new MonitoringError('The monitoring token does not have permission to read this data.', { code: 'permission_denied', status: 403, availability: 'permission_denied' });
  if (status === 404) return new MonitoringError('The requested Supabase monitoring resource was not found.', { code: 'not_found', status: 404, availability: 'unavailable' });
  if (status === 429) return new MonitoringError('Supabase rate limit reached. Showing the most recent cached data.', { code: 'rate_limited', status: 429, availability: 'rate_limited', retryable: true, retryAfter });
  if (status >= 500) return new MonitoringError(upstream || 'Supabase monitoring is temporarily unavailable.', { code: 'upstream_error', status, availability: 'unavailable', retryable: true });
  return new MonitoringError(upstream || `Supabase monitoring request failed (${status}).`, { code: 'request_failed', status, availability: 'unavailable' });
}

function retryDelay(attempt, retryAfter) {
  if (retryAfter) return Math.min(15000, retryAfter * 1000);
  return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(project, path, { params, timeoutMs = 15000, retries = 2, signal } = {}) {
  if (!project?.configured?.management) {
    throw new MonitoringError('Supabase monitoring is not configured for this project.', { code: 'unconfigured', status: 503, availability: 'unconfigured' });
  }
  if (!isValidProjectRef(project.ref)) {
    throw new MonitoringError('The configured Supabase project reference is invalid.', { code: 'invalid_project_ref', status: 503, availability: 'unconfigured' });
  }
  const url = new URL(`${BASE}/projects/${project.ref}${path || ''}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new MonitoringError('Monitoring request was cancelled.', { code: 'cancelled', status: 499, availability: 'unavailable' });
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${project.token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal,
      });
      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new MonitoringError('Supabase returned an invalid JSON response.', { code: 'invalid_response', status: 502, availability: 'unavailable' });
        }
      }
      if (!response.ok) {
        const retryAfterHeader = Number(response.headers.get('retry-after'));
        const error = normalizeHttpError(response.status, payload, Number.isFinite(retryAfterHeader) ? retryAfterHeader : null);
        if (!error.retryable || attempt === retries) throw error;
        lastError = error;
      } else if (payload?.error) {
        const message = extractMessage(payload) || 'Supabase analytics returned an application-level error.';
        const error = new MonitoringError(message, { code: 'analytics_error', status: 502, availability: 'unavailable' });
        if (attempt === retries) throw error;
        lastError = error;
      } else {
        return payload;
      }
    } catch (error) {
      if (error instanceof MonitoringError) {
        if (!error.retryable && error.code !== 'analytics_error') throw error;
        lastError = error;
      } else if (error?.name === 'AbortError') {
        lastError = new MonitoringError('Supabase monitoring request timed out.', { code: 'timeout', status: 504, availability: 'unavailable', retryable: true });
      } else {
        lastError = new MonitoringError('Could not reach the Supabase monitoring service.', { code: 'network_error', status: 502, availability: 'unavailable', retryable: true });
      }
      if (attempt === retries) throw lastError;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    if (lastError) await wait(retryDelay(attempt, lastError.retryAfter));
  }
  throw lastError || new MonitoringError('Supabase monitoring request failed.', { code: 'request_failed', status: 502, availability: 'unavailable' });
}

export function fetchProjectInfo(project, options) {
  return request(project, '', options);
}

const HEALTH_SERVICES = ['auth', 'db', 'db_postgres_user', 'pooler', 'realtime', 'rest', 'storage', 'pg_bouncer'];

export function fetchHealth(project, options = {}) {
  return request(project, '/health', {
    ...options,
    params: { services: HEALTH_SERVICES.join(','), ...(options.params || {}) },
  });
}

export function fetchUsageCounts(project, interval, options) {
  return request(project, '/analytics/endpoints/usage.api-counts', { ...options, params: { interval } });
}

export function fetchRequestCount(project, options) {
  return request(project, '/analytics/endpoints/usage.api-requests-count', options);
}

export function queryLogs(project, { sql, startIso, endIso }, options) {
  return request(project, '/analytics/endpoints/logs', {
    ...options,
    params: {
      sql,
      iso_timestamp_start: startIso,
      iso_timestamp_end: endIso,
    },
  });
}

export function fetchFunctions(project, options) {
  return request(project, '/functions', options);
}

export function fetchFunctionStats(project, { functionId, interval }, options) {
  return request(project, '/analytics/endpoints/functions.combined-stats', {
    ...options,
    params: { function_id: functionId, interval },
  });
}
