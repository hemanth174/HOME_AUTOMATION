"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { adminFetch, queryString } from './client';

const OVERVIEW_POLL_MS = 60000;
const RETRY_MAX_MS = 60000;

function retryDelay(attempt) {
  return Math.min(RETRY_MAX_MS, 2000 * 2 ** Math.min(attempt, 5));
}

function getRealtimeClient(project) {
  if (!project?.realtime?.url || !project?.realtime?.key) return null;
  if (project.id === 'vikatech') return supabase;
  try {
    return createClient(project.realtime.url, project.realtime.key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch {
    return null;
  }
}

export function useProjectFeed({ project, range, token, active, detailed, autoRefresh, customStart, customEnd }) {
  const [overview, setOverview] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [services, setServices] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveStatus, setLiveStatus] = useState('IDLE');
  const mountedRef = useRef(true);
  const controllerRef = useRef(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef(null);
  const loadRef = useRef(null);
  const overviewRef = useRef(null);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (manual = false) => {
    if (!active || !token || !project?.id) return;
    if (manual) setRefreshing(true);
    else if (!overviewRef.current) setLoading(true);
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const base = { project: project.id, range, start: customStart, end: customEnd };
    const requests = {
      overview: adminFetch(`/api/admin/monitoring/overview?${queryString(base)}`, { token, signal: controller.signal }),
    };
    if (detailed) {
      requests.metrics = adminFetch(`/api/admin/monitoring/database-metrics?${queryString({ project: project.id })}`, { token, signal: controller.signal });
      requests.services = adminFetch(`/api/admin/monitoring/services?${queryString(base)}`, { token, signal: controller.signal });
    }
    const entries = Object.entries(requests);
    const results = await Promise.allSettled(entries.map(([, promise]) => promise));
    if (!mountedRef.current || controller.signal.aborted || controllerRef.current !== controller) return;
    let failures = 0;
    const nextErrors = {};
    results.forEach((result, index) => {
      const key = entries[index][0];
      if (result.status === 'fulfilled') {
        if (key === 'overview') {
          overviewRef.current = result.value;
          setOverview(result.value);
          setLastUpdated(result.value?.meta?.fetchedAt || new Date().toISOString());
        }
        if (key === 'metrics') setMetrics(result.value);
        if (key === 'services') setServices(result.value);
      } else {
        failures += 1;
        nextErrors[key] = {
          code: result.reason?.code || 'request_failed',
          message: result.reason?.message || 'Monitoring request failed.',
          availability: result.reason?.availability || 'unavailable',
          httpStatus: result.reason?.httpStatus || 0,
        };
      }
    });
    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);

    if (failures > 0 && active && autoRefreshRef.current) {
      retryRef.current += 1;
      const delay = retryDelay(retryRef.current);
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) loadRef.current?.(false);
      }, delay);
    } else {
      retryRef.current = 0;
      clearTimeout(retryTimerRef.current);
    }
  }, [active, token, project?.id, range, detailed, customStart, customEnd]);

  loadRef.current = load;

  useEffect(() => {
    if (active) return;
    controllerRef.current?.abort();
    clearTimeout(retryTimerRef.current);
    setLiveStatus('IDLE');
  }, [active]);

  useEffect(() => {
    if (!autoRefresh) clearTimeout(retryTimerRef.current);
  }, [autoRefresh]);

  useEffect(() => {
    if (!active) return;
    retryRef.current = 0;
    overviewRef.current = null;
    setOverview(null);
    setMetrics(null);
    setServices(null);
    setErrors({});
    load(false);
  }, [active, project?.id, range, detailed, token, customStart, customEnd, load]);

  useEffect(() => {
    if (!active || !autoRefresh) return;
    const timer = setInterval(() => load(false), OVERVIEW_POLL_MS);
    return () => clearInterval(timer);
  }, [active, autoRefresh, load]);

  useEffect(() => {
    if (!active || !autoRefresh) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active, autoRefresh, load]);

  useEffect(() => {
    if (!active || !autoRefresh || !project?.id) return;
    const client = getRealtimeClient(project);
    if (!client) {
      setLiveStatus(project?.realtime ? 'UNAVAILABLE' : 'NOT_CONFIGURED');
      return;
    }
    let timer = null;
    let channel = null;
    try {
      channel = client.channel(`monitoring-${project.id}`);
      for (const table of project.tables || []) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (mountedRef.current) loadRef.current?.(false);
          }, 1500);
        });
      }
      channel.subscribe((status) => {
        if (mountedRef.current) setLiveStatus(status);
      });
    } catch {
      setLiveStatus('UNAVAILABLE');
    }
    return () => {
      clearTimeout(timer);
      if (channel) Promise.resolve(client.removeChannel(channel)).catch(() => {});
    };
  }, [active, autoRefresh, project]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    clearTimeout(retryTimerRef.current);
  }, []);

  return {
    overview,
    metrics,
    services,
    errors,
    loading,
    refreshing,
    lastUpdated,
    liveStatus,
    refresh: () => load(true),
  };
}

