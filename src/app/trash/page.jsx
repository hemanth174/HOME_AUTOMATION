"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { wakeAutomationScheduler } from "@/lib/wakeAutomationScheduler";

const PAGE_SIZE = 100;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "board", label: "Rooms" },
  { key: "preset", label: "Presets" },
  { key: "automation", label: "Automations" },
  { key: "activity_log", label: "Activity" },
];
const TYPE_LABELS = { board: "Room and devices", preset: "Preset", schedule: "Schedule", alarm: "Alarm", activity_log: "Activity log" };

export default function TrashPage() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = "/login"; return; }
      setUser(data.user);
    });
  }, []);

  const loadItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: loadError } = await supabase.rpc("list_trash", { p_limit: PAGE_SIZE, p_offset: offset, p_filter: filter });
    setLoading(false);
    if (loadError) {
      setError(`Trash is unavailable: ${loadError.message}`);
      return;
    }
    setError("");
    setItems(Array.isArray(data) ? data : []);
  }, [user, offset, filter]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const restore = async (item) => {
    setBusy(item.id);
    setNotice("");
    const { data, error: restoreError } = await supabase.rpc("restore_from_trash", { p_kind: item.kind, p_id: item.id });
    setBusy(null);
    if (restoreError || !data) {
      setError(restoreError?.message || "This item could not be restored. Check whether its room is still in Trash.");
      return;
    }
    setError("");
    setNotice(`${TYPE_LABELS[item.kind]} restored.`);
    if (["board", "schedule", "alarm"].includes(item.kind)) void wakeAutomationScheduler();
    await loadItems();
  };

  const restoreAll = async () => {
    setBusy("all");
    setNotice("");
    const { data, error: restoreError } = await supabase.rpc("restore_all_trash");
    setBusy(null);
    if (restoreError) { setError(restoreError.message); return; }
    setError("");
    setNotice(`${data || 0} item${data === 1 ? "" : "s"} restored.`);
    void wakeAutomationScheduler();
    setOffset(0);
    if (offset === 0) await loadItems();
  };

  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 px-4 pb-24 pt-6 sm:px-6 md:pb-10 md:pt-8">
      <Link href="/" className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-(--pg-muted) hover:text-(--pg-brand)">
        <ArrowLeft size={16} aria-hidden="true" /> Dashboard
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-(--pg-line) pb-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-(--pg-ink) sm:text-3xl">
            <Trash2 size={26} className="text-(--pg-brand)" aria-hidden="true" /> Trash
          </h1>
          <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-(--pg-muted)">
            Deleted items stay here for 30 days, then are removed automatically. Restoring a room also restores its devices and their schedules and alarms.
          </p>
        </div>
        <button type="button" onClick={restoreAll} disabled={busy !== null || loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-(--pg-brand) px-4 text-sm font-bold text-(--pg-onbrand) transition-colors hover:bg-(--pg-brand-hover) disabled:cursor-not-allowed disabled:opacity-50">
          <RotateCcw size={16} aria-hidden="true" /> Restore all
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-(--pg-error-line) bg-(--pg-error-faint) p-3 text-sm text-(--pg-error)">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-(--pg-brand-line) bg-(--pg-brand-faint) p-3 text-sm text-(--pg-brand)">{notice}</p>}

      <div className="scrollbar-hide mt-6 flex gap-2 overflow-x-auto pb-2" aria-label="Trash filters">
        {FILTERS.map((option) => <button key={option.key} type="button" onClick={() => { setFilter(option.key); setOffset(0); }}
          aria-pressed={filter === option.key}
          className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-colors ${filter === option.key ? "border-(--pg-brand) bg-(--pg-brand) text-(--pg-onbrand)" : "border-(--pg-line) bg-(--pg-card) text-(--pg-ink) hover:border-(--pg-brand-line) hover:bg-(--pg-brand-faint)"}`}>
          {option.label}
        </button>)}
      </div>

      {loading ? <p className="py-14 text-center text-sm text-(--pg-muted)">Loading Trash…</p> :
        items.length === 0 ? <div className="mt-6 rounded-2xl border border-(--pg-line) bg-(--pg-card) px-6 py-14 text-center">
          <Trash2 size={26} className="mx-auto text-(--pg-muted)" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-extrabold text-(--pg-ink)">Nothing here</h2>
          <p className="mt-1 text-sm text-(--pg-muted)">{filter === "all" ? "Deleted items will appear here." : "No deleted items in this category."}</p>
        </div> : <ul className="mt-5 divide-y divide-(--pg-line) rounded-2xl border border-(--pg-line) bg-(--pg-card) px-4 sm:px-5">
          {items.map((item) => {
            const deletedAt = new Date(item.deleted_at);
            const expiresAt = new Date(deletedAt.getTime() + RETENTION_MS);
            const expired = expiresAt.getTime() <= Date.now();
            return <li key={`${item.kind}-${item.id}`} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
              <div className="min-w-0">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-(--pg-muted)">{TYPE_LABELS[item.kind] || item.kind}</span>
                <h2 className="mt-1 break-words text-sm font-extrabold text-(--pg-ink) sm:text-base">{item.title}</h2>
                <p className="mt-1 text-xs text-(--pg-muted)">
                  Deleted {deletedAt.toLocaleString()} · {expired ? "Awaiting cleanup" : `Restorable until ${expiresAt.toLocaleDateString()}`}
                </p>
              </div>
              <button type="button" onClick={() => restore(item)} disabled={busy !== null || expired}
                className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-(--pg-line) px-4 text-sm font-bold text-(--pg-ink) transition-colors hover:border-(--pg-brand-line) hover:bg-(--pg-brand-faint) disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                <RotateCcw size={16} aria-hidden="true" /> Restore
              </button>
            </li>;
          })}
        </ul>}

      {(offset > 0 || items.length === PAGE_SIZE) && <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
          className="min-h-11 rounded-xl border border-(--pg-line) px-4 text-sm font-bold text-(--pg-ink) disabled:opacity-50">Previous</button>
        <span className="text-xs text-(--pg-muted)">Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
        <button type="button" disabled={items.length < PAGE_SIZE || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)}
          className="min-h-11 rounded-xl border border-(--pg-line) px-4 text-sm font-bold text-(--pg-ink) disabled:opacity-50">Next</button>
      </div>}
    </main>
  );
}
