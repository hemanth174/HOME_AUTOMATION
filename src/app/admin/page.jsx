"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ADMIN_EMAILS, isAdminEmail } from "@/lib/admin";
import { CATEGORY_LABELS, STAGES } from "@/lib/orderCategories";
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Inbox,
  LayoutDashboard,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import DeviceFleet from "./DeviceFleet";
import AdminApprovalQueue from "./AdminApprovalQueue";
import AdminOrderPipeline from "./AdminOrderPipeline";
import AdminOrderDrawer from "./AdminOrderDrawer";
import AdminVoiceSubscription from "./AdminVoiceSubscription";
import ThemeToggle from "@/components/ThemeToggle";

const stageColors = {
  Received: "text-slate-300 border-slate-500/40 bg-slate-500/10",
  Survey: "text-cyan-300 border-cyan-400/40 bg-cyan-400/10",
  Quoting: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  Manufacturing: "text-purple-300 border-purple-400/40 bg-purple-400/10",
  Shipping: "text-blue-300 border-blue-400/40 bg-blue-400/10",
  Installed: "text-accent border-accent/40 bg-accent/10",
};

const ADMIN_TAB_COOKIE = "vikatech_admin_tab";
const ADMIN_TABS = ["orders", "users", "hardware", "subscriptions"];

function readAdminTabCookie() {
  if (typeof document === "undefined") return "orders";
  const prefix = ADMIN_TAB_COOKIE + "=";
  const entry = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  if (!entry) return "orders";
  let value = "";
  try {
    value = decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return "orders";
  }
  return ADMIN_TABS.includes(value) ? value : "orders";
}

const approvalState = (item) => {
  if (item.account_status === "rejected") {
    return { key: "denied", label: "Denied", tone: "border-red-400/40 bg-red-400/10 text-red-500" };
  }
  if (item.account_status === "revoked") {
    return { key: "revoked", label: "Revoked", tone: "border-orange-400/40 bg-orange-400/10 text-orange-500" };
  }
  if (item.account_status === "approved" && item.admin_one_approved_at && item.admin_two_approved_at) {
    return { key: "approved", label: "Approved", tone: "border-emerald-400/40 bg-emerald-400/10 text-emerald-500" };
  }
  if (item.admin_one_approved_at) {
    return { key: "awaiting_second", label: "Awaiting second", tone: "border-cyan-400/40 bg-cyan-400/10 text-cyan-400" };
  }
  return { key: "pending", label: "Needs review", tone: "border-amber-400/50 bg-amber-400/10 text-amber-500" };
};

function AdminLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-text">
      <div className="w-full max-w-sm text-center animate-fade-in">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/30 bg-accent-bg text-accent shadow-gold-glow">
          <ShieldCheck size={30} className="animate-pulse" />
        </div>
        <p className="text-[11px] font-black uppercase tracking-[.24em] text-accent">VikaTech Operations</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight">Loading command center</h1>
        <div className="mx-auto mt-6 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="admin-loading-bar h-full rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState("");
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [tab, setTab] = useState("orders");
  const [tabHydrated, setTabHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All stages");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [approvalAction, setApprovalAction] = useState(null);
  const [denyTarget, setDenyTarget] = useState(null);
  const [denyReason, setDenyReason] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setAccessToken(session?.access_token || "");
      if (!session || !isAdminEmail(session.user.email)) return;

      const res = await fetch("/api/admin/orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setOrders(json.orders || []);
        setUsers(json.users || []);
        setApprovals(json.approvals || []);
      } else {
        setNotice(json.error || "Could not load admin data");
      }
    } catch (error) {
      setNotice(error.message || "Could not load admin data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setTab(readAdminTabCookie());
    setTabHydrated(true);
  }, []);

  useEffect(() => {
    if (!tabHydrated) return;
    document.cookie = `${ADMIN_TAB_COOKIE}=${encodeURIComponent(tab)}; Max-Age=31536000; Path=/; SameSite=Lax`;
  }, [tab, tabHydrated]);

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
          setApprovals((current) =>
            current.map((item) => (item.user_id === payload.new.user_id ? payload.new : item))
          );
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) =>
          (filter === "All stages" || o.status === filter) &&
          `${o.order_id} ${o.full_name} ${o.email}`.toLowerCase().includes(query.toLowerCase())
      ),
    [orders, filter, query]
  );

  const approvalStats = useMemo(
    () =>
      approvals.reduce(
        (counts, item) => {
          const key = approvalState(item).key;
          counts[key] = (counts[key] || 0) + 1;
          counts.all += 1;
          return counts;
        },
        { all: 0, pending: 0, awaiting_second: 0, approved: 0, denied: 0, revoked: 0 }
      ),
    [approvals]
  );

  const visibleApprovals = useMemo(
    () =>
      approvals.filter((item) => {
        const key = approvalState(item).key;
        return (
          approvalFilter === "all" ||
          key === approvalFilter ||
          (approvalFilter === "denied" && key === "revoked")
        );
      }),
    [approvals, approvalFilter]
  );

  const updateStage = async (orderId, status) => {
    const previous = selected;
    setSelected((prev) => (prev?.order_id === orderId ? { ...prev, status } : prev));
    setOrders((prev) => prev.map((o) => (o.order_id === orderId ? { ...o, status } : o)));

    const { data: { session } } = await supabase.auth.getSession();
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
      if (!res.ok || !json.order) throw new Error(json.error || "Update failed");

      setOrders((prev) => prev.map((o) => (o.order_id === orderId ? json.order : o)));
      setSelected(json.order);
      setNotice(
        json.email?.sent === false
          ? "Stage saved, but notification email could not be delivered."
          : `Stage updated to ${status}. Notification sent.`
      );
    } catch (error) {
      setOrders((prev) => prev.map((o) => (o.order_id === orderId ? previous : o)));
      setSelected(previous);
      setNotice(error.message || "Could not update stage");
    }
  };

  const reviewAccount = async (userId, action, rejectionReason = "") => {
    const { data: { session } } = await supabase.auth.getSession();
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

      setApprovals((prev) => prev.map((item) => (item.user_id === userId ? json.approval : item)));
      setNotice(
        action === "approve"
          ? "Approval recorded. Both administrators must approve before access is unlocked."
          : action === "revoke"
          ? "Account access revoked."
          : "Account request denied."
      );
      return true;
    } catch (error) {
      setNotice(error.message || "Approval update failed");
      return false;
    } finally {
      setApprovalAction(null);
    }
  };

  if (loading) return <AdminLoading />;

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16 text-center text-text sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-card p-6 shadow-2xl sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-500">
            <ShieldAlert size={28} />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-text">Admin Access Required</h1>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-text-muted">
            This command center is restricted strictly to authorized VikaTech operations personnel.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-black text-[var(--btn-text)] shadow-md transition-transform hover:scale-[1.02]"
          >
            <ArrowLeft size={14} /> Back to Main Site
          </Link>
        </div>
      </div>
    );
  }

  const submitDenial = async () => {
    if (!denyTarget || !denyReason.trim()) return;
    if (await reviewAccount(denyTarget.user_id, denyTarget.action, denyReason.trim())) {
      setDenyTarget(null);
      setDenyReason("");
    }
  };

  const pendingCount = approvals.filter((item) => item.account_status === "pending").length;

  return (
    <main className="min-h-screen bg-background text-text selection:bg-accent/20">
      {/* Top Header Command Bar (Sticky with fixed tabs) */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md shadow-sm transition-all">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-3 py-3 sm:px-6 sm:py-3.5 md:flex-row md:items-center md:justify-between lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[.22em] text-accent">
                  Operations Console
                </span>
                <span className="hidden text-[10px] font-bold text-text-muted sm:inline">· 2 Admins Active</span>
              </div>
              <h1 className="mt-0.5 truncate text-xl font-black tracking-tight sm:text-2xl lg:text-3xl">
                Admin Command Center
              </h1>
            </div>

            {/* Quick Actions (mobile top right) */}
            <div className="flex items-center gap-2 md:hidden">
              <ThemeToggle variant="switch" />
              <button
                type="button"
                onClick={() => load(true)}
                disabled={refreshing}
                title="Refresh command center"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin text-accent" : ""} />
              </button>
              <Link
                href="/"
                title="Back to site"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-text-muted hover:border-accent hover:text-text"
              >
                <ArrowLeft size={13} />
              </Link>
            </div>
          </div>

          {/* Desktop Navigation & Actions */}
          <div className="hidden items-center gap-2.5 md:flex md:shrink-0">
            <ThemeToggle variant="switch" />
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-black text-text shadow-sm transition hover:border-accent/60 hover:text-accent disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin text-accent" : ""} />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </button>
            <Link
              href="/"
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-black text-text shadow-sm transition hover:border-accent/60 hover:text-accent"
            >
              <ArrowLeft size={13} />
              <span>Back to VikaTech</span>
            </Link>
          </div>
        </div>

        {/* Responsive Tab Bar with High-Contrast Pill Styling (Always visible on scroll, compact width) */}
        <div className="mx-auto max-w-[1440px] px-3 pb-2.5 sm:px-6 lg:px-10">
          <nav
            aria-label="Admin Navigation Tabs"
            className="inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card-alt p-1.5 backdrop-blur-md scrollbar-none"
          >
            <button
              type="button"
              onClick={() => setTab("orders")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs transition-all ${
                tab === "orders"
                  ? "bg-card text-text border border-border shadow-sm font-black"
                  : "text-text-muted hover:text-text hover:bg-card/40 font-bold"
              }`}
            >
              <Inbox size={15} className={tab === "orders" ? "text-amber-500" : "text-text-muted"} />
              <span>Order Pipeline</span>
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                  tab === "orders"
                    ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                    : "bg-card border border-border text-text-muted"
                }`}
              >
                {orders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab("users")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs transition-all ${
                tab === "users"
                  ? "bg-card text-text border border-border shadow-sm font-black"
                  : "text-text-muted hover:text-text hover:bg-card/40 font-bold"
              }`}
            >
              <UserCheck size={15} className={tab === "users" ? "text-amber-500" : "text-text-muted"} />
              <span>User Approvals</span>
              {pendingCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white shadow-sm animate-pulse">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setTab("hardware")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs transition-all ${
                tab === "hardware"
                  ? "bg-card text-text border border-border shadow-sm font-black"
                  : "text-text-muted hover:text-text hover:bg-card/40 font-bold"
              }`}
            >
              <Cpu size={15} className={tab === "hardware" ? "text-amber-500" : "text-text-muted"} />
              <span>Hardware Fleet</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("subscriptions")}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs transition-all ${
                tab === "subscriptions"
                  ? "bg-card text-text border border-border shadow-sm font-black"
                  : "text-text-muted hover:text-text hover:bg-card/40 font-bold"
              }`}
            >
              <Sparkles size={15} className={tab === "subscriptions" ? "text-amber-500" : "text-text-muted"} />
              <span>Voice Plans</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="mx-auto max-w-[1440px] px-3 py-5 sm:px-6 sm:py-6 lg:px-10">
        {tab === "hardware" ? (
          <DeviceFleet />
        ) : tab === "users" ? (
          <AdminApprovalQueue
            approvals={approvals}
            visibleApprovals={visibleApprovals}
            approvalStats={approvalStats}
            approvalFilter={approvalFilter}
            setApprovalFilter={setApprovalFilter}
            approvalAction={approvalAction}
            reviewAccount={reviewAccount}
            setDenyTarget={setDenyTarget}
            setDenyReason={setDenyReason}
            approvalState={approvalState}
          />
        ) : tab === "subscriptions" ? (
          <AdminVoiceSubscription accessToken={accessToken} onNotice={setNotice} />
        ) : (
          <AdminOrderPipeline
            filtered={filtered}
            orders={orders}
            query={query}
            setQuery={setQuery}
            filter={filter}
            setFilter={setFilter}
            setSelected={setSelected}
            stages={STAGES}
            categoryLabels={CATEGORY_LABELS}
            stageColors={stageColors}
          />
        )}

        {/* Operational Telemetry Cards */}
        {tab !== "hardware" && tab !== "subscriptions" && (
          <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm sm:p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                <Mail size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-black text-text">Stage Email Automation</h2>
                <p className="mt-1 text-xs font-medium leading-relaxed text-text-muted">
                  Stage progressions automatically dispatch transactional notifications to the customer and BCC both designated administrators.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm sm:p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-400">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-black text-text">Dual-Admin Custodians</h2>
                <p className="mt-1 break-all font-mono text-[11px] font-semibold text-text-muted">
                  {ADMIN_EMAILS.join(" · ")}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Denial / Revoke Reason Modal Sheet */}
      {denyTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setDenyTarget(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl border border-border bg-card p-5 shadow-2xl animate-slide-up sm:rounded-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Mobile Drag Handle Indicator */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-red-500" />
                  <p className="text-[10px] font-black uppercase tracking-[.2em] text-red-500">
                    {denyTarget.action === "revoke" ? "Revoke Access" : "Deny Request"}
                  </p>
                </div>
                <h2 className="mt-1 break-all font-mono text-base font-black sm:text-lg">
                  {denyTarget.email}
                </h2>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-text-muted">
                  A specific explanation is required and will be displayed to the user when they attempt to sign in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDenyTarget(null)}
                aria-label="Close dialog"
                className="shrink-0 rounded-xl border border-border p-2 text-text-muted hover:border-accent hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              <label htmlFor="denial-reason" className="block text-[11px] font-black uppercase tracking-wider text-text-muted">
                Reason for denial
              </label>
              <textarea
                id="denial-reason"
                value={denyReason}
                onChange={(event) => setDenyReason(event.target.value)}
                rows={4}
                autoFocus
                placeholder="Explain why this account request is being denied or revoked…"
                className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-3 font-mono text-xs font-semibold text-text outline-none transition focus:border-red-400"
              />
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDenyTarget(null)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-xs font-black text-text hover:border-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!denyReason.trim() || Boolean(approvalAction)}
                onClick={submitDenial}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-500 px-5 text-xs font-black text-white shadow-md transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approvalAction
                  ? "Processing..."
                  : denyTarget.action === "revoke"
                  ? "Confirm Revocation"
                  : "Confirm Denial"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating System Notice Toast */}
      {notice && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-3 rounded-2xl border border-accent/40 bg-card p-4 text-xs font-bold text-accent shadow-2xl backdrop-blur-md animate-fade-in"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20">
            <CheckCircle2 size={16} />
          </div>
          <span className="min-w-0 flex-1 break-words">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
            className="shrink-0 rounded-lg p-1 text-text-muted hover:text-text"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Selected Order Slide-Over Drawer */}
      {selected && (
        <AdminOrderDrawer
          order={selected}
          stages={STAGES}
          categoryLabels={CATEGORY_LABELS}
          stageColors={stageColors}
          onClose={() => setSelected(null)}
          onStage={updateStage}
        />
      )}
    </main>
  );
}
