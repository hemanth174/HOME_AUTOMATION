"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Power, PowerOff, SlidersHorizontal, Trash2 } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";

export default function QuickPresets({ presets, isPresetActive, applyPreset, deletePreset, pending = {} }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const stripRef = useRef(null);

  if (!presets?.length) return null;

  const scrollPreset = (direction) => {
    const strip = stripRef.current;
    const card = strip?.querySelector("article");
    if (!strip || !card) return;
    strip.scrollBy({ left: direction * (card.getBoundingClientRect().width + 12), behavior: "smooth" });
  };

  const updateVisibleIndex = () => {
    const strip = stripRef.current;
    const card = strip?.querySelector("article");
    if (!strip || !card) return;
    const step = card.getBoundingClientRect().width + 12;
    setVisibleIndex(Math.min(presets.length - 1, Math.max(0, Math.round(strip.scrollLeft / step))));
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const moved = await deletePreset(pendingDelete.id);
      if (moved) {
        setPendingDelete(null);
        setVisibleIndex((index) => Math.max(0, Math.min(index, presets.length - 2)));
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <section data-tour="presets" aria-label="Quick presets" className="quick-presets-section w-full min-w-0 max-w-full">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-(--pg-muted)">Quick Presets</h2>
            <span className="rounded-full bg-(--pg-faint) px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-(--pg-muted)">{presets.length}</span>
          </div>
          {presets.length > 1 && (
            <div className="flex items-center gap-1 lg:hidden">
              <span className="mr-1 text-[10px] font-semibold tabular-nums text-(--pg-muted)">{visibleIndex + 1}/{presets.length}</span>
              <button type="button" onClick={() => scrollPreset(-1)} disabled={visibleIndex === 0} aria-label="Previous preset" className="flex h-8 w-8 items-center justify-center rounded-full border border-(--pg-line) text-(--pg-ink) transition-colors hover:border-(--pg-brand-line) hover:bg-(--pg-brand-faint) hover:text-(--pg-brand) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-brand) disabled:opacity-35"><ChevronLeft size={14} /></button>
              <button type="button" onClick={() => scrollPreset(1)} disabled={visibleIndex >= presets.length - 1} aria-label="Next preset" className="flex h-8 w-8 items-center justify-center rounded-full border border-(--pg-line) text-(--pg-ink) transition-colors hover:border-(--pg-brand-line) hover:bg-(--pg-brand-faint) hover:text-(--pg-brand) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-brand) disabled:opacity-35"><ChevronRight size={14} /></button>
            </div>
          )}
        </div>

        <div ref={stripRef} onScroll={updateVisibleIndex} className="scrollbar-hide flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth scroll-px-1 px-1 pb-2 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0 lg:snap-none">
          {presets.map((preset) => {
            const active = isPresetActive(preset);
            const busy = preset.actions?.some((action) => pending[action.device_id]);
            return (
              <article key={preset.id} className={`flex w-[min(76vw,260px)] shrink-0 snap-start items-center gap-2 rounded-xl border border-(--pg-line) bg-(--pg-card) p-3 shadow-sm lg:w-full lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:px-2 lg:py-3 lg:shadow-none lg:last:border-b-0 ${active ? "border-(--pg-brand-line)" : ""}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${active ? "bg-(--pg-brand-faint) text-(--pg-brand)" : "bg-(--pg-faint) text-(--pg-muted)"}`}><SlidersHorizontal size={13} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-extrabold text-(--pg-ink)" title={preset.name}>{preset.name}</strong>
                  <span className="text-[11px] font-semibold text-(--pg-muted)">{preset.actions?.length || 0} device{preset.actions?.length === 1 ? "" : "s"}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => applyPreset(preset, active)} disabled={busy} aria-busy={busy} aria-label={`${active ? "Turn off" : "Apply"} ${preset.name}`} title={active ? "Turn off preset" : "Apply preset"} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--pg-brand-line) bg-(--pg-brand-faint) text-(--pg-brand) transition-colors hover:bg-(--pg-brand) hover:text-(--pg-onbrand) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-brand) disabled:cursor-wait disabled:opacity-60 lg:h-8 lg:w-8">
                    {busy ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : active ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>
                  <button type="button" onClick={() => setPendingDelete(preset)} disabled={busy} aria-label={`Delete ${preset.name}`} title="Delete preset" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-(--pg-error) transition-colors hover:bg-(--pg-error-faint) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-error) disabled:opacity-50 lg:h-8 lg:w-8"><Trash2 size={14} /></button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete this preset?"
        description={`“${pendingDelete?.name || "This preset"}” will move to Trash. You can restore it within 30 days.`}
        confirmLabel="Move to Trash"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
