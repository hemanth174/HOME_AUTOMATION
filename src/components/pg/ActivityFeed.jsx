'use client';

import Link from 'next/link';
import { History } from 'lucide-react';

function fmtTime(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * Recent Activity: actual rows from activity_logs with room names resolved
 * through devices→boards. Empty when the user has no logged events.
 */
export default function ActivityFeed({ logs, deviceRoom }) {
  const items = (logs || []).slice(0, 8);

  return (
    <section aria-label="Recent activity" className="rounded-2xl border border-(--pg-line) bg-(--pg-card) p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-(--pg-ink)">Recent Activity</h2>
          <p className="text-[11px] font-semibold text-(--pg-muted) mt-0.5">
            Real device events with room and time
          </p>
        </div>
        <Link
          href="/logs"
          className="shrink-0 min-h-[36px] inline-flex items-center px-3.5 rounded-xl border border-(--pg-line) text-xs font-extrabold text-(--pg-brand) hover:border-(--pg-brand-line) hover:bg-(--pg-brand-ghost) transition-all"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
          <span className="w-10 h-10 rounded-xl bg-(--pg-faint) text-(--pg-brand) flex items-center justify-center">
            <History size={18} strokeWidth={2.5} />
          </span>
          <p className="text-sm font-bold text-(--pg-ink)">No activity yet</p>
          <p className="text-xs font-medium text-(--pg-muted) max-w-[280px] leading-relaxed">
            Toggle a device or run a preset and the event will appear here with its room and timestamp.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col max-h-[320px] overflow-y-auto pr-1 -mr-1">
          {items.map((log, index) => {
            const on = /on/i.test(log.action || '') && !/off/i.test(log.action || '');
            return (
                <li
                key={`${log.id || log.created_at || 'activity'}-${index}`}
                className="flex items-center gap-3 py-2.5 border-b border-(--pg-line) last:border-0"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${on ? 'bg-(--pg-success)' : 'bg-(--pg-track-hover)'}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-bold text-(--pg-ink)">
                    {log.device_name || 'Device'}
                    <span className="font-semibold text-(--pg-muted)">
                      {' '}· {deviceRoom?.(log) || 'Room'}
                    </span>
                  </p>
                  <p className="truncate text-[11px] font-medium text-(--pg-muted) mt-0.5">
                    {log.triggered_by || 'Manual'} · {fmtTime(log.created_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-lg border ${
                    on
                      ? 'text-(--pg-success) bg-(--pg-brand-faint) border-(--pg-brand-soft)'
                      : 'text-(--pg-muted) bg-black/[0.04] border-(--pg-line)'
                  }`}
                >
                  {on ? 'ON' : 'OFF'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
