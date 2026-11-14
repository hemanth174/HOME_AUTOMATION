"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, MapPin, Phone, User, X } from "lucide-react";

export default function AdminOrderDrawer({
  order,
  stages,
  categoryLabels,
  stageColors,
  onClose,
  onStage,
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const copyAddress = () => {
    if (!order.address) return;
    navigator.clipboard?.writeText(order.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl animate-fade-in"
      >
        {/* Drawer Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div className="min-w-0">
            <span className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 font-mono text-xs font-black text-cyan-400">
              {order.order_id}
            </span>
            <h2 className="mt-2 truncate text-xl font-black text-text sm:text-2xl">
              {order.full_name || "Customer Project"}
            </h2>
            <p className="mt-0.5 truncate font-mono text-xs font-medium text-text-muted">
              {order.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-xl border border-border p-2 text-text-muted transition hover:border-accent hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          {/* Stage Progression Selector */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">
                Advance Project Stage
              </p>
              <span className="text-[10px] font-bold text-text-muted">Customer notified on change</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {stages.map((stage) => {
                const isActive = order.status === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    disabled={isActive}
                    onClick={() => onStage(order.order_id, stage)}
                    className={`flex min-h-12 items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs font-black transition-all ${
                      isActive
                        ? "border-accent bg-accent/15 text-accent shadow-sm"
                        : "border-border bg-background text-text-muted hover:border-accent/60 hover:text-text"
                    }`}
                  >
                    <span>{stage}</span>
                    {isActive && <Check size={16} className="text-accent" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer & Project Details */}
          <div className="rounded-2xl border border-border bg-background/80 p-4 sm:p-5">
            <h3 className="text-[10px] font-black uppercase tracking-[.2em] text-text-muted">
              Customer & Inquired Details
            </h3>

            <div className="mt-4 space-y-3.5 text-xs">
              {/* Phone */}
              <div className="flex items-start gap-3">
                <Phone size={15} className="mt-0.5 shrink-0 text-text-muted" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone Number</p>
                  {order.phone ? (
                    <a
                      href={`tel:${order.phone}`}
                      className="font-mono font-bold text-accent hover:underline"
                    >
                      {order.phone}
                    </a>
                  ) : (
                    <p className="font-semibold text-text-muted">—</p>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="flex items-start gap-3">
                <User size={15} className="mt-0.5 shrink-0 text-text-muted" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Category</p>
                  <p className="font-bold text-text">
                    {categoryLabels[order.category] || order.category || "—"}
                  </p>
                </div>
              </div>

              {/* Address */}
              <div className="flex items-start gap-3">
                <MapPin size={15} className="mt-0.5 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Site Address</p>
                    {order.address && (
                      <button
                        type="button"
                        onClick={copyAddress}
                        className="inline-flex items-center gap-1 font-mono text-[10px] text-accent hover:underline"
                      >
                        <Copy size={11} />
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 break-words font-semibold leading-relaxed text-text">
                    {order.address || "—"}
                  </p>
                </div>
              </div>

              {/* Dynamic survey details */}
              {Object.entries(order.details || {}).map(([key, value]) => (
                <div key={key} className="border-t border-border/50 pt-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {key.replace(/[A-Z]/g, (match) => ` ${match}`)}
                  </p>
                  <p className="mt-0.5 break-words font-semibold text-text">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Stage Progression History Timeline */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[.2em] text-text-muted">
              Lifecycle History
            </h3>
            <div className="mt-3 space-y-3">
              {(order.status_history || []).length === 0 ? (
                <p className="text-xs text-text-muted">No historical changes logged yet.</p>
              ) : (
                (order.status_history || []).map((entry, index) => (
                  <div key={`${entry.at}-${index}`} className="flex items-start gap-3 text-xs">
                    <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-black text-text">{entry.status}</span>
                      <p className="font-mono text-[10px] text-text-muted">
                        {entry.at ? new Date(entry.at).toLocaleString("en-IN") : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
