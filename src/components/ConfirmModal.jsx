"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ConfirmModal({
  open,
  title = "Delete this item?",
  description = "This action cannot be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm max-md:items-end max-md:p-0"
      onClick={() => {
        if (!busy) onCancel?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-description"
        className="flex w-[min(100%,380px)] flex-col gap-4 rounded-[20px] border border-border bg-card p-5 shadow-2xl max-md:w-full max-md:rounded-b-none max-md:rounded-t-[24px] max-md:p-6 max-md:pb-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div data-sheet-handle="1" className="hidden max-md:block w-12 h-1 cursor-grab touch-none bg-border rounded-full mx-auto -mt-1 mb-1 shrink-0 active:cursor-grabbing" />
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-500">
            <AlertTriangle size={20} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h3 id="confirm-modal-title" className="text-base font-extrabold tracking-tight text-text">
              {title}
            </h3>
            <p id="confirm-modal-description" className="mt-1 text-xs font-semibold leading-relaxed text-text-muted">
              {description}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-sheet-close="1"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-extrabold text-text transition hover:bg-card-alt disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-red-600 px-5 text-xs font-extrabold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