export function useLogsFeed({ project, range, token, active, filters, customStart, customEnd, autoRefresh = false }) {
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const controllerRef = useRef(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef(null);
  const loadRef = useRef(null);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!active || !token || !project?.id) return;
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    try {
      const payload = await adminFetch(`/api/admin/monitoring/logs?${queryString({ project: project.id, range, start: customStart, end: customEnd, ...filters })}`, { token, signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted || controllerRef.current !== controller) return;
      setLogs(payload.logs || []);
      setMeta(payload.meta || null);
      setError(null);
      retryRef.current = 0;
      clearTimeout(retryTimerRef.current);
    } catch (requestError) {
      if (!mountedRef.current || controller.signal.aborted || controllerRef.current !== controller) return;
      setError({ code: requestError.code || 'request_failed', message: requestError.message || 'Logs request failed.' });
      if (autoRefreshRef.current) {
        retryRef.current += 1;
        const delay = retryDelay(retryRef.current);
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) loadRef.current?.();
        }, delay);
      }
    } finally {
      if (mountedRef.current && controllerRef.current === controller) setLoading(false);
    }
  }, [active, token, project?.id, range, filters, customStart, customEnd]);

  loadRef.current = load;

  useEffect(() => {
    if (!autoRefresh) clearTimeout(retryTimerRef.current);
  }, [autoRefresh]);

  useEffect(() => {
    if (!active) return;
    setLogs([]);
    setMeta(null);
    setError(null);
    retryRef.current = 0;
    load();
  }, [active, project?.id, range, filters, token, customStart, customEnd, load]);

  useEffect(() => {
    if (!active || !autoRefresh) return;
    const timer = setInterval(load, 300000);
    return () => clearInterval(timer);
  }, [active, autoRefresh, load]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    clearTimeout(retryTimerRef.current);
  }, []);

  return { logs, meta, loading, error, refresh: load };
}

export function useFunctionsFeed({ project, range, token, active, customStart, customEnd }) {
  const [functions, setFunctions] = useState([]);
  const [functionId, setFunctionId] = useState('');
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || !token || !project?.id) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    adminFetch(`/api/admin/monitoring/functions?${queryString({ project: project.id, range, start: customStart, end: customEnd, functionId })}`, { token, signal: controller.signal })
      .then((payload) => {
        if (cancelled || !mountedRef.current) return;
        setFunctions(payload.functions || []);
        setStats(payload.stats || null);
        setStatsError(payload.statsError || null);
        setError(null);
        if (!functionId && payload.functions?.[0]?.id) setFunctionId(payload.functions[0].id);
      })
      .catch((requestError) => {
        if (cancelled || !mountedRef.current) return;
        setError({ message: requestError.message || 'Edge Function statistics are unavailable.' });
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, token, project?.id, range, functionId, customStart, customEnd]);

  return { functions, functionId, setFunctionId, stats, statsError, loading, error };
}
