"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileJson,
  RefreshCw,
  Search,
  Terminal,
  X,
} from "lucide-react";
import {
  LOG_SOURCE_CHOICES,
  SEVERITY_CHOICES,
  formatTimestamp,
  redactSensitive,
  serviceLabel,
  statusTone,
} from "./client";
import {
  DataSourceNote,
  EmptyState,
  InlineNotice,
  LoadingBlock,
  Panel,
  SectionTitle,
  StatusPill,
} from "./MonitoringUi";
import { useLogsFeed } from "./useMonitoringData";

function statusLabel(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? String(value) : 'unknown';
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  const columns = ['timestamp', 'source', 'severity', 'status', 'message', 'request_id', 'trace_id'];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(redactSensitive(row[column]))).join(','))].join('\n');
}

export default function LogsPanel({ project, token, range, rangeLabel, autoRefresh = false }) {
  const [source, setSource] = useState('edge_logs');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('desc');
  const [limit, setLimit] = useState('50');
  const [selected, setSelected] = useState(null);
  const filters = useMemo(() => ({ source, severity, status, search, sort, limit }), [source, severity, status, search, sort, limit]);
  const feed = useLogsFeed({ project, range, token, active: true, filters, autoRefresh });
  const rows = feed.logs || [];

  const exportJson = () => {
    const sanitized = rows.map((row) => ({
      timestamp: row.timestamp,
      source: row.source,
      severity: row.severity_text,
      status: row.status,
      message: redactSensitive(row.event_message),
      request_id: row.request_id,
      trace_id: row.trace_id,
    }));
    downloadFile(`supabase-logs-${project.id}-${Date.now()}.json`, JSON.stringify(sanitized, null, 2), 'application/json');
  };
  const exportCsv = () => {
    const sanitized = rows.map((row) => ({
      timestamp: row.timestamp,
      source: row.source,
      severity: row.severity_text,
      status: row.status,
      message: redactSensitive(row.event_message),
      request_id: row.request_id,
      trace_id: row.trace_id,
    }));
    downloadFile(`supabase-logs-${project.id}-${Date.now()}.csv`, toCsv(sanitized), 'text/csv');
  };

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle
          title="Logs Explorer"
          icon={Terminal}
          description={`${rangeLabel} · queries are limited to 24-hour windows on the server and split automatically.`}
          right={<StatusPill tone={feed.meta?.availability === 'available' ? 'ok' : 'unknown'} label={`${rows.length} rows`} />}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-text-muted">Source</span>
            <select value={source} onChange={(event) => setSource(event.target.value)} className="min-h-9 w-full rounded-lg border border-border bg-background px-2 text-[11px] font-bold text-text outline-none focus:border-accent">
              {LOG_SOURCE_CHOICES.map((item) => <option key={item} value={item}>{serviceLabel(item)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-text-muted">Severity</span>
            <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="min-h-9 w-full rounded-lg border border-border bg-background px-2 text-[11px] font-bold text-text outline-none focus:border-accent">
              {SEVERITY_CHOICES.map((item) => <option key={item || 'all'} value={item}>{item || 'All severities'}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-text-muted">HTTP status</span>
            <input value={status} onChange={(event) => setStatus(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))} inputMode="numeric" placeholder="e.g. 500" className="min-h-9 w-full rounded-lg border border-border bg-background px-2 font-mono text-[11px] font-bold text-text outline-none focus:border-accent" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-text-muted">Search message, request ID or trace ID</span>
            <div className="flex gap-1.5">
              <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setSearch(searchDraft); }} placeholder="Search logs" className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[11px] font-semibold text-text outline-none focus:border-accent" />
              <button type="button" onClick={() => setSearch(searchDraft)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card-alt text-text-muted hover:text-accent" aria-label="Apply search"><Search size={14} /></button>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-text-muted">Sort / limit</span>
            <div className="flex gap-1.5">
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-1.5 text-[10px] font-bold text-text outline-none focus:border-accent">
                <option value="desc">Newest</option><option value="asc">Oldest</option>
              </select>
              <select value={limit} onChange={(event) => setLimit(event.target.value)} className="min-h-9 w-16 rounded-lg border border-border bg-background px-1.5 text-[10px] font-bold text-text outline-none focus:border-accent">
                {['25', '50', '100', '200'].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={feed.refresh} disabled={feed.loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[10px] font-black text-text hover:border-accent/60 disabled:opacity-50">
            <RefreshCw size={12} className={feed.loading ? 'animate-spin text-accent' : ''} /> Refresh logs
          </button>
          <button type="button" onClick={exportCsv} disabled={!rows.length} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[10px] font-black text-text hover:border-accent/60 disabled:opacity-50">
            <Download size={12} /> CSV
          </button>
          <button type="button" onClick={exportJson} disabled={!rows.length} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[10px] font-black text-text hover:border-accent/60 disabled:opacity-50">
            <FileJson size={12} /> JSON
          </button>
          {feed.meta?.windows ? <span className="text-[9px] font-bold uppercase tracking-wide text-text-muted">{feed.meta.windows} query window(s)</span> : null}
          {feed.meta?.truncated ? <StatusPill tone="warn" label="Truncated" /> : null}
        </div>
      </Panel>

      {feed.error ? <InlineNotice tone="bad" title="Log query issue">{feed.error.message}</InlineNotice> : null}
      {!project.configured.management ? <InlineNotice tone="warn" title="Logs are not configured">Add {project.envKeys.token} with Logs: Read permission to query real Supabase logs.</InlineNotice> : null}

      <Panel>
        {feed.loading && !rows.length ? <LoadingBlock label="Querying real Supabase logs" rows={6} /> : rows.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-[10px]">
                <thead>
                  <tr className="border-b border-border text-[9px] uppercase tracking-wide text-text-muted">
                    <th className="whitespace-nowrap px-2 py-2">Timestamp</th>
                    <th className="whitespace-nowrap px-2 py-2">Service</th>
                    <th className="whitespace-nowrap px-2 py-2">Severity</th>
                    <th className="whitespace-nowrap px-2 py-2">Status</th>
                    <th className="px-2 py-2">Message</th>
                    <th className="whitespace-nowrap px-2 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.id || index}-${row.timestamp}`} onClick={() => setSelected(row)} className="cursor-pointer border-b border-border/60 transition hover:bg-card-alt/50">
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-[9px] font-bold text-text-muted">{formatTimestamp(row.timestamp, { short: true })}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-black text-text">{serviceLabel(row.source)}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-bold capitalize text-text-muted">{row.severity_text || '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2"><StatusPill tone={statusTone(Number(row.status) >= 500 ? 'critical' : Number(row.status) >= 400 ? 'warning' : 'unknown')} label={statusLabel(row.status)} /></td>
                      <td className="max-w-[420px] px-2 py-2 font-medium text-text-muted"><span className="line-clamp-2 break-words">{redactSensitive(row.event_message) || 'No message'}</span></td>
                      <td className="whitespace-nowrap px-2 py-2"><button type="button" onClick={(event) => { event.stopPropagation(); setSelected(row); }} className="text-[9px] font-black text-accent hover:underline">Inspect</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {rows.map((row, index) => (
                <button key={`${row.id || index}-${row.timestamp}`} type="button" onClick={() => setSelected(row)} className="w-full min-w-0 rounded-xl border border-border bg-card-alt/40 p-3 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-text">{serviceLabel(row.source)}</span>
                    <StatusPill tone={statusTone(Number(row.status) >= 500 ? 'critical' : Number(row.status) >= 400 ? 'warning' : 'unknown')} label={statusLabel(row.status)} />
                  </div>
                  <p className="mt-1 line-clamp-3 break-words text-[10px] font-medium text-text-muted">{redactSensitive(row.event_message) || 'No message'}</p>
                  <p className="mt-1 font-mono text-[9px] font-bold text-text-muted">{formatTimestamp(row.timestamp, { short: true })} · {row.severity_text || 'unknown severity'}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title={feed.meta?.availability === 'no_data' ? 'No recorded events' : 'No logs loaded'} description={feed.meta?.availability === 'no_data' ? 'No matching log events were recorded for this source, filter, and range. Check retention before concluding there was no activity.' : 'Adjust filters or refresh to query the Supabase unified logs stream.'} icon={Terminal} />
        )}
        <DataSourceNote>Source: Management API unified logs (ClickHouse SQL). Queries use explicit UTC bounds, count() aggregation, bounded limits, and fixed server-side templates. Authentication headers, tokens, cookies, and passwords are never requested; displayed messages are additionally redacted.</DataSourceNote>
      </Panel>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Log details" onClick={() => setSelected(null)}>
          <div className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card p-4 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[.2em] text-accent">Log detail</p>
                <h3 className="mt-1 break-words text-base font-black text-text">{serviceLabel(selected.source)}</h3>
                <p className="mt-1 font-mono text-[10px] font-bold text-text-muted">{formatTimestamp(selected.timestamp)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close log details" className="shrink-0 rounded-lg border border-border p-2 text-text-muted hover:text-text"><X size={16} /></button>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <StatusPill tone={statusTone(Number(selected.status) >= 500 ? 'critical' : Number(selected.status) >= 400 ? 'warning' : 'unknown')} label={`HTTP ${statusLabel(selected.status)}`} />
              <StatusPill tone="unknown" label={selected.severity_text || 'unknown severity'} />
              <StatusPill tone="info" label={selected.source || 'unknown source'} />
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">Message</p>
                <pre className="mt-1 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-3 font-mono text-[10px] font-medium leading-relaxed text-text">{redactSensitive(selected.event_message) || 'No message'}</pre>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ['Request ID', selected.request_id],
                  ['Trace ID', selected.trace_id],
                  ['Method', selected.method],
                  ['Path', selected.path || selected.pathname],
                  ['Event ID', selected.id],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-card-alt/40 p-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">{label}</p>
                    <p className="mt-1 break-all font-mono text-[10px] font-bold text-text">{value || 'Not recorded'}</p>
                  </div>
                ))}
              </div>
              <InlineNotice tone="info" title="Redaction">Sensitive values in the message are redacted before display and export. Only selected log fields are requested from Supabase.</InlineNotice>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
