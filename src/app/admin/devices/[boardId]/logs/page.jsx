"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/admin";
import {
  Activity, ArrowLeft, CheckCircle2, CircleAlert, Clock3, Cpu, ExternalLink,
  FileClock, LoaderCircle, RadioTower, RefreshCw, Settings2, ShieldAlert, Wifi,
  WifiOff, Zap,
} from "lucide-react";

const FILTERS = [
  { id: "all", label: "All events" },
  { id: "command", label: "Commands" },
  { id: "configuration", label: "Configuration" },
  { id: "relay", label: "Relay activity" },
  { id: "admin", label: "Admin actions" },
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" });
}

function relative(value) {
  if (!value) return "Never";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return seconds + " seconds ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + " minutes ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " hours ago";
  return Math.floor(seconds / 86400) + " days ago";
}

function statusClass(status) {
  if (["completed", "applied", "recorded", "success"].includes(String(status).toLowerCase())) {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-500";
  }
  if (["failed", "expired", "cancelled"].includes(String(status).toLowerCase())) {
    return "border-red-400/40 bg-red-400/10 text-red-500";
  }
  if (["pending", "accepted", "sending", "checking_wifi", "applying"].includes(String(status).toLowerCase())) {
    return "border-amber-400/40 bg-amber-400/10 text-amber-600";
  }
  return "border-border bg-background text-text-muted";
}

function EventIcon({ category, status }) {
  if (status === "failed" || status === "expired") return <CircleAlert size={16} />;
  if (category === "command") return <RadioTower size={16} />;
  if (category === "configuration") return <Settings2 size={16} />;
  if (category === "relay") return <Zap size={16} />;
  if (category === "admin") return <ShieldAlert size={16} />;
  return <Activity size={16} />;
}

