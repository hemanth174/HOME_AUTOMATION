"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { buildAlerts } from "@/lib/monitoring/calculations.mjs";
import { formatTimestamp, statusTone } from "./client";
import {
  DataSourceNote,
  EmptyState,
  InlineNotice,
  Panel,
  SectionTitle,
  StatusIcon,
  StatusPill,
} from "./MonitoringUi";

const SERVICE_NAMES = {
  auth: 'Authentication',
  db: 'Database',
  db_postgres_user: 'Postgres user',
  pooler: 'Pooler',
  realtime: 'Realtime',
  rest: 'REST',
  storage: 'Storage',
  pg_bouncer: 'PgBouncer',
};

export default function HealthPanel({ project, feed }) {
  const overview = feed.overview;
  const health = overview?.health;
  const metrics = feed.metrics;
  const alerts = buildAlerts({ overview, metrics });
  const services = health?.services || [];
  const overallTone = statusTone(health?.overall || 'unknown');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel>
          <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Overall health</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusIcon tone={overallTone} />
            <p className="text-xl font-black capitalize text-text">{health?.overall || 'unknown'}</p>
          </div>
          <p className="mt-1 text-[10px] font-semibold leading-relaxed text-text-muted">{health?.error?.message || 'Computed from project status and documented service health records.'}</p>
        </Panel>
        <Panel>
          <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Latest health check</p>
          <p className="mt-2 text-lg font-black text-text">{health?.fetchedAt ? formatTimestamp(health.fetchedAt, { short: true }) : '—'}</p>
          <p className="mt-1 text-[10px] font-semibold text-text-muted">{project.label}</p>
        </Panel>
        <Panel>
          <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Actionable alerts</p>
          <p className="mt-2 text-2xl font-black text-text">{alerts.length}</p>
          <p className="mt-1 text-[10px] font-semibold text-text-muted">Thresholds use real measurements only.</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <SectionTitle title="Service health" icon={ShieldCheck} description="Documented Management API service statuses." right={<StatusPill tone={services.length ? 'ok' : 'unknown'} label={`${services.length} services`} />} />
          {services.length ? (
            <div className="space-y-2">
              {services.map((service) => (
                <div key={service.name} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card-alt/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-text">{SERVICE_NAMES[service.name] || service.name}</p>
                    <p className="mt-0.5 break-words text-[10px] font-medium text-text-muted">{service.error || service.info?.description || service.info?.name || 'No extra detail reported.'}</p>
                  </div>
                  <StatusPill tone={statusTone(service.status)} label={service.status} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Service health unavailable" description={health?.error?.message || 'No service health records were returned by the Management API.'} icon={HelpCircle} />
          )}
        </Panel>

        <Panel>
          <SectionTitle title="Threshold alerts" icon={AlertTriangle} description="Warnings and critical conditions from current measurements." />
          {alerts.length ? (
            <div className="space-y-2">
              {alerts.map((alert, index) => (
                <div key={`${alert.title}-${index}`} className={`rounded-xl border p-3 ${alert.severity === 'critical' ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                  <div className="flex items-start gap-2">
                    {alert.severity === 'critical' ? <ShieldAlert size={15} className="mt-0.5 shrink-0 text-red-500" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />}
                    <div className="min-w-0">
                      <p className={`text-[11px] font-black ${alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>{alert.title}</p>
                      <p className="mt-1 text-[10px] font-semibold text-text-muted">{alert.service} · measured <span className="font-black text-text">{alert.value}</span> · threshold {alert.threshold}</p>
                      <p className="mt-1 text-[10px] font-medium leading-relaxed text-text-muted">{alert.explanation}</p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-text-muted">Observed {formatTimestamp(alert.observedAt, { short: true })}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No threshold alerts" description="No configured threshold was breached by the available measurements. Unknown metrics are not treated as healthy." icon={CheckCircle2} />
          )}
        </Panel>
      </div>

      <Panel>
        <SectionTitle title="Assessability" icon={Activity} description="What this health view can and cannot conclude." />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card-alt/40 p-3">
            <p className="text-[10px] font-black text-text">Known</p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-text-muted">Project status, service health records, HTTP status distribution, severity counts and available database metrics.</p>
          </div>
          <div className="rounded-xl border border-border bg-card-alt/40 p-3">
            <p className="text-[10px] font-black text-text">Unknown</p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-text-muted">A service with no recorded data is marked unknown or unavailable. It is not automatically declared unhealthy.</p>
          </div>
        </div>
        {!project.configured.metrics ? <div className="mt-3"><InlineNotice tone="info" title="Infrastructure thresholds disabled">CPU, memory, disk and connection alerts require the Metrics API secret key.</InlineNotice></div> : null}
        {!project.configured.management ? <div className="mt-3"><InlineNotice tone="warn" title="Service health disabled">Add the Management API token to read project and service health.</InlineNotice></div> : null}
        <DataSourceNote>Health checks are read-only. No restart, scaling, or configuration changes are performed from this dashboard.</DataSourceNote>
      </Panel>
    </div>
  );
}
