"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ADMIN_EMAILS, isAdminEmail } from "@/lib/admin";
import { CATEGORY_LABELS, STAGES } from "@/lib/orderCategories";
import {
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Database,
  LayoutDashboard,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

const stageColors = {
  Received: "text-slate-300 border-slate-500/40 bg-slate-500/10",
  Survey: "text-cyan-300 border-cyan-400/40 bg-cyan-400/10",
  Quoting: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  Manufacturing: "text-purple-300 border-purple-400/40 bg-purple-400/10",
  Shipping: "text-blue-300 border-blue-400/40 bg-blue-400/10",
  Installed: "text-accent border-accent/40 bg-accent/10",
};

function Metric({ label, value, hint, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[.18em] text-text-muted">
          {label}
        </span>
        <Icon size={17} className="text-accent" />
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight text-text">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-text-muted">{hint}</p>
    </div>
  );
}

function AdminLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-text">
      <div className="w-full max-w-sm text-center animate-fade-in">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/30 bg-accent-bg text-accent shadow-gold-glow">
          <ShieldCheck size={28} className="animate-pulse" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[.24em] text-accent">
          VikaTech operations
        </p>
        <h1 className="mt-3 text-2xl font-black">Loading command center</h1>
        <div className="mx-auto mt-6 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="admin-loading-bar h-full rounded-full bg-accent" />
        </div>
        <div className="mt-4 flex justify-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

const approvalState = (item) => {
  if (item.account_status === "rejected") return { key: "denied", label: "Denied", tone: "border-red-400/40 bg-red-400/10 text-red-500" };
  if (item.account_status === "revoked") return { key: "revoked", label: "Revoked", tone: "border-orange-400/40 bg-orange-400/10 text-orange-500" };
  if (item.account_status === "approved" && item.admin_one_approved_at && item.admin_two_approved_at) return { key: "approved", label: "Approved", tone: "border-emerald-400/40 bg-emerald-400/10 text-emerald-600" };
  if (item.admin_one_approved_at) return { key: "awaiting_second", label: "Awaiting second approval", tone: "border-cyan-400/40 bg-cyan-400/10 text-cyan-600" };
  return { key: "pending", label: "Needs review", tone: "border-amber-400/50 bg-amber-400/10 text-amber-600" };
};

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [tab, setTab] = useState("orders");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All stages");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [approvalAction, setApprovalAction] = useState(null);
  const [denyTarget, setDenyTarget] = useState(null);
  const [denyReason, setDenyReason] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user || null);
      if (!session || !isAdminEmail(session.user.email)) return;
      const res = await fetch("/api/admin/orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setOrders(json.orders || []);
        setUsers(json.users || []);
        setApprovals(json.approvals || []);
      } else setNotice(json.error || "Could not load admin data");
    } catch (error) {
      setNotice(error.message || "Could not load admin data");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!user || !isAdminEmail(user.email)) return;
    const channel = supabase
      .channel("admin-account-approval-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "account_approval_requests" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setApprovals((current) => current.filter((item) => item.user_id !== payload.old.user_id));
        } else if (payload.eventType === "INSERT") {
          setApprovals((current) => [payload.new, ...current.filter((item) => item.user_id !== payload.new.user_id)]);
        } else {
          setApprovals((current) => current.map((item) => item.user_id === payload.new.user_id ? payload.new : item));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);
  const filtered = useMemo(
    () =>
      orders.filter(
        (o) =>
          (filter === "All stages" || o.status === filter) &&
          `${o.order_id} ${o.full_name} ${o.email}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [orders, filter, query],
  );
  const approvalStats = useMemo(() => approvals.reduce((counts, item) => {
    const key = approvalState(item).key;
    counts[key] = (counts[key] || 0) + 1;
    counts.all += 1;
    return counts;
  }, { all: 0, pending: 0, awaiting_second: 0, approved: 0, denied: 0, revoked: 0 }), [approvals]);
  const visibleApprovals = useMemo(() => approvals.filter((item) => {
    const key = approvalState(item).key;
    return approvalFilter === "all" || key === approvalFilter || (approvalFilter === "denied" && key === "revoked");
  }), [approvals, approvalFilter]);
  const updateStage = async (orderId, status) => {
    const previous = selected;
    // Keep the console responsive while the protected server update runs.
    setSelected((prev) =>
      prev?.order_id === orderId ? { ...prev, status } : prev,
    );
    setOrders((prev) =>
      prev.map((o) => (o.order_id === orderId ? { ...o, status } : o)),
    );
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSelected(previous);
      setNotice("Your session expired. Please sign in again.");
      return;
    }
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId, recordId: previous?.id, status }),
      });
      const json = await res.json();
      if (!res.ok || !json.order)
        throw new Error(json.error || "Update failed");
      setOrders((prev) =>
        prev.map((o) => (o.order_id === orderId ? json.order : o)),
      );
      setSelected(json.order);
      setNotice(
        json.email?.sent === false
          ? "Stage saved, but email could not be sent."
          : `Stage updated. ${status} notification sent.`,
      );
    } catch (error) {
      setOrders((prev) =>
        prev.map((o) => (o.order_id === orderId ? previous : o)),
      );
      setSelected(previous);
      setNotice(error.message || "Could not update stage");
    }
  };
  const reviewAccount = async (userId, action, rejectionReason = "") => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setNotice("Your session expired. Please sign in again.");
      return false;
    }
    setApprovalAction(`${userId}:${action}`);
    try {
    const res = await fetch("/api/admin/approvals", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId, action, rejectionReason }),
    });
    const json = await res.json();
    if (!res.ok) {
      setNotice(json.error || "Approval update failed");
      return false;
    }
    setApprovals((prev) =>
      prev.map((item) => (item.user_id === userId ? json.approval : item)),
    );
    setNotice(
      action === "approve"
        ? "Approval recorded. Both administrators must approve before access is unlocked."
        : action === "revoke" ? "Account access revoked." : "Account request denied.",
    );
    return true;
    } catch (error) {
      setNotice(error.message || "Approval update failed");
      return false;
    } finally {
      setApprovalAction(null);
    }
  };
  const submitDenial = async () => {
    if (!denyTarget || !denyReason.trim()) return;
    const success = await reviewAccount(denyTarget.user_id, denyTarget.action, denyReason.trim());
    if (success) {
      setDenyTarget(null);
      setDenyReason("");
    }
  };
  const generateProvisioning = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/provisioning", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        orderId: selected?.order_id,
        userId: selected?.user_id,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setNotice(json.error || "Could not generate provisioning");
      return;
    }
    const fullUrl = `${window.location.origin}${json.setupUrl}`;
    await navigator.clipboard?.writeText(fullUrl);
    setNotice(`Secure setup link created and copied: ${fullUrl}`);
  };
  if (loading) return <AdminLoading />;
  if (!user || !isAdminEmail(user.email))
    return (
      <div className="min-h-screen bg-background px-6 pt-32 text-center">
        <ShieldCheck className="mx-auto text-red-400" size={34} />
        <h1 className="mt-4 text-2xl font-black text-text">
          Admin access required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          This area is restricted to the VikaTech operations team.
        </p>
      </div>
    );
  const installed = orders.filter((o) => o.status === "Installed").length;
  const active = orders.length - installed;
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-8 text-text animate-fade-in sm:px-6 md:px-10 lg:px-12">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-accent">
              <LayoutDashboard size={14} /> Operations console
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
              Admin command center
            </h1>
            <p className="mt-2 max-w-xl text-sm font-semibold text-text-muted">
              Track every inquiry, manage project stages, and keep customers
              informed automatically.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black text-text hover:border-accent/50"
          >
            <RefreshCw size={14} /> Refresh data
          </button>
        </div>
        <div className="mb-5 flex gap-2 rounded-xl border border-border bg-card p-1">
          <button
            onClick={() => setTab("orders")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-black ${tab === "orders" ? "bg-accent text-[var(--btn-text)]" : "text-text-muted hover:text-text"}`}
          >
            Order pipeline
          </button>
          <button
            onClick={() => setTab("users")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-black ${tab === "users" ? "bg-accent text-[var(--btn-text)]" : "text-text-muted hover:text-text"}`}
          >
            User approvals{" "}
            {approvals.filter((item) => item.account_status === "pending")
              .length > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">
                {
                  approvals.filter((item) => item.account_status === "pending")
                    .length
                }
              </span>
            )}
          </button>
        </div>
        {tab === "users" && (
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <h2 className="text-base font-black">Account approval queue</h2>
              <p className="mt-1 text-[11px] font-semibold text-text-muted">
                Both administrators must approve before dashboard access is
                unlocked.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["all", "All", approvalStats.all],
                  ["pending", "Needs review", approvalStats.pending],
                  ["awaiting_second", "Second review", approvalStats.awaiting_second],
                  ["approved", "Approved", approvalStats.approved],
                  ["denied", "Denied", approvalStats.denied + approvalStats.revoked],
                ].map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => setApprovalFilter(key)}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${approvalFilter === key ? "border-accent bg-accent/10" : "border-border bg-background hover:border-accent/50"}`}
                  >
                    <span className="block text-[9px] font-black uppercase tracking-wide text-text-muted">{label}</span>
                    <span className="mt-1 block text-lg font-black text-text">{count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-background text-[10px] font-black uppercase tracking-[.16em] text-text-muted">
                  <tr>
                    <th className="px-5 py-4">User</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Admin 1</th>
                    <th className="px-5 py-4">Admin 2</th>
                    <th className="px-5 py-4 text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleApprovals.map((item) => {
                    const state = approvalState(item);
                    const actionBusy = approvalAction?.startsWith(`${item.user_id}:`);
                    return (
                    <tr key={item.user_id}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-black">{item.email}</p>
                        <p className="mt-1 text-[11px] text-text-muted">
                          Requested{" "}
                          {item.requested_at
                            ? new Date(item.requested_at).toLocaleDateString(
                                "en-IN",
                              )
                            : "—"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${state.tone}`}>{state.label}</span>
                        {item.rejection_reason && <p className="mt-2 max-w-[190px] text-[10px] font-semibold text-red-500">{item.rejection_reason}</p>}
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold">
                        {item.admin_one_approved_at
                          ? `Approved by ${item.admin_one_email}`
                          : "Waiting"}
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold">
                        {item.admin_two_approved_at
                          ? `Approved by ${item.admin_two_email}`
                          : "Waiting"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {(state.key === "pending" || state.key === "awaiting_second") && <div className="flex justify-end gap-2">
                          <button disabled={actionBusy} onClick={() => reviewAccount(item.user_id, "approve")} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-black text-[var(--btn-text)] disabled:opacity-50"><Check size={13} /> {actionBusy ? "Saving…" : state.key === "awaiting_second" ? "Approve second" : "Approve"}</button>
                          <button disabled={actionBusy} onClick={() => { setDenyTarget({ ...item, action: "reject" }); setDenyReason(""); }} className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-1.5 text-[11px] font-black text-red-500 hover:bg-red-400/10 disabled:opacity-50"><Ban size={13} /> Deny</button>
                        </div>}
                        {state.key === "approved" && <button disabled={actionBusy} onClick={() => { setDenyTarget({ ...item, action: "revoke" }); setDenyReason(""); }} className="inline-flex items-center gap-1 rounded-lg border border-orange-400/40 px-3 py-1.5 text-[11px] font-black text-orange-500 hover:bg-orange-400/10 disabled:opacity-50"><CircleAlert size={13} /> Revoke</button>}
                        {(state.key === "denied" || state.key === "revoked") && <span className="text-xs font-bold text-text-muted">Access blocked</span>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleApprovals.length === 0 && (
                <div className="p-12 text-center text-sm font-semibold text-text-muted">
                  {approvals.length === 0 ? "No approval requests." : "No requests match this state."}
                </div>
              )}
            </div>
          </section>
        )}
        {tab === "orders" && (
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-black">Order pipeline</h2>
                <p className="mt-1 text-[11px] font-semibold text-text-muted">
                  {filtered.length} visible of {orders.length} orders
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search ID, customer, email"
                    className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-accent sm:w-64"
                  />
                </div>
                <div className="relative">
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-3 pr-9 text-xs font-black outline-none focus:border-accent"
                  >
                    <option>All stages</option>
                    {STAGES.map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-background text-[10px] font-black uppercase tracking-[.16em] text-text-muted">
                  <tr>
                    <th className="px-5 py-4">Order</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Category</th>
                    <th className="px-5 py-4">Stage</th>
                    <th className="px-5 py-4">Created</th>
                    <th className="px-5 py-4 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((order) => (
                    <tr
                      key={order.order_id}
                      className="transition-colors hover:bg-accent-bg/20"
                    >
                      <td className="px-5 py-4">
                        <button
                          onClick={() => setSelected(order)}
                          className="font-mono text-xs font-black text-cyan-300 hover:underline"
                        >
                          {order.order_id}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-black">
                          {order.full_name || "Unknown customer"}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-text-muted">
                          {order.email || "No email"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-text-muted">
                        {CATEGORY_LABELS[order.category] ||
                          order.category ||
                          "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${stageColors[order.status] || stageColors.Received}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold text-text-muted">
                        {order.created_at
                          ? new Date(order.created_at).toLocaleDateString(
                              "en-IN",
                            )
                          : "—"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setSelected(order)}
                          className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-black hover:border-accent hover:text-accent"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-12 text-center text-sm font-semibold text-text-muted">
                  No orders match this view.
                </div>
              )}
            </div>
          </section>
        )}
        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <Mail className="text-accent" size={18} />
              <div>
                <h2 className="text-sm font-black">Stage email automation</h2>
                <p className="text-[11px] font-semibold text-text-muted">
                  Every manual stage update sends the customer a tracking email
                  and BCCs both admins.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-cyan-300" size={18} />
              <div>
                <h2 className="text-sm font-black">Admin operators</h2>
                <p className="text-[11px] font-semibold text-text-muted">
                  {ADMIN_EMAILS.join(" · ")}
                </p>
              </div>
            </div>
          </div>
        </section>
        {denyTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm" onClick={() => setDenyTarget(null)}>
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-red-500">{denyTarget.action === "revoke" ? "Revoke access" : "Deny account"}</p>
                  <h2 className="mt-2 text-xl font-black">{denyTarget.email}</h2>
                  <p className="mt-2 text-xs font-semibold leading-5 text-text-muted">A reason is required and will be shown to the user on the denied page.</p>
                </div>
                <button onClick={() => setDenyTarget(null)} className="rounded-lg border border-border p-2 text-text-muted hover:text-text"><X size={16} /></button>
              </div>
              <textarea value={denyReason} onChange={(event) => setDenyReason(event.target.value)} rows={4} autoFocus placeholder="Explain why access is being denied…" className="mt-5 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm font-semibold outline-none focus:border-red-400" />
              <div className="mt-4 flex justify-end gap-2"><button onClick={() => setDenyTarget(null)} className="rounded-xl border border-border px-4 py-2.5 text-xs font-black">Cancel</button><button disabled={!denyReason.trim() || approvalAction} onClick={submitDenial} className="rounded-xl bg-red-500 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{approvalAction ? "Saving…" : denyTarget.action === "revoke" ? "Revoke access" : "Deny account"}</button></div>
            </div>
          </div>
        )}
        {notice && (
          <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-accent/40 bg-card px-4 py-3 text-xs font-black text-accent shadow-xl">
            {notice}
            <button onClick={() => setNotice("")} className="ml-3">
              <X size={14} />
            </button>
          </div>
        )}
        {selected && (
          <div
            className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          >
            <aside
              onClick={(e) => e.stopPropagation()}
              className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-6 shadow-2xl sm:p-8"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs font-black text-cyan-300">
                    {selected.order_id}
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    {selected.full_name || "Customer"}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-text-muted">
                    {selected.email}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg border border-border p-2 text-text-muted hover:text-text"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-8">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-text-muted">
                  Move project to stage
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {STAGES.map((stage) => (
                    <button
                      key={stage}
                      disabled={selected.status === stage}
                      onClick={() => updateStage(selected.order_id, stage)}
                      className={`rounded-xl border px-3 py-3 text-left text-xs font-black transition-colors ${selected.status === stage ? "border-accent bg-accent/10 text-accent" : "border-border hover:border-accent/60"}`}
                    >
                      {stage}
                      {selected.status === stage && (
                        <Check size={14} className="float-right" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-8 rounded-xl border border-border bg-background p-4">
                <h3 className="text-[10px] font-black uppercase tracking-[.18em] text-text-muted">
                  Project details
                </h3>
                <div className="mt-4 space-y-3 text-xs">
                  <p>
                    <span className="text-text-muted">Phone</span>
                    <br />
                    <b>{selected.phone || "—"}</b>
                  </p>
                  <p>
                    <span className="text-text-muted">Category</span>
                    <br />
                    <b>
                      {CATEGORY_LABELS[selected.category] ||
                        selected.category ||
                        "—"}
                    </b>
                  </p>
                  <p>
                    <span className="text-text-muted">Address</span>
                    <br />
                    <b>{selected.address || "—"}</b>
                  </p>
                  {Object.entries(selected.details || {}).map(
                    ([key, value]) => (
                      <p key={key}>
                        <span className="capitalize text-text-muted">
                          {key.replace(/[A-Z]/g, (m) => ` ${m}`)}
                        </span>
                        <br />
                        <b>{String(value)}</b>
                      </p>
                    ),
                  )}
                </div>
              </div>
              <div className="mt-8">
                <h3 className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-text-muted">
                  Update history
                </h3>
                <div className="space-y-3">
                  {(selected.status_history || []).map((entry, index) => (
                    <div
                      key={`${entry.at}-${index}`}
                      className="flex gap-3 text-xs"
                    >
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                      <div>
                        <b>{entry.status}</b>
                        <p className="text-text-muted">
                          {entry.at
                            ? new Date(entry.at).toLocaleString("en-IN")
                            : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