export default function DeviceLogsPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = String(params?.boardId || "");
  const [accessToken, setAccessToken] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [board, setBoard] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [fetchedAt, setFetchedAt] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (!session || !isAdminEmail(session.user.email)) {
        router.replace("/admin");
        setAuthReady(true);
        setLoading(false);
        return;
      }
      setAccessToken(session.access_token);
      setAuthReady(true);
    });
    return () => { active = false; };
  }, [router]);

  const loadLogs = useCallback(async (silent = false) => {
    if (!accessToken || !boardId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/admin/devices/" + encodeURIComponent(boardId) + "/logs", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const data = await response.json();
      if (!response.ok) {
        setHint(data.hint || "");
        throw new Error(data.error || "Could not load device logs.");
      }
      setBoard(data.board || null);
      setRuntime(data.runtime || null);
      setEvents(data.events || []);
      setFetchedAt(data.fetchedAt || new Date().toISOString());
      setError("");
      setHint("");
    } catch (err) {
      setError(err.message || "Could not load device logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, boardId]);

  useEffect(() => {
    if (!authReady || !accessToken || !boardId) return;
    loadLogs();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadLogs(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [authReady, accessToken, boardId, loadLogs]);

  const visibleEvents = useMemo(
    () => filter === "all" ? events : events.filter((event) => event.category === filter),
    [events, filter],
  );

  if (!authReady || loading) {
    return <main className="flex min-h-screen items-center justify-center bg-background px-4 text-text">
      <div className="text-center"><LoaderCircle size={30} className="mx-auto animate-spin text-accent" /><p className="mt-3 text-sm font-bold">Loading device logs…</p></div>
    </main>;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background px-3 pb-12 pt-5 text-text sm:px-6 sm:pt-8 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-accent"><FileClock size={14} /> Device diagnostics</p>
            <h1 className="break-words text-2xl font-black tracking-tight sm:text-4xl">Device logs</h1>
            <p className="mt-2 break-all font-mono text-[11px] text-text-muted">{board?.name || "ESP32"} · {board?.boardIdentifier || boardId}</p>
            <p className="mt-1 text-xs text-text-muted">Per-board relay activity, configuration updates, restart commands, and admin audit events.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button onClick={() => loadLogs()} disabled={refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black disabled:opacity-50">
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh logs
            </button>
            <Link href="/admin" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black hover:border-accent">
              <ArrowLeft size={14} /> Back to Admin
            </Link>
            <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-[var(--btn-text)] hover:brightness-105">
              <ExternalLink size={14} /> Main site
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Connection</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-black"><span className={"h-2.5 w-2.5 rounded-full " + (runtime?.lastSeenAt && Date.now() - new Date(runtime.lastSeenAt).getTime() < 120000 ? "bg-emerald-500" : "bg-red-500")} />{runtime?.lastSeenAt && Date.now() - new Date(runtime.lastSeenAt).getTime() < 120000 ? "Recently seen" : "Offline / stale"}</p>
            <p className="mt-1 text-[10px] text-text-muted">{relative(runtime?.lastSeenAt)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Configuration</p>
            <p className="mt-2 text-sm font-black">v{runtime?.appliedVersion ?? "—"} applied / v{runtime?.desiredVersion ?? "—"} desired</p>
            <p className={"mt-1 text-[10px] font-bold " + (runtime?.configStatus === "failed" ? "text-red-500" : runtime?.configStatus === "applied" ? "text-emerald-500" : "text-text-muted")}>{String(runtime?.configStatus || "not registered").replaceAll("_", " ")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Last boot</p>
            <p className="mt-2 text-sm font-black">{relative(runtime?.lastBootAt)}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-text-muted">{runtime?.lastBootId || "No boot ID reported"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">Network</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-black">{runtime?.lastIp ? <Wifi size={14} /> : <WifiOff size={14} />}{runtime?.wifiName || "Wi-Fi not reported"}</p>
            <p className="mt-1 break-all text-[10px] text-text-muted">{runtime?.lastIp || "No IP reported"} · {runtime?.wifiSecurity === "open" ? "Open" : "WPA2-PSK"}</p>
          </div>
        </section>

        {runtime?.lastError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/5 p-3 text-xs leading-5 text-red-500"><CircleAlert size={15} className="mt-0.5 shrink-0" /><span className="break-words">{runtime.lastError}</span></div>}
        {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/5 p-3 text-xs leading-5 text-red-500"><p className="font-black">Could not refresh device logs</p><p className="mt-1 break-words">{error}</p>{hint && <p className="mt-2 break-words text-text-muted">{hint}</p>}<button onClick={() => loadLogs()} className="mt-2 underline">Retry</button></div>}

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-base font-black">Event history</h2><p className="mt-1 text-[11px] text-text-muted">{visibleEvents.length} events · auto-refresh every 10 seconds</p></div>
              <p className="text-[10px] text-text-muted">Last updated {fetchedAt ? formatDate(fetchedAt) : "—"}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {FILTERS.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={"min-h-10 rounded-lg border px-3 py-2 text-[10px] font-black sm:text-xs " + (filter === item.id ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-text-muted hover:border-accent/50")}>{item.label}</button>)}
            </div>
          </div>

          {visibleEvents.length ? <div className="divide-y divide-border">
            {visibleEvents.map((event) => <article key={event.id} className="flex min-w-0 gap-3 p-4 sm:gap-4 sm:p-5">
              <div className={"mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border " + statusClass(event.status)}><EventIcon category={event.category} status={event.status} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><h3 className="break-words text-xs font-black sm:text-sm">{event.title}</h3><p className="mt-1 break-words text-xs leading-5 text-text-muted">{event.message}</p></div>
                  <span className={"w-fit shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase " + statusClass(event.status)}>{String(event.status || "info").replaceAll("_", " ")}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
                  <span className="inline-flex items-center gap-1"><Clock3 size={11} />{formatDate(event.createdAt)}</span>
                  <span>Source: {event.source || "unknown"}</span>
                  {event.configVersion != null && <span>Config v{event.configVersion}</span>}
                  {event.commandId && <span className="break-all font-mono">ID: {event.commandId}</span>}
                </div>
              </div>
            </article>)}
          </div> : <div className="p-10 text-center">
            <FileClock size={28} className="mx-auto text-text-muted" />
            <h3 className="mt-3 text-sm font-black">No events found</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-text-muted">Events will appear here when the ESP32 reports configuration changes, commands, relay activity or administrative actions. Older events are not backfilled automatically.</p>
          </div>}
        </section>

        <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-[10px] leading-5 text-text-muted"><Activity size={14} className="mt-0.5 shrink-0" /><p>These logs are assembled from the configuration timeline, restart command queue, relay activity table and administrative audit log. They show recorded events; they cannot prove that a physical relay changed unless the firmware actually reported that event.</p></div>
      </div>
    </main>
  );
}
