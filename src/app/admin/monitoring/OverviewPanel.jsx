"use client";

import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Database,
  Globe2,
  HardDrive,
  KeyRound,
  Radio,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatNumber,
  formatPercent,
  formatTimestamp,
  serviceLabel,
  statusTone,
} from "./client";
import {
  DataSourceNote,
  EmptyState,
  InlineNotice,
  LiveBadge,
  MetricCard,
  Panel,
  SectionTitle,
  StatusIcon,
  StatusPill,
} from "./MonitoringUi";

function edgeCounts(services, overview) {
  return services?.summary?.edge_logs || overview?.services?.summary?.edge_logs || null;
}

export function ProjectSummaryCard({ project, feed, selected, onSelect, rangeLabel, autoRefresh }) {
  const overview = feed.overview;
  const info = overview?.project;
  const health = overview?.health;
  const overall = health?.overall || 'unknown';
  const services = overview?.services?.summary || {};
  const functionEvents = services.function_edge_logs?.events;
  const postgresErrors = services.postgres_logs?.error_events;
  const serviceEvents = Object.values(services).reduce((sum, row) => sum + (Number(row?.events) || 0), 0);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group min-w-0 rounded-2xl border bg-card p-4 text-left shadow-sm transition-all sm:p-5 ${
        selected ? 'border-accent/60 ring-1 ring-accent/20' : 'border-border hover:border-accent/40'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-black text-text">{project.label}</h2>
            <StatusPill tone={statusTone(overall)} label={overall} />
            <LiveBadge status={feed.liveStatus} autoRefresh={autoRefresh} />
          </div>
          <p className="mt-1 truncate text-[11px] font-semibold text-text-muted">{project.description}</p>
          <p className="mt-2 break-all font-mono text-[10px] font-bold text-text-muted">{info?.ref || project.ref || 'Project ref missing'} · {info?.region || 'Region unknown'}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card-alt text-text-muted transition group-hover:border-accent/50 group-hover:text-accent">
          <ArrowUpRight size={16} />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card-alt/60 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">Service events</p>
          <p className="mt-1 text-sm font-black text-text">{Object.keys(services).length ? formatNumber(serviceEvents) : '—'}</p>
        </div>
        <div className="rounded-xl border border-border bg-card-alt/60 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">Function calls</p>
          <p className="mt-1 text-sm font-black text-text">{Number.isFinite(Number(functionEvents)) ? formatNumber(functionEvents) : '—'}</p>
        </div>
        <div className="rounded-xl border border-border bg-card-alt/60 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">DB errors</p>
          <p className="mt-1 text-sm font-black text-text">{Number.isFinite(Number(postgresErrors)) ? formatNumber(postgresErrors) : '—'}</p>
        </div>
        <div className="rounded-xl border border-border bg-card-alt/60 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">Freshness</p>
          <p className="mt-1 truncate text-[11px] font-black text-text">{feed.lastUpdated ? formatTimestamp(feed.lastUpdated, { short: true }) : 'Waiting'}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusPill tone={project.configured.management ? 'ok' : 'unknown'} label={project.configured.management ? 'Management API' : 'Management token missing'} />
        <StatusPill tone={project.configured.metrics ? 'ok' : 'unknown'} label={project.configured.metrics ? 'Metrics API' : 'Metrics key missing'} />
        <StatusPill tone={project.configured.realtime ? 'ok' : 'unknown'} label={project.configured.realtime ? 'Realtime stream' : 'Auto-refresh only'} />
        <span className="text-[9px] font-bold uppercase tracking-wide text-text-muted">{rangeLabel}</span>
      </div>

      {!project.configured.management ? (
        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-amber-600 dark:text-amber-400">
          Add {project.envKeys.token} as a server-only variable to enable real Management API data for this project.
        </p>
      ) : null}
      {feed.errors.overview && project.configured.management ? (
        <p className="mt-3 truncate rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[10px] font-semibold text-red-500">{feed.errors.overview.message}</p>
      ) : null}
    </button>
  );
}

