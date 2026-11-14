"use client";

import { Ban, Check, CheckCircle2, CircleAlert, Clock, Shield, ShieldCheck, UserCheck, Users } from "lucide-react";

export default function AdminApprovalQueue({
  approvals,
  visibleApprovals,
  approvalStats,
  approvalFilter,
  setApprovalFilter,
  approvalAction,
  reviewAccount,
  setDenyTarget,
  setDenyReason,
  approvalState,
}) {
  const filters = [
    { key: "all", label: "All Requests", count: approvalStats.all },
    { key: "pending", label: "Needs First Review", count: approvalStats.pending },
    { key: "awaiting_second", label: "Needs Second Review", count: approvalStats.awaiting_second },
    { key: "approved", label: "Fully Approved", count: approvalStats.approved },
    { key: "denied", label: "Denied / Revoked", count: approvalStats.denied + approvalStats.revoked },
  ];

  return (
    <section className="space-y-4">
      {/* Filter Chips Bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {filters.map(({ key, label, count }) => {
          const isSelected = approvalFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setApprovalFilter(key)}
              className={`flex min-h-16 flex-col justify-between rounded-2xl border p-3.5 text-left transition-all ${
                isSelected
                  ? "border-amber-500/80 bg-amber-500/10 shadow-sm"
                  : "border-border bg-card hover:border-amber-500/40"
              }`}
            >
              <span className="block truncate text-[10px] font-black uppercase tracking-wider text-text-muted">
                {label}
              </span>
              <span
                className={`mt-1 font-mono text-2xl font-black tabular-nums ${
                  isSelected ? "text-amber-600 dark:text-amber-400" : "text-text"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Container */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Header */}
        <div className="border-b border-border p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-accent" />
            <h2 className="text-base font-black text-text sm:text-lg">Dual-Admin Approval Queue</h2>
          </div>
          <p className="mt-1 text-xs font-medium leading-relaxed text-text-muted">
            High-security verification: Both designated operators must sign off before customer dashboard access is activated.
          </p>
        </div>

        {/* Desktop Table View (>= 768px) */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-border bg-background/50 text-[10px] font-black uppercase tracking-[.18em] text-text-muted">
              <tr>
                <th className="px-5 py-3.5">User Identity</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Custodian 1</th>
                <th className="px-5 py-3.5">Custodian 2</th>
                <th className="px-5 py-3.5 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleApprovals.map((item) => {
                const state = approvalState(item);
                const isBusy = approvalAction?.startsWith(`${item.user_id}:`);

                return (
                  <tr key={item.user_id} className="transition-colors hover:bg-accent/5">
                    <td className="px-5 py-4">
                      <p className="font-mono text-sm font-black text-text">{item.email}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                        Requested: {item.requested_at ? new Date(item.requested_at).toLocaleDateString("en-IN") : "—"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${state.tone}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {state.label}
                      </span>
                      {item.rejection_reason && (
                        <p className="mt-1.5 max-w-xs font-mono text-[10px] font-semibold text-red-500">
                          {item.rejection_reason}
                        </p>
                      )}
                    </td>

                    <td className="px-5 py-4 font-mono text-xs">
                      {item.admin_one_approved_at ? (
                        <div className="flex items-center gap-1.5 text-emerald-500">
                          <CheckCircle2 size={14} />
                          <span className="font-bold">{item.admin_one_email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-text-muted">
                          <Clock size={13} />
                          <span>Waiting</span>
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 font-mono text-xs">
                      {item.admin_two_approved_at ? (
                        <div className="flex items-center gap-1.5 text-emerald-500">
                          <CheckCircle2 size={14} />
                          <span className="font-bold">{item.admin_two_email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-text-muted">
                          <Clock size={13} />
                          <span>Waiting</span>
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right">
                      {(state.key === "pending" || state.key === "awaiting_second") && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => reviewAccount(item.user_id, "approve")}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-black text-[var(--btn-text)] shadow-sm transition hover:brightness-105 disabled:opacity-50"
                          >
                            <Check size={14} />
                            <span>
                              {isBusy
                                ? "Saving…"
                                : state.key === "awaiting_second"
                                ? "Approve Second"
                                : "Approve"}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setDenyTarget({ ...item, action: "reject" });
                              setDenyReason("");
                            }}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-black text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <Ban size={14} />
                            <span>Deny</span>
                          </button>
                        </div>
                      )}

                      {state.key === "approved" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setDenyTarget({ ...item, action: "revoke" });
                            setDenyReason("");
                          }}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-orange-500/40 px-3 py-1.5 text-xs font-black text-orange-500 transition hover:bg-orange-500/10 disabled:opacity-50"
                        >
                          <CircleAlert size={14} />
                          <span>Revoke</span>
                        </button>
                      )}

                      {(state.key === "denied" || state.key === "revoked") && (
                        <span className="font-mono text-xs font-bold text-text-muted">Access Denied</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visibleApprovals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UserCheck size={32} className="text-text-muted/60" />
              <p className="mt-3 text-sm font-black text-text">No approval requests</p>
              <p className="mt-1 text-xs text-text-muted">There are no pending accounts matching this filter.</p>
            </div>
          )}
        </div>

        {/* Mobile View (< 768px) */}
        <div className="space-y-3 p-3 md:hidden">
          {visibleApprovals.map((item) => {
            const state = approvalState(item);
            const isBusy = approvalAction?.startsWith(`${item.user_id}:`);

            return (
              <article
                key={item.user_id}
                className="rounded-2xl border border-border bg-background p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-all font-mono text-sm font-black text-text">{item.email}</h3>
                    <p className="mt-0.5 font-mono text-[10px] text-text-muted">
                      Requested: {item.requested_at ? new Date(item.requested_at).toLocaleDateString("en-IN") : "—"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${state.tone}`}
                  >
                    {state.label}
                  </span>
                </div>

                {/* 2-Step Approval Status Cards */}
                <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-border/70 bg-card/60 p-3 text-xs sm:grid-cols-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                      Custodian 1
                    </span>
                    <p className="mt-0.5 break-all font-mono font-bold text-text">
                      {item.admin_one_approved_at ? (
                        <span className="text-emerald-500">✓ {item.admin_one_email}</span>
                      ) : (
                        <span className="text-text-muted">Waiting for sign-off</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                      Custodian 2
                    </span>
                    <p className="mt-0.5 break-all font-mono font-bold text-text">
                      {item.admin_two_approved_at ? (
                        <span className="text-emerald-500">✓ {item.admin_two_email}</span>
                      ) : (
                        <span className="text-text-muted">Waiting for sign-off</span>
                      )}
                    </p>
                  </div>
                </div>

                {item.rejection_reason && (
                  <p className="mt-2 font-mono text-xs text-red-500">
                    Reason: {item.rejection_reason}
                  </p>
                )}

                {/* Mobile Actions */}
                {(state.key === "pending" || state.key === "awaiting_second") && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => reviewAccount(item.user_id, "approve")}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-black text-[var(--btn-text)] shadow-sm disabled:opacity-50"
                    >
                      <Check size={14} />
                      <span>
                        {isBusy
                          ? "Saving…"
                          : state.key === "awaiting_second"
                          ? "Approve 2nd"
                          : "Approve"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setDenyTarget({ ...item, action: "reject" });
                        setDenyReason("");
                      }}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-500/40 px-3 text-xs font-black text-red-500 disabled:opacity-50"
                    >
                      <Ban size={14} />
                      <span>Deny</span>
                    </button>
                  </div>
                )}

                {state.key === "approved" && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setDenyTarget({ ...item, action: "revoke" });
                      setDenyReason("");
                    }}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-orange-500/40 text-xs font-black text-orange-500 disabled:opacity-50"
                  >
                    <CircleAlert size={14} />
                    <span>Revoke Access</span>
                  </button>
                )}
              </article>
            );
          })}

          {visibleApprovals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCheck size={28} className="text-text-muted/60" />
              <p className="mt-3 text-sm font-black text-text">No approval requests</p>
              <p className="mt-1 text-xs text-text-muted">There are no pending accounts matching this filter.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
