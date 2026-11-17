"use client";

import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  ShieldCheck,
} from "lucide-react";
import { formatBytes, formatNumber, formatPercent } from "./client";
import {
  DataSourceNote,
  EmptyState,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  Panel,
  ProgressBar,
  SectionTitle,
  StatusPill,
} from "./MonitoringUi";

function metricAvailability(entry) {
  return entry?.availability || (Number.isFinite(entry?.value) ? 'available' : 'unavailable');
}

export default function InfrastructurePanel({ project, feed }) {
  const metrics = feed.metrics;
  const values = metrics?.metrics || {};
  const meta = metrics?.meta;
  const loading = feed.loading && !metrics;

  if (!project.configured.metrics) {
    return (
      <Panel>
        <SectionTitle title="Database infrastructure" icon={Server} description="Metrics API requires a server-only Supabase Secret API key." />
        <InlineNotice tone="warn" title="Database metrics are not configured">
          Add <span className="font-mono font-bold">{project.envKeys.secret}</span> on the server. The Metrics API uses HTTP Basic Auth with username service_role and a Supabase Secret API key. It is never exposed to the browser.
        </InlineNotice>
        <div className="mt-4">
          <EmptyState title="No measurements to display" description="Real CPU, memory, disk and connection values will appear here after the secret key is configured. Placeholder values are never shown." icon={Server} />
        </div>
      </Panel>
    );
  }

  if (loading) {
    return <Panel><SectionTitle title="Database infrastructure" icon={Server} /><LoadingBlock label="Scraping real Prometheus metrics" rows={6} /></Panel>;
  }

  if (!meta || meta.availability !== 'available') {
    return (
      <div className="space-y-4">
        <InlineNotice tone={meta?.availability === 'warming_up' ? 'warn' : 'bad'} title="Database metrics unavailable">
          {meta?.error?.message || 'The Metrics API did not return usable measurements.'}
        </InlineNotice>
        <Panel><EmptyState title="No infrastructure values" description="Unavailable metrics are shown as unavailable, never as zero." icon={Server} /></Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle
          title="Database infrastructure"
          icon={Server}
          description="Live Prometheus-compatible Metrics API scrape. Percentages are calculated only from metrics with confirmed meanings and units."
          right={<StatusPill tone="ok" label={`${formatNumber(meta.seriesCount)} series`} />}
        />
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone="ok" label="Metrics API" />
          <StatusPill tone={meta.sampleWindowSeconds ? 'ok' : 'warn'} label={meta.sampleWindowSeconds ? `${meta.sampleWindowSeconds}s rate window` : 'First sample'} />
          <StatusPill tone="unknown" label="Historical trend requires external Prometheus" />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="CPU utilization" value={Number.isFinite(values.cpu?.value) ? formatPercent(values.cpu.value) : '—'} icon={Cpu} tone={!Number.isFinite(values.cpu?.value) ? 'unknown' : values.cpu.value >= 85 ? 'bad' : values.cpu.value >= 70 ? 'warn' : 'ok'} availability={metricAvailability(values.cpu)} note={values.cpu?.note || (values.cpu ? null : 'Metric unavailable from the current Supabase source.')}>
          <ProgressBar value={values.cpu?.value} />
        </MetricCard>
        <MetricCard title="Memory utilization" value={Number.isFinite(values.memory?.value) ? formatPercent(values.memory.value) : '—'} icon={MemoryStick} tone={!Number.isFinite(values.memory?.value) ? 'unknown' : values.memory.value >= 90 ? 'bad' : values.memory.value >= 75 ? 'warn' : 'ok'} availability={metricAvailability(values.memory)} subtitle={Number.isFinite(values.memory?.usedBytes) ? `${formatBytes(values.memory.usedBytes)} of ${formatBytes(values.memory.totalBytes)}` : null}>
          <ProgressBar value={values.memory?.value} />
        </MetricCard>
        <MetricCard title="Disk utilization" value={Number.isFinite(values.disk?.value) ? formatPercent(values.disk.value) : '—'} icon={HardDrive} tone={!Number.isFinite(values.disk?.value) ? 'unknown' : values.disk.value >= 90 ? 'bad' : values.disk.value >= 80 ? 'warn' : 'ok'} availability={metricAvailability(values.disk)} subtitle={Number.isFinite(values.disk?.usedBytes) ? `${formatBytes(values.disk.usedBytes)} of ${formatBytes(values.disk.totalBytes)}` : null}>
          <ProgressBar value={values.disk?.value} />
        </MetricCard>
        <MetricCard title="Connections" value={Number.isFinite(values.connections?.value) ? formatPercent(values.connections.value) : '—'} icon={Network} tone={!Number.isFinite(values.connections?.value) ? 'unknown' : values.connections.value >= 90 ? 'bad' : values.connections.value >= 75 ? 'warn' : 'ok'} availability={metricAvailability(values.connections)} subtitle={Number.isFinite(values.connections?.active) ? `${formatNumber(values.connections.active)} active of ${formatNumber(values.connections.limit)} allowed` : null}>
          <ProgressBar value={values.connections?.value} />
        </MetricCard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="WAL size" value={Number.isFinite(values.wal?.value) ? formatNumber(values.wal.value, { digits: 1 }) : '—'} unit="MB" icon={Database} tone="info" availability={metricAvailability(values.wal)} note={values.wal ? 'pg_wal_size_mb' : 'Metric unavailable from the current Supabase source.'} />
        <MetricCard title="Database size" value={Number.isFinite(values.database?.value) ? formatNumber(values.database.value, { digits: 1 }) : '—'} unit="MB" icon={Database} tone="info" availability={metricAvailability(values.database)} note={values.database ? 'pg_database_size_bytes converted to MB' : 'Metric unavailable from the current Supabase source.'} />
        <MetricCard title="Disk reads" value={Number.isFinite(values.diskReads?.value) ? formatNumber(values.diskReads.value, { digits: 1 }) : '—'} unit="ops/s" icon={HardDrive} tone="info" availability={metricAvailability(values.diskReads)} note={values.diskReads?.note} />
        <MetricCard title="Disk writes" value={Number.isFinite(values.diskWrites?.value) ? formatNumber(values.diskWrites.value, { digits: 1 }) : '—'} unit="ops/s" icon={HardDrive} tone="info" availability={metricAvailability(values.diskWrites)} note={values.diskWrites?.note} />
        <MetricCard title="Cache hit ratio" value={Number.isFinite(values.cacheHit?.value) ? formatPercent(values.cacheHit.value) : '—'} icon={ShieldCheck} tone={!Number.isFinite(values.cacheHit?.value) ? 'unknown' : values.cacheHit.value >= 95 ? 'ok' : 'warn'} availability={metricAvailability(values.cacheHit)} note={values.cacheHit ? 'blks_hit / (blks_hit + blks_read)' : 'Metric unavailable from the current Supabase source.'} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Transactions committed" value={Number.isFinite(values.commits?.value) ? formatNumber(values.commits.value, { digits: 2 }) : '—'} unit="/s" icon={Activity} tone="info" availability={metricAvailability(values.commits)} note={values.commits?.note || 'Counter rate from consecutive real samples.'} />
        <MetricCard title="Transactions rolled back" value={Number.isFinite(values.rollbacks?.value) ? formatNumber(values.rollbacks.value, { digits: 2 }) : '—'} unit="/s" icon={Activity} tone="info" availability={metricAvailability(values.rollbacks)} note={values.rollbacks?.note || 'Counter rate from consecutive real samples.'} />
        <MetricCard title="PostgreSQL scrape" value={values.postgresUp === 1 ? 'Up' : values.postgresUp === 0 ? 'Down' : '—'} icon={Database} tone={values.postgresUp === 1 ? 'ok' : values.postgresUp === 0 ? 'bad' : 'unknown'} availability={values.postgresUp === 1 || values.postgresUp === 0 ? 'available' : 'unavailable'} note="pg_up from the current metrics scrape." />
      </div>

      <Panel>
        <SectionTitle title="Metric interpretation" icon={Server} description="Why some values appear as unavailable or warming up." />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card-alt/40 p-3"><p className="text-[10px] font-black text-text">Counters vs gauges</p><p className="mt-1 text-[10px] font-medium leading-relaxed text-text-muted">CPU, disk I/O and transaction rates use counter deltas between two real scrapes. The first scrape cannot produce a valid percentage and is marked warming up.</p></div>
          <div className="rounded-xl border border-border bg-card-alt/40 p-3"><p className="text-[10px] font-black text-text">No fabricated history</p><p className="mt-1 text-[10px] font-medium leading-relaxed text-text-muted">A single Prometheus scrape is current data, not a historical time series. Long-term charts require a Prometheus-compatible history store.</p></div>
          <div className="rounded-xl border border-border bg-card-alt/40 p-3"><p className="text-[10px] font-black text-text">Units</p><p className="mt-1 text-[10px] font-medium leading-relaxed text-text-muted">Byte metrics are converted only where the metric name and unit are verified. API request counts are never presented as storage bytes.</p></div>
          <div className="rounded-xl border border-border bg-card-alt/40 p-3"><p className="text-[10px] font-black text-text">Missing series</p><p className="mt-1 text-[10px] font-medium leading-relaxed text-text-muted">Not every project exposes every series. Missing labels or series are shown as unavailable instead of being replaced with zero.</p></div>
        </div>
        <DataSourceNote>Source: Supabase Metrics API (Prometheus exposition format). Credentials remain server-side.</DataSourceNote>
      </Panel>

      {feed.errors.metrics ? <InlineNotice tone="warn" title="Metrics refresh issue">{feed.errors.metrics.message}</InlineNotice> : null}
    </div>
  );
}