export default function OverviewPanel({ project, feed, rangeLabel, onOpenTab }) {
  const { overview, services, errors } = feed;
  const summary = services?.summary || overview?.services?.summary || {};
  const edge = edgeCounts(services, overview);
  const usage = overview?.usage;
  const chartData = useMemo(
    () => (usage?.series || []).map((row) => ({
      label: formatTimestamp(row.timestamp, { short: true }),
      Auth: row.auth,
      REST: row.rest,
      Realtime: row.realtime,
      Storage: row.storage,
    })),
    [usage?.series]
  );
  const recent = [...(services?.failures || []), ...(services?.warnings || [])].slice(0, 6);

  const usageAvailable = usage?.availability === 'available' || usage?.availability === 'no_data';
  const serviceEvents = Object.values(summary).reduce((sum, row) => sum + (Number(row?.events) || 0), 0);
  const usageMix = [
    { name: 'Auth', value: Number(usage?.totals?.auth) || 0, color: '#38bdf8' },
    { name: 'REST', value: Number(usage?.totals?.rest) || 0, color: '#22c55e' },
    { name: 'Realtime', value: Number(usage?.totals?.realtime) || 0, color: '#f59e0b' },
    { name: 'Storage', value: Number(usage?.totals?.storage) || 0, color: '#a78bfa' },
  ].filter((item) => item.value > 0);
  const serviceMix = [
    { name: 'API Gateway', value: Number(summary.edge_logs?.events) || 0, color: '#22c55e' },
    { name: 'Auth', value: Number(summary.auth_logs?.events) || 0, color: '#38bdf8' },
    { name: 'Edge Functions', value: Number(summary.function_edge_logs?.events) || 0, color: '#a78bfa' },
    { name: 'PostgreSQL', value: Number(summary.postgres_logs?.events) || 0, color: '#f97316' },
    { name: 'Realtime', value: Number(summary.realtime_logs?.events) || 0, color: '#f59e0b' },
    { name: 'Storage', value: Number(summary.storage_logs?.events) || 0, color: '#ec4899' },
  ].filter((item) => item.value > 0);
  const edgeValid = edge ? (edge.success || 0) + (edge.client_errors || 0) + (edge.server_errors || 0) : 0;
  const rate = edgeValid > 0 ? ((edge.success || 0) / edgeValid) * 100 : null;
  const errorRate = edgeValid > 0 ? (((edge.client_errors || 0) + (edge.server_errors || 0)) / edgeValid) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total service events"
          value={Object.keys(summary).length ? formatNumber(serviceEvents) : '—'}
          unit={Object.keys(summary).length ? 'events' : ''}
          icon={Activity}
          tone="info"
          availability={Object.keys(summary).length ? 'available' : 'unavailable'}
          subtitle="API Gateway + Auth + Edge Functions + PostgreSQL + Realtime + Storage"
          note="Matches the Supabase project dashboard total; PostgreSQL entries are log events, not HTTP requests."
        />
        <MetricCard
          title="API usage counters"
          value={usageAvailable ? formatNumber(usage?.totals?.total) : '—'}
          unit={usageAvailable ? 'requests' : ''}
          icon={Globe2}
          tone="info"
          availability={usage?.availability}
          subtitle="Auth + REST + Realtime + Storage counters"
          note={usage?.note || usage?.error?.message || 'Edge Functions and PostgreSQL are counted separately.'}
        />
        <MetricCard
          title="API success rate"
          value={rate !== null ? formatPercent(rate) : '—'}
          unit={rate !== null ? '' : ''}
          icon={ShieldCheck}
          tone={rate === null ? 'unknown' : rate >= 99 ? 'ok' : rate >= 95 ? 'warn' : 'bad'}
          availability={rate !== null ? 'available' : 'unavailable'}
          subtitle="Valid 2xx/3xx responses divided by valid 2xx–5xx responses"
          note={rate === null ? (edge ? 'No valid HTTP status codes were recorded.' : 'API Gateway status data is unavailable.') : `Denominator: ${formatNumber(edgeValid)} valid responses`}
        />
        <MetricCard
          title="API Gateway errors"
          value={edgeValid > 0 ? formatNumber((edge.client_errors || 0) + (edge.server_errors || 0)) : '—'}
          icon={AlertTriangle}
          tone={edgeValid > 0 ? (Number(edge.server_errors) > 0 ? 'bad' : 'warn') : 'unknown'}
          availability={edgeValid > 0 ? 'available' : 'unavailable'}
          subtitle={edgeValid > 0 ? `${formatNumber(edge.client_errors)} 4xx · ${formatNumber(edge.server_errors)} 5xx` : 'No valid status codes recorded'}
          note={edgeValid > 0 ? `${formatPercent(errorRate)} of valid responses` : null}
        />
        <MetricCard
          title="Auth requests"
          value={usageAvailable ? formatNumber(usage?.totals?.auth) : '—'}
          icon={KeyRound}
          tone="info"
          availability={usage?.availability}
          subtitle={summary.auth_logs ? `${formatNumber(summary.auth_logs.error_events)} auth error events` : 'Auth request usage counter'}
          note={summary.auth_logs ? 'Log event counts are not unique login attempts.' : usage?.error?.message}
        />
        <MetricCard
          title="Edge Function invocations"
          value={Number.isFinite(Number(summary.function_edge_logs?.events)) ? formatNumber(summary.function_edge_logs.events) : '—'}
          icon={Zap}
          tone={Number(summary.function_edge_logs?.server_errors) > 0 ? 'warn' : 'info'}
          availability={summary.function_edge_logs ? 'available' : 'unavailable'}
          subtitle={summary.function_edge_logs ? `${formatNumber(summary.function_edge_logs.server_errors)} 5xx · ${formatNumber(summary.function_edge_logs.client_errors)} 4xx` : 'function_edge_logs unavailable'}
          note={summary.function_edge_logs?.avg_execution_ms ? `Avg execution ${Math.round(summary.function_edge_logs.avg_execution_ms)} ms` : null}
        />
        <MetricCard
          title="PostgreSQL events"
          value={Number.isFinite(Number(summary.postgres_logs?.error_events)) ? formatNumber(summary.postgres_logs.error_events) : '—'}
          icon={Database}
          tone={Number(summary.postgres_logs?.error_events) > 0 ? 'warn' : 'ok'}
          availability={summary.postgres_logs ? 'available' : 'unavailable'}
          subtitle={summary.postgres_logs ? `${formatNumber(summary.postgres_logs.warning_events)} warnings` : 'postgres_logs unavailable'}
          note="Severity-based log events, not all database log rows."
        />
        <MetricCard
          title="Realtime requests"
          value={usageAvailable ? formatNumber(usage?.totals?.realtime) : '—'}
          icon={Radio}
          tone="info"
          availability={usage?.availability}
          subtitle={summary.realtime_logs ? `${formatNumber(summary.realtime_logs.error_events)} realtime error events` : 'Realtime usage counter'}
          note={usage?.error?.message}
        />
        <MetricCard
          title="Storage requests"
          value={usageAvailable ? formatNumber(usage?.totals?.storage) : '—'}
          icon={HardDrive}
          tone="info"
          availability={usage?.availability}
          subtitle={summary.storage_logs ? `${formatNumber(summary.storage_logs.error_events)} storage error events` : 'Storage usage counter'}
          note="API request count, not stored bytes."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionTitle
            title="Request volume"
            icon={Activity}
            description={`${rangeLabel} · ${usage?.interval || '—'} buckets from usage.api-counts`}
            right={<StatusPill tone={usageAvailable ? 'ok' : 'unknown'} label={usageAvailable ? `${chartData.length} buckets` : 'Unavailable'} />}
          />
          {chartData.length ? (
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="monitorAuth" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} /><stop offset="95%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient>
                    <linearGradient id="monitorRest" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                    <linearGradient id="monitorRealtime" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                    <linearGradient id="monitorStorage" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} /><stop offset="95%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} stroke="#64748b" minTickGap={24} />
                  <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} stroke="#64748b" allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11 }} labelStyle={{ color: 'var(--text)', fontWeight: 800 }} itemStyle={{ fontWeight: 700 }} />
                  <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                  <Area type="monotone" dataKey="Auth" stackId="1" stroke="#38bdf8" fill="url(#monitorAuth)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="REST" stackId="1" stroke="#22c55e" fill="url(#monitorRest)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="Realtime" stackId="1" stroke="#f59e0b" fill="url(#monitorRealtime)" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="Storage" stackId="1" stroke="#a78bfa" fill="url(#monitorStorage)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title={usage?.availability === 'unconfigured' ? 'Monitoring token not configured' : 'No usage buckets returned'}
              description={usage?.error?.message || 'The provider returned no recorded usage for this range. Missing buckets are not replaced with zero.'}
            />
          )}
          <DataSourceNote>Source: Supabase Management API usage.api-counts. Missing intervals are omitted; a recorded zero stays zero. Provider bucket boundaries are preserved.</DataSourceNote>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-border bg-card-alt/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Usage mix</p>
                <span className="text-[9px] font-bold text-text-muted">{formatNumber(usage?.totals?.total)} requests</span>
              </div>
              {usageMix.length ? (
                <div className="h-[190px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={usageMix} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={42} outerRadius={68} paddingAngle={2} stroke="none">
                        {usageMix.map((item) => <Cell key={item.name} fill={item.color} />)}
                      </Pie>
                      <Tooltip formatter={(value) => formatNumber(value)} contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11 }} itemStyle={{ fontWeight: 700 }} />
                      <Legend wrapperStyle={{ fontSize: 9, fontWeight: 700 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="flex h-[190px] items-center justify-center px-3 text-center text-[10px] font-semibold text-text-muted">No usage counters returned for this range.</p>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-border bg-card-alt/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Service event mix</p>
                <span className="text-[9px] font-bold text-text-muted">{Object.keys(summary).length ? formatNumber(serviceEvents) : '—'} events</span>
              </div>
              {serviceMix.length ? (
                <div className="h-[190px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={serviceMix} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={42} outerRadius={68} paddingAngle={2} stroke="none">
                        {serviceMix.map((item) => <Cell key={item.name} fill={item.color} />)}
                      </Pie>
                      <Tooltip formatter={(value) => formatNumber(value)} contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11 }} itemStyle={{ fontWeight: 700 }} />
                      <Legend wrapperStyle={{ fontSize: 9, fontWeight: 700 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="flex h-[190px] items-center justify-center px-3 text-center text-[10px] font-semibold text-text-muted">No service log events returned for this range.</p>
              )}
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle title="Provider request count" icon={Globe2} description="Reported separately from the range series." />
            <div className="rounded-xl border border-border bg-card-alt/50 p-3">
              <p className="text-2xl font-black text-text">{overview?.requestCount?.value !== null && overview?.requestCount?.value !== undefined ? formatNumber(overview.requestCount.value) : '—'}</p>
              <p className="mt-1 text-[10px] font-semibold leading-relaxed text-text-muted">{overview?.requestCount?.note || overview?.requestCount?.error?.message || 'No request count was returned.'}</p>
            </div>
          </Panel>
          <Panel>
            <SectionTitle title="Recent critical events" icon={AlertTriangle} description="Failed or warning log events in the observed window." right={<button type="button" onClick={() => onOpenTab('logs')} className="text-[10px] font-black text-accent hover:underline">Explorer</button>} />
            {recent.length ? (
              <div className="space-y-2">
                {recent.map((event, index) => (
                  <div key={`${event.id || index}-${event.timestamp}`} className="rounded-xl border border-border bg-card-alt/40 p-2.5">
                    <div className="flex items-center gap-2">
                      <StatusIcon tone={statusTone(event.status >= 500 ? 'critical' : event.status >= 400 ? 'warning' : 'warning')} />
                      <span className="truncate text-[10px] font-black text-text">{serviceLabel(event.source)}</span>
                      <span className="ml-auto shrink-0 text-[9px] font-bold text-text-muted">{formatTimestamp(event.timestamp, { short: true })}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-[10px] font-medium leading-relaxed text-text-muted">{event.event_message || 'No message'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No recent failures" description="No 4xx/5xx or warning events were returned for the observed window." icon={ShieldCheck} />
            )}
          </Panel>
        </div>
      </div>

      {errors.overview ? <InlineNotice tone="bad" title="Overview data issue">{errors.overview.message}</InlineNotice> : null}
      {errors.services ? <InlineNotice tone="warn" title="Service log issue">{errors.services.message}</InlineNotice> : null}
    </div>
  );
}
