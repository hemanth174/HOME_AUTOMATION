"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';

const TONES = {
  ok: { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-500' },
  warn: { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', bar: 'bg-amber-500' },
  bad: { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', bar: 'bg-red-500' },
  info: { text: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/30', bar: 'bg-sky-500' },
  unknown: { text: 'text-text-muted', bg: 'bg-card-alt', border: 'border-border', bar: 'bg-text-muted' },
};

export function toneClass(tone) {
  return TONES[tone] || TONES.unknown;
}

export function Panel({ children, className = '' }) {
  return <section className={`min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 ${className}`}>{children}</section>;
}

export function SectionTitle({ title, description, right, icon: Icon }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon ? <Icon size={15} className="text-accent" /> : null}
          <h3 className="text-[11px] font-black uppercase tracking-[.16em] text-text">{title}</h3>
        </div>
        {description ? <p className="mt-1 text-[11px] font-medium leading-relaxed text-text-muted">{description}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function StatusPill({ tone = 'unknown', label, className = '' }) {
  const style = toneClass(tone);
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${style.border} ${style.bg} ${style.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.bar}`} />
      {label}
    </span>
  );
}

export function MetricCard({ title, value, unit, subtitle, note, tone = 'unknown', icon: Icon, availability, updatedAt, children }) {
  const style = toneClass(tone);
  const unavailable = availability === 'unavailable' || availability === 'unconfigured' || value === '—' || value === null || value === undefined;
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[.16em] text-text-muted">{title}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-1">
            <span className={`text-2xl font-black tracking-tight ${unavailable ? 'text-text-muted' : 'text-text'}`}>{value ?? '—'}</span>
            {unit && !unavailable ? <span className="text-[11px] font-bold text-text-muted">{unit}</span> : null}
          </div>
        </div>
        {Icon ? (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${style.border} ${style.bg} ${style.text}`}>
            <Icon size={16} />
          </span>
        ) : null}
      </div>
      {subtitle ? <p className="mt-2 text-[11px] font-semibold leading-relaxed text-text-muted">{subtitle}</p> : null}
      {children}
      {note ? <p className="mt-2 text-[10px] font-medium leading-relaxed text-text-muted">{note}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-wide text-text-muted">
        <span>{availability === 'unconfigured' ? 'Not configured' : availability === 'warming_up' ? 'Warming up' : availability === 'no_data' ? 'No recorded data' : availability === 'unavailable' ? 'Unavailable' : ''}</span>
        {updatedAt ? <span>{updatedAt}</span> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'info', label }) {
  const pct = Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : null;
  const style = toneClass(pct === null ? 'unknown' : pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : tone);
  return (
    <div className="mt-3">
      {label ? <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-text-muted"><span>{label}</span><span>{pct === null ? '—' : `${pct.toFixed(1)}%`}</span></div> : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-alt">
        <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

export function InlineNotice({ tone = 'info', title, children, action, icon: Icon }) {
  const style = toneClass(tone);
  const Fallback = tone === 'bad' ? ShieldAlert : tone === 'warn' ? AlertTriangle : Info;
  const IconComponent = Icon || Fallback;
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${style.border} ${style.bg}`}>
      <IconComponent size={16} className={`mt-0.5 shrink-0 ${style.text}`} />
      <div className="min-w-0 flex-1">
        {title ? <p className={`text-[11px] font-black ${style.text}`}>{title}</p> : null}
        <div className="mt-0.5 break-words text-[11px] font-medium leading-relaxed text-text-muted">{children}</div>
      </div>
      {action}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading monitoring data', rows = 3 }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-bold text-text-muted">
        <LoaderCircle size={14} className="animate-spin text-accent" />
        {label}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-xl border border-border bg-card-alt/60" />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon = CircleDashed, action }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card-alt/30 p-6 text-center">
      <Icon size={22} className="text-text-muted" />
      <p className="mt-2 text-xs font-black text-text">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[11px] font-medium leading-relaxed text-text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function DataSourceNote({ children }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[10px] font-medium leading-relaxed text-text-muted">
      <Info size={11} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function LiveBadge({ status, autoRefresh }) {
  const connected = status === 'SUBSCRIBED' || status === 'CONNECTED';
  const configure = status === 'NOT_CONFIGURED';
  const tone = connected ? 'ok' : configure ? 'unknown' : status === 'IDLE' ? 'unknown' : 'warn';
  const label = connected ? 'Live' : configure ? 'Auto-refresh' : status === 'IDLE' ? 'Starting' : status;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-text-muted">
      {connected ? <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span> : tone === 'warn' ? <WifiOff size={10} /> : <RefreshCw size={10} className={autoRefresh ? 'animate-spin' : ''} />}
      {label}
    </span>
  );
}

export function StatusIcon({ tone }) {
  if (tone === 'ok') return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (tone === 'bad') return <ShieldAlert size={14} className="text-red-500" />;
  if (tone === 'warn') return <AlertTriangle size={14} className="text-amber-500" />;
  return <CircleDashed size={14} className="text-text-muted" />;
}
