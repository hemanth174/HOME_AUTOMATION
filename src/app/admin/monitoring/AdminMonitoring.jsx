"use client";

import AppSelect from '@/components/AppSelect';
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  PROJECT_TABS,
  RANGE_CHOICES,
  adminFetch,
  formatTimestamp,
  timeAgo,
} from "./client";
import OverviewPanel, { ProjectSummaryCard } from "./OverviewPanel";
import ServicesPanel from "./ServicesPanel";
import InfrastructurePanel from "./InfrastructurePanel";
import LogsPanel from "./LogsPanel";
import HealthPanel from "./HealthPanel";
import { useProjectFeed } from "./useMonitoringData";
import {
  EmptyState,
  InlineNotice,
  LiveBadge,
  LoadingBlock,
  Panel,
  StatusPill,
} from "./MonitoringUi";

function toLocalInput(date) {
  const value = new Date(date);
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function PanelRouter({ tab, project, feed, token, range, rangeLabel, autoRefresh, onOpenTab }) {
  if (tab === 'services') return <ServicesPanel project={project} feed={feed} token={token} range={range} rangeLabel={rangeLabel} />;
  if (tab === 'infrastructure') return <InfrastructurePanel project={project} feed={feed} />;
  if (tab === 'logs') return <LogsPanel project={project} token={token} range={range} rangeLabel={rangeLabel} autoRefresh={autoRefresh} />;
  if (tab === 'health') return <HealthPanel project={project} feed={feed} />;
  return <OverviewPanel project={project} feed={feed} rangeLabel={rangeLabel} onOpenTab={onOpenTab} />;
}

export default function AdminMonitoring({ accessToken = "", standalone = false }) {
  const [token, setToken] = useState(accessToken);
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('vikatech');
  const [range, setRange] = useState('1h');
  const [tab, setTab] = useState('overview');
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const now = useMemo(() => new Date(), []);
  const [customStart, setCustomStart] = useState(() => toLocalInput(now.getTime() - 24 * 60 * 60 * 1000));
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(now));
  const [appliedStart, setAppliedStart] = useState(() => toLocalInput(now.getTime() - 24 * 60 * 60 * 1000));
  const [appliedEnd, setAppliedEnd] = useState(() => toLocalInput(now));

  useEffect(() => {
    if (accessToken) {
      setToken(accessToken);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setToken(session?.access_token || '');
    }).catch(() => {});
    return () => { active = false; };
  }, [accessToken]);

  const loadProjects = useCallback(async () => {
    if (!token) return false;
    try {
      const payload = await adminFetch('/api/admin/monitoring/projects', { token });
      setProjects(payload.projects || []);
      setProjectsError(null);
      return true;
    } catch (error) {
      setProjectsError(error);
      return false;
    } finally {
      setProjectsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let timer = null;
    let active = true;
    const run = async () => {
      const ok = await loadProjects();
      if (active && !ok) timer = setTimeout(run, 10000);
    };
    run();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, loadProjects]);

  const projectVika = projects.find((item) => item.id === 'vikatech') || null;
  const projectMqtt = projects.find((item) => item.id === 'mqtt') || null;
  const selectedMeta = projects.find((item) => item.id === selectedProject) || projectVika || projectMqtt;
  const customStartIso = range === 'custom' ? new Date(appliedStart).toISOString() : undefined;
  const customEndIso = range === 'custom' ? new Date(appliedEnd).toISOString() : undefined;
  const rangeLabel = RANGE_CHOICES.find((item) => item.key === range)?.label || 'Last 1 hour';

  const feedVika = useProjectFeed({
    project: projectVika,
    range,
    customStart: customStartIso,
    customEnd: customEndIso,
    token,
    active: Boolean(monitoringEnabled && projectVika && token),
    detailed: selectedProject === 'vikatech',
    autoRefresh,
  });
  const feedMqtt = useProjectFeed({
    project: projectMqtt,
    range,
    customStart: customStartIso,
    customEnd: customEndIso,
    token,
    active: Boolean(monitoringEnabled && projectMqtt && token),
    detailed: selectedProject === 'mqtt',
    autoRefresh,
  });
  const activeFeed = selectedProject === 'mqtt' ? feedMqtt : feedVika;
  const activeProject = selectedMeta || { id: selectedProject, label: selectedProject === 'mqtt' ? 'MQTT Supabase' : 'VikaTech Application', configured: {}, envKeys: {}, tables: [] };

  const refreshAll = () => {
    feedVika.refresh();
    feedMqtt.refresh();
  };

  const applyCustom = () => {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setProjectsError({ message: 'Choose a valid custom start and end time.' });
      return;
    }
    setProjectsError(null);
    setAppliedStart(customStart);
    setAppliedEnd(customEnd);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[.2em] text-text-muted">
              <span>Monitoring</span>
              <ChevronRight size={10} />
              <span className="text-accent">Supabase Analytics</span>
              {standalone ? (
                <Link href="/admin" className="ml-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[9px] font-black text-text-muted hover:border-accent hover:text-accent">
                  <ArrowLeft size={9} /> Admin
                </Link>
              ) : null}
            </div>
            <h1 className="mt-1 text-xl font-black tracking-tight text-text sm:text-2xl">Supabase Monitoring</h1>
            <p className="mt-1 max-w-2xl text-[11px] font-semibold leading-relaxed text-text-muted">Project usage, service health, logs, and database performance across VikaTech and MQTT Supabase. Start monitoring when you need it.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge status={monitoringEnabled ? activeFeed.liveStatus : 'IDLE'} autoRefresh={monitoringEnabled && autoRefresh} />
            <button type="button" onClick={() => { setMonitoringEnabled((value) => !value); setAutoRefresh(false); }} disabled={!token || projectsLoading} className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black disabled:opacity-50 ${monitoringEnabled ? 'border-red-500/30 bg-red-500/10 text-red-500' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`} aria-pressed={monitoringEnabled}>
              <Activity size={12} /> {monitoringEnabled ? 'Stop monitoring' : 'Start monitoring'}
            </button>
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-2 text-[10px] font-black text-text-muted">
              <Clock size={12} />
              <AppSelect value={range} onChange={(event) => setRange(event.target.value)} className="bg-transparent text-[10px] font-black text-text outline-none" aria-label="Time range">
                {RANGE_CHOICES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </AppSelect>
            </label>
            <button type="button" onClick={() => setAutoRefresh((value) => !value)} disabled={!monitoringEnabled} className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[10px] font-black disabled:opacity-50 ${autoRefresh ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-border bg-card text-text-muted'}`} aria-pressed={monitoringEnabled && autoRefresh}>
              <Activity size={12} /> Auto {autoRefresh ? 'on' : 'off'}
            </button>
            <button type="button" onClick={refreshAll} disabled={!token || !monitoringEnabled} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-[10px] font-black text-text hover:border-accent/60 disabled:opacity-50">
              <RefreshCw size={12} className={activeFeed.refreshing ? 'animate-spin text-accent' : ''} /> Refresh
            </button>
            {!standalone ? (
              <Link href="/admin/monitoring" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-[10px] font-black text-text hover:border-accent/60">
                <ExternalLink size={12} /> Full page
              </Link>
            ) : null}
          </div>
        </div>

        {range === 'custom' ? (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card-alt/40 p-2.5">
            <label className="block"><span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-text-muted">Start</span><input type="datetime-local" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="min-h-9 rounded-lg border border-border bg-background px-2 text-[10px] font-bold text-text outline-none focus:border-accent" /></label>
            <label className="block"><span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-text-muted">End</span><input type="datetime-local" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="min-h-9 rounded-lg border border-border bg-background px-2 text-[10px] font-bold text-text outline-none focus:border-accent" /></label>
            <button type="button" onClick={applyCustom} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[10px] font-black text-[var(--btn-text)]"><Settings2 size={12} /> Apply range</button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-bold uppercase tracking-wide text-text-muted">
          <span>Updated {activeFeed.lastUpdated ? `${timeAgo(activeFeed.lastUpdated)} · ${formatTimestamp(activeFeed.lastUpdated, { short: true })}` : 'waiting for first response'}</span>
          {selectedMeta?.ref ? <span>Ref {selectedMeta.ref}</span> : null}
          <span>{rangeLabel}</span>
        </div>
      </div>

      {!token ? (
        <InlineNotice tone="bad" title="Admin session required">Sign in as an authorized administrator to load monitoring data. Privileged Supabase calls are always made server-side.</InlineNotice>
      ) : null}
      {projectsError ? <InlineNotice tone="bad" title="Monitoring configuration problem">{projectsError.message}</InlineNotice> : null}

      {!monitoringEnabled ? (
        <Panel>
          <EmptyState title="Monitoring is paused" description="No log scans or live monitoring refreshes run until you start monitoring. Starting loads the current view once; turn on Auto if you want continuous updates." icon={Activity} action={<button type="button" onClick={() => setMonitoringEnabled(true)} disabled={!token || projectsLoading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[10px] font-black text-[var(--btn-text)] disabled:opacity-50">Start monitoring</button>} />
        </Panel>
      ) : (
        <>

      {projectsLoading ? (
        <Panel><LoadingBlock label="Reading project configuration" rows={3} /></Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {projectVika ? <ProjectSummaryCard project={projectVika} feed={feedVika} selected={selectedProject === 'vikatech'} onSelect={() => setSelectedProject('vikatech')} rangeLabel={rangeLabel} autoRefresh={autoRefresh} /> : null}
          {projectMqtt ? <ProjectSummaryCard project={projectMqtt} feed={feedMqtt} selected={selectedProject === 'mqtt'} onSelect={() => setSelectedProject('mqtt')} rangeLabel={rangeLabel} autoRefresh={autoRefresh} /> : null}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {[projectVika, projectMqtt].filter(Boolean).map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedProject(item.id)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black ${selectedProject === item.id ? 'border-accent/50 bg-accent-bg text-accent' : 'border-border bg-card-alt/40 text-text-muted hover:text-text'}`}>
                {item.id === 'mqtt' ? <Server size={12} /> : <Database size={12} />}
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone={activeFeed.overview?.health?.overall === 'healthy' ? 'ok' : activeFeed.overview?.health?.overall === 'critical' ? 'bad' : activeFeed.overview?.health?.overall === 'warning' ? 'warn' : 'unknown'} label={activeFeed.overview?.health?.overall || 'health unknown'} />
            <StatusPill tone={activeProject.configured.management ? 'ok' : 'unknown'} label={activeProject.configured.management ? 'Management' : 'Management off'} />
            <StatusPill tone={activeProject.configured.metrics ? 'ok' : 'unknown'} label={activeProject.configured.metrics ? 'Metrics' : 'Metrics off'} />
          </div>
        </div>

        <nav className="mt-3 flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card-alt p-1.5" aria-label="Monitoring sections">
          {PROJECT_TABS.map((item) => (
            <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex shrink-0 items-center rounded-lg px-3 py-2 text-[10px] font-black transition ${tab === item.key ? 'border border-border bg-card text-text shadow-sm' : 'text-text-muted hover:bg-card/40 hover:text-text'}`}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-3 rounded-xl border border-border bg-card-alt/30 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-text-muted">
            <span className="inline-flex items-center gap-1.5 font-black text-text"><ShieldCheck size={12} /> {activeProject.label}</span>
            <span>Ref: <span className="font-mono font-bold text-text">{activeFeed.overview?.project?.ref || activeProject.ref || '—'}</span></span>
            <span>Region: <span className="font-bold text-text">{activeFeed.overview?.project?.region || '—'}</span></span>
            <span>Status: <span className="font-bold text-text">{activeFeed.overview?.project?.status || 'UNKNOWN'}</span></span>
            <span>Postgres: <span className="font-bold text-text">{activeFeed.overview?.project?.databaseVersion || '—'}</span></span>
          </div>
        </div>

        <div className="mt-4">
          {activeFeed.loading && !activeFeed.overview ? (
            <Panel><LoadingBlock label={`Loading ${activeProject.label} monitoring data`} rows={6} /></Panel>
          ) : activeFeed.errors.overview && !activeFeed.overview ? (
            <Panel>
              <EmptyState title="Monitoring data could not be loaded" description={activeFeed.errors.overview.message} icon={Activity} action={<button type="button" onClick={activeFeed.refresh} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[10px] font-black text-text hover:border-accent/60"><RefreshCw size={12} /> Retry</button>} />
            </Panel>
          ) : (
            <PanelRouter tab={tab} project={activeProject} feed={activeFeed} token={token} range={range} rangeLabel={`${rangeLabel} · ${activeProject.label}`} autoRefresh={autoRefresh} onOpenTab={setTab} />
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
