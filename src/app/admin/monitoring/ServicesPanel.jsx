"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Database,
  HardDrive,
  KeyRound,
  Radio,
  Server,
  Zap,
} from "lucide-react";
import {
  formatDuration,
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
  LoadingBlock,
  Panel,
  ProgressBar,
  SectionTitle,
  StatusPill,
} from "./MonitoringUi";
import { useFunctionsFeed } from "./useMonitoringData";

const SERVICE_TABS = [
  { key: 'edge_logs', label: 'API Gateway', icon: Activity },
  { key: 'auth_logs', label: 'Auth', icon: KeyRound },
  { key: 'function_edge_logs', label: 'Edge Functions', icon: Zap },
  { key: 'postgres_logs', label: 'PostgreSQL', icon: Database },
  { key: 'realtime_logs', label: 'Realtime', icon: Radio },
  { key: 'storage_logs', label: 'Storage', icon: HardDrive },
];

function validResponses(row) {
  return (row?.success || 0) + (row?.client_errors || 0) + (row?.server_errors || 0);
}

function functionColumns(rows) {
  const keys = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    Object.keys(row).slice(0, 10).forEach((key) => keys.add(key));
    if (keys.size >= 8) break;
  }
  return Array.from(keys).slice(0, 8);
}

function FunctionsSection({ project, range, token, managementConfigured }) {
  const feed = useFunctionsFeed({ project, range, token, active: Boolean(managementConfigured) });
  const columns = functionColumns(feed.stats);
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-card-alt/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-wide text-text-muted">Function selection</span>
        <select
          value={feed.functionId}
          onChange={(event) => feed.setFunctionId(event.target.value)}
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[11px] font-bold text-text outline-none focus:border-accent"
          aria-label="Select Edge Function"
        >
          <option value="">{feed.functions.length ? 'Select a function' : 'No functions discovered'}</option>
          {feed.functions.map((item) => (
            <option key={item.id} value={item.id}>{item.name || item.slug} ({item.status})</option>
          ))}
        </select>
      </div>
      {feed.loading ? <LoadingBlock label="Loading Edge Function statistics" rows={2} /> : null}
      {feed.error ? <InlineNotice tone="warn" title="Function discovery issue">{feed.error.message}</InlineNotice> : null}
      {feed.statsError ? <InlineNotice tone="warn" title="Function statistics unavailable">{feed.statsError.message}</InlineNotice> : null}
      {!managementConfigured ? <p className="text-[10px] font-semibold text-text-muted">Function discovery requires the Management API token.</p> : null}
      {feed.functions.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[10px]">
            <thead><tr className="text-[9px] uppercase tracking-wide text-text-muted"><th className="px-2 py-1">Function</th><th className="px-2 py-1">Status</th><th className="px-2 py-1">Version</th><th className="px-2 py-1">Updated</th></tr></thead>
            <tbody>
              {feed.functions.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-2 py-1.5 font-black text-text">{item.name || item.slug}</td>
                  <td className="px-2 py-1.5 font-semibold text-text-muted">{item.status || '—'}</td>
                  <td className="px-2 py-1.5 font-semibold text-text-muted">{item.version ?? '—'}</td>
                  <td className="px-2 py-1.5 font-semibold text-text-muted">{formatTimestamp(item.updatedAt, { short: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {columns.length ? (
        <div className="overflow-x-auto">
          <p className="mb-1 text-[9px] font-black uppercase tracking-wide text-text-muted">Provider response fields ({feed.interval} interval)</p>
          <table className="min-w-full text-left text-[10px]">
            <thead><tr className="text-[9px] uppercase tracking-wide text-text-muted">{columns.map((key) => <th key={key} className="px-2 py-1">{key}</th>)}</tr></thead>
            <tbody>
              {(feed.stats || []).slice(0, 40).map((row, index) => (
                <tr key={index} className="border-t border-border">
                  {columns.map((key) => <td key={key} className="max-w-[180px] truncate px-2 py-1.5 font-semibold text-text-muted">{typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function ServicesPanel({ project, feed, token, range, rangeLabel }) {
  const [selected, setSelected] = useState('edge_logs');
  const summary = feed.services?.summary || feed.overview?.services?.summary || {};
  const row = summary[selected];
  const valid = validResponses(row);
  const success = valid > 0 ? ((row?.success || 0) / valid) * 100 : null;
  const failures = (feed.services?.failures || []).filter((item) => item.source === selected);
  const paths = (feed.services?.paths || []).filter((item) => item.source === selected).slice(0, 8);
  const methods = (feed.services?.methods || []).filter((item) => item.source === selected);
  const methodTotal = useMemo(() => methods.reduce((total, item) => total + (Number(item.events) || 0), 0), [methods]);

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle
          title="Service analytics"
          icon={Server}
          description={`${rangeLabel} · Logs API ${feed.services?.windows ?? 0} window(s) combined where the range exceeds 24 hours.`}
          right={<StatusPill tone={feed.services?.summary ? 'ok' : 'unknown'} label={feed.services?.summary ? 'Live logs' : 'Unavailable'} />}
        />
        <div className="flex flex-wrap gap-1.5">
          {SERVICE_TABS.map((tab) => {
            const Icon = tab.icon;
            const counts = summary[tab.key];
            const tone = tab.key === selected ? 'border-accent/50 bg-accent-bg text-accent' : 'border-border bg-card-alt/50 text-text-muted hover:text-text';
            return (
              <button key={tab.key} type="button" onClick={() => setSelected(tab.key)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black transition ${tone}`}>
                <Icon size={13} />
                {tab.label}
                <span className="rounded-full bg-card px-1.5 py-0.5 text-[9px]">{formatNumber(counts?.events ?? 0)}</span>
              </button>
            );
          })}
        </div>
        {feed.services?.note ? <div className="mt-3"><InlineNotice tone="info" title="Range note">{feed.services.note}</InlineNotice></div> : null}
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Observed events</p>
          <p className="mt-2 text-2xl font-black text-text">{row ? formatNumber(row.events) : '—'}</p>
          <p className="mt-1 text-[10px] font-semibold text-text-muted">{serviceLabel(selected)} log events</p>
        </Panel>
        <Panel>
          <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Success rate</p>
          <p className="mt-2 text-2xl font-black text-text">{success !== null ? formatPercent(success) : '—'}</p>
          <p className="mt-1 text-[10px] font-semibold text-text-muted">{valid > 0 ? `${formatNumber(valid)} valid status responses` : 'No valid HTTP status codes recorded'}</p>
        </Panel>
        <Panel>
          <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">4xx / 5xx</p>
          <p className="mt-2 text-2xl font-black text-text">{row ? `${formatNumber(row.client_errors)} / ${formatNumber(row.server_errors)}` : '—'}</p>
          <div className="mt-2 flex gap-1"><StatusPill tone={row?.client_errors ? 'warn' : 'unknown'} label="Client" /><StatusPill tone={row?.server_errors ? 'bad' : 'unknown'} label="Server" /></div>
        </Panel>
        <Panel>
          <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Errors / warnings</p>
          <p className="mt-2 text-2xl font-black text-text">{row ? `${formatNumber(row.error_events)} / ${formatNumber(row.warning_events)}` : '—'}</p>
          <p className="mt-1 text-[10px] font-semibold text-text-muted">{row?.avg_execution_ms ? `Avg execution ${formatDuration(row.avg_execution_ms)}` : 'Severity-based counts'}</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <SectionTitle title="Status distribution" icon={Activity} description="Valid recorded HTTP statuses only. Missing statuses remain unknown." />
          {row ? (
            <div className="space-y-2">
              {[
                { key: 'success', label: '2xx / 3xx', value: row.success, tone: 'ok' },
                { key: 'client', label: '4xx client errors', value: row.client_errors, tone: 'warn' },
                { key: 'server', label: '5xx server errors', value: row.server_errors, tone: 'bad' },
                { key: 'unknown', label: 'Unknown / missing status', value: row.unknown_status, tone: 'unknown' },
              ].map((item) => (
                <div key={item.key}>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-text-muted"><span>{item.label}</span><span>{formatNumber(item.value)}</span></div>
                  <ProgressBar value={row.events > 0 ? ((Number(item.value) || 0) / row.events) * 100 : 0} tone={item.tone} />
                </div>
              ))}
            </div>
          ) : <EmptyState title="No service records" description="No matching log events were returned for this source and range." />}
        </Panel>

        <Panel>
          <SectionTitle title="HTTP methods" icon={Activity} description={methodTotal ? `${formatNumber(methodTotal)} requests with a recorded method.` : 'Method fields are only present on HTTP sources.'} />
          {methods.length ? (
            <div className="space-y-2">
              {methods.slice(0, 8).map((item) => (
                <div key={`${item.source}-${item.method}`}>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-text-muted"><span className="font-mono">{item.method}</span><span>{formatNumber(item.events)}</span></div>
                  <ProgressBar value={methodTotal ? (item.events / methodTotal) * 100 : 0} tone="info" />
                </div>
              ))}
            </div>
          ) : <EmptyState title="No method data" description="No request method fields were recorded for this source." />}
        </Panel>

        <Panel>
          <SectionTitle title="Top requested paths" icon={Server} description="Sanitized path values from the log stream. Query strings are not requested." />
          {paths.length ? (
            <div className="space-y-2">
              {paths.map((item) => (
                <div key={`${item.source}-${item.path}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card-alt/40 px-2.5 py-2">
                  <span className="min-w-0 truncate font-mono text-[10px] font-bold text-text">{item.path}</span>
                  <span className="shrink-0 text-[10px] font-black text-text-muted">{formatNumber(item.events)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No path data" description="No request paths were recorded for this source." />}
        </Panel>

        <Panel>
          <SectionTitle title="Recent failures" icon={AlertTriangle} description="Most recent 4xx/5xx events for this service." />
          {failures.length ? (
            <div className="space-y-2">
              {failures.slice(0, 8).map((item, index) => (
                <div key={`${item.id || index}-${item.timestamp}`} className="rounded-lg border border-border bg-card-alt/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <StatusPill tone={statusTone(Number(item.status) >= 500 ? 'critical' : 'warning')} label={String(item.status || 'unknown')} />
                    <span className="text-[9px] font-bold text-text-muted">{formatTimestamp(item.timestamp, { short: true })}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 break-words text-[10px] font-medium text-text-muted">{item.event_message || 'No message'}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No recent failures" description="No 4xx/5xx events were returned for this service." />}
        </Panel>
      </div>

      {selected === 'function_edge_logs' ? <FunctionsSection project={project} range={range} token={token} managementConfigured={project.configured.management} /> : null}

      <DataSourceNote>Source: Management API unified logs, ClickHouse SQL. Edge Function HTTP invocations come from function_edge_logs; console output comes from function_logs. They are not added together.</DataSourceNote>
      {feed.errors.services ? <InlineNotice tone="bad" title="Service logs unavailable">{feed.errors.services.message}</InlineNotice> : null}
    </div>
  );
}
