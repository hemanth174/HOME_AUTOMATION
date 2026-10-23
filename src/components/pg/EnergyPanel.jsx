'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Zap } from 'lucide-react';

const RANGES = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
];

function fmtDay(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

/**
 * Energy Usage panel. Daily bars come from the stored daily_analytics
 * rollups (same source as /analytics); weekly/monthly are sums of those
 * stored days. No stored history → honest unavailable state, never
 * fabricated readings. All values are estimates (see /analytics method).
 */
export default function EnergyPanel({ dailyRows }) {
  const [range, setRange] = useState('day');

  const data = useMemo(() => {
    const rows = [...(dailyRows || [])].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    if (range === 'day') {
      return rows.slice(-7).map((r) => ({
        name: fmtDay(r.date),
        kwh: Number(r.total_kwh || 0),
      }));
    }
    if (range === 'week') {
      const out = [];
      for (let i = 0; i < 4; i++) {
        const chunk = rows.slice(-(i + 1) * 7, rows.length - i * 7 || undefined);
        if (chunk.length === 0) break;
        const sum = chunk.reduce((s, r) => s + Number(r.total_kwh || 0), 0);
        out.unshift({ name: `W-${4 - i}`, kwh: sum });
      }
      return out.filter((d) => d.kwh > 0 || out.length === 1);
    }
    const byMonth = new Map();
    rows.slice(-180).forEach((r) => {
      const k = String(r.date).slice(0, 7);
      byMonth.set(k, (byMonth.get(k) || 0) + Number(r.total_kwh || 0));
    });
    return [...byMonth.entries()].slice(-6).map(([k, kwh]) => ({ name: k.slice(5), kwh }));
  }, [dailyRows, range]);

  const hasData = data.some((d) => d.kwh > 0);

  return (
    <section aria-label="Energy usage" className="rounded-2xl border border-(--pg-line) bg-(--pg-card) p-4 sm:p-5 h-full">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-(--pg-ink)">Energy Usage</h2>
          <p className="text-[11px] font-semibold text-(--pg-muted) mt-0.5">
            Estimated from device activity · kWh
          </p>
        </div>
        <div className="flex rounded-xl border border-(--pg-line) bg-(--pg-faint) p-0.5" role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`min-h-[32px] px-3 rounded-[10px] text-[11px] font-extrabold transition-all cursor-pointer ${
                range === r.key ? 'bg-(--pg-card) text-(--pg-deep) shadow-sm border border-(--pg-line)' : 'text-(--pg-muted) hover:text-(--pg-ink)'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center text-center py-10 gap-2">
          <span className="w-10 h-10 rounded-xl bg-(--pg-faint) text-(--pg-brand) flex items-center justify-center">
            <Zap size={18} strokeWidth={2.5} />
          </span>
          <p className="text-sm font-bold text-(--pg-ink)">No energy history yet</p>
          <p className="text-xs font-medium text-(--pg-muted) max-w-[260px] leading-relaxed">
            Usage history appears here once devices run and daily summaries are stored.
            See full estimates on the Energy page.
          </p>
        </div>
      ) : (
        <div className="h-[220px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="pgKwh" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--pg-brand)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--pg-brand)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--pg-line)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--pg-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--pg-muted)' }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-card-alt)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px' }}
                labelStyle={{ color: 'var(--text)', fontSize: '11px', fontWeight: 'bold' }}
                itemStyle={{ color: '#ffffff', fontSize: '11px', fontWeight: '600' }}
                formatter={(v) => [`${Number(v).toFixed(3)} kWh`, 'Usage']}
              />
              <Area type="monotone" dataKey="kwh" stroke="var(--pg-brand)" strokeWidth={2.5} fill="url(#pgKwh)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
