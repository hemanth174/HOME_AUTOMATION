"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Power, ShieldAlert, X } from "lucide-react";
import { createPortal } from "react-dom";

function actionIcon(kind) {
  if (kind === "firmware") return Download;
  if (kind === "revoke") return ShieldAlert;
  return Power;
}

export default function AdminConfirmDrawer({ confirmation, busy, onCancel, onConfirm }) {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(null);

  useEffect(() => {
    if (!confirmation || busy) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmation, busy, onCancel]);

  useEffect(() => {
    setDragOffset(0);
    setDragging(false);
    dragStartY.current = null;
  }, [confirmation]);

  const startDrag = (event) => {
    if (busy) return;
    dragStartY.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const moveDrag = (event) => {
    if (dragStartY.current === null) return;
    const offset = Math.max(0, event.clientY - dragStartY.current);
    setDragOffset(Math.min(offset, window.innerHeight * 0.8));
  };

  const finishDrag = (event) => {
    if (dragStartY.current === null) return;
    const offset = Math.max(0, event.clientY - dragStartY.current);
    dragStartY.current = null;
    setDragging(false);
    if (offset > 96 && !busy) {
      onCancel?.();
      return;
    }
    setDragOffset(0);
  };

  if (typeof document === "undefined" || !confirmation) return null;

  const Icon = actionIcon(confirmation.kind);
  const danger = confirmation.tone === "danger";

  return createPortal(
    <div
      className="fixed inset-0 z-[2100] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-stretch md:justify-end"
      onClick={() => {
        if (!busy) onCancel?.();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(.22,1,.36,1)",
        }}
        className="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[24px] border border-border bg-card shadow-2xl md:h-full md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-r-0"
      >
        <div
          role="presentation"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          className="mx-auto mt-2.5 flex h-7 w-20 shrink-0 cursor-grab touch-none items-start justify-center active:cursor-grabbing md:hidden"
          aria-label="Drag down to close confirmation"
        >
          <span className="mt-1.5 h-1 w-12 rounded-full bg-border" />
        </div>

        <header className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + (danger ? "bg-red-400/10 text-red-500" : "bg-accent/10 text-accent")}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Confirm action</p>
              <h2 id="admin-confirm-title" className="mt-1 break-words text-lg font-black">{confirmation.title}</h2>
              <p className="mt-1 break-words text-xs font-semibold text-text-muted">{confirmation.deviceName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close confirmation"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <p className="rounded-xl border border-border bg-background p-3 text-sm font-semibold leading-6 text-text-muted">
            {confirmation.message}
          </p>
        </div>

        <footer className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-xs font-black disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={"inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black text-[var(--btn-text)] disabled:opacity-50 " + (danger ? "bg-red-500 hover:brightness-105" : "bg-accent hover:brightness-105")}
            >
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : null}
              {busy ? "Working…" : confirmation.confirmLabel}
            </button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body
  );
}
