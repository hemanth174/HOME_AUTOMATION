"use client";

import AppSelect from '@/components/AppSelect';
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, ExternalLink, LoaderCircle, Play, Radio, RefreshCw, Server, Square, Terminal } from "lucide-react";

function localTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function AdminMqttServer({ accessToken = "" }) {
  const [snapshot, setSnapshot] = useState(null);
  const [logs, setLogs] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [scheduleOwner, setScheduleOwner] = useState("hemanth");
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [scheduleTime, setScheduleTime] = useState(() => { const now = new Date(); return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`; });
  const [logsError, setLogsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${accessToken}` }), [accessToken]);
  const loadState = useCallback(async (quiet = false) => {
    if (!accessToken) return;
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch("/api/admin/mqtt-control", { headers, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read the MQTT lease.");
      setSnapshot(data);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Could not read the MQTT lease.");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, [accessToken, headers]);

  const loadLogs = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch("/api/admin/mqtt-logs", { headers, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load MQTT logs.");
      setLogs(data.logs || []);
      setLogsError("");
    } catch (loadError) {
      setLogsError(loadError.message || "Could not load MQTT logs.");
    }
  }, [accessToken, headers]);

  const loadSchedules = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch("/api/admin/mqtt-schedules", { headers, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load scheduled starts.");
      setSchedules(data.schedules || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load scheduled starts.");
    }
  }, [accessToken, headers]);

  useEffect(() => {
    void loadState();
    void loadLogs();
    void loadSchedules();
    const stateTimer = window.setInterval(() => void loadState(true), 5000);
    const logTimer = window.setInterval(() => void loadLogs(), 10000);
    const scheduleTimer = window.setInterval(() => void loadSchedules(), 30000);
    return () => { window.clearInterval(stateTimer); window.clearInterval(logTimer); window.clearInterval(scheduleTimer); };
  }, [loadState, loadLogs, loadSchedules]);

  const act = async (action, owner) => {
    const key = owner ? `${action}-${owner}` : action;
    setBusy(key);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/mqtt-control", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action, owner }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The MQTT request failed.");
      setNotice(data.message || "Request accepted.");
      await loadState(true);
    } catch (actionError) {
      setError(actionError.message || "The MQTT request failed.");
      await loadState(true);
    } finally {
      setBusy("");
    }
  };

  const scheduleStart = async (event) => {
    event.preventDefault();
    setBusy("schedule"); setError(""); setNotice("");
    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Enter a valid date and time.");
      const response = await fetch("/api/admin/mqtt-schedules", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ owner: scheduleOwner, scheduledAt: scheduledAt.toISOString() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not schedule the MQTT start.");
      setNotice(`${data.message} It runs only if ${scheduleOwner}’s laptop controller is online at that time.`);
      await loadSchedules();
    } catch (scheduleError) { setError(scheduleError.message || "Could not schedule the MQTT start."); }
    finally { setBusy(""); }
  };

  const cancelSchedule = async (id) => {
    setBusy(`cancel-${id}`); setError("");
    try {
      const response = await fetch("/api/admin/mqtt-schedules", { method: "DELETE", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not cancel the scheduled start.");
      setNotice(data.message); await loadSchedules();
    } catch (cancelError) { setError(cancelError.message || "Could not cancel the scheduled start."); }
    finally { setBusy(""); }
  };

  const state = snapshot?.state;
  const activeLease = Boolean(state?.is_mqtt_on && state?.lease_until && new Date(state.lease_until).getTime() > Date.now());
  const serviceRows = state?.runtime_details?.services || [];

  return (
    <section className="space-y-5" aria-labelledby="mqtt-server-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="mqtt-server-heading" className="text-xl font-black tracking-tight text-text sm:text-2xl">MQTT server</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-text-muted">One laptop holds the database lease at a time. A start request only works while its background controller and Docker are available.</p>
        </div>
        <button type="button" onClick={() => { void loadState(); void loadLogs(); void loadSchedules(); }} disabled={refreshing} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-border bg-card px-3 text-xs font-black text-text hover:border-accent/60 disabled:opacity-50 sm:self-auto">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-xs font-semibold leading-5 text-red-600 dark:text-red-300">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold leading-5 text-emerald-700 dark:text-emerald-300">{notice}</div>}

      {!snapshot?.configured ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm font-semibold text-text-muted">Configure the MQTT discovery project credentials on the VikaTech server, then reload this page.</div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${activeLease ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-border bg-card-alt text-text-muted"}`}><Radio size={20} /></span>
                  <div>
                    <h3 className="text-base font-black text-text">{activeLease ? (state?.server_started_at ? "Server is running" : "Docker stack is starting") : state?.desired_run ? "Waiting for a laptop" : "Server stopped"}</h3>
                    <p className="mt-0.5 text-[11px] font-semibold text-text-muted">{activeLease ? `Owned by ${state.owner_name}` : state?.desired_run ? "No laptop has claimed the start request" : "Start it here or turn on automatic startup from an online laptop"}</p>
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${activeLease ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-border bg-background text-text-muted"}`}>{activeLease ? (state?.server_started_at ? "RUNNING" : "STARTING") : "OFFLINE"}</span>
              </div>

              <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-2">
                <div><dt className="text-[10px] font-black uppercase tracking-wider text-text-muted">Started by</dt><dd className="mt-1 text-sm font-bold text-text">{state?.owner_name || "—"}</dd></div>
                <div><dt className="text-[10px] font-black uppercase tracking-wider text-text-muted">Running on device</dt><dd className="mt-1 break-all text-sm font-bold text-text">{state?.owner_device || "—"}</dd></div>
                <div><dt className="text-[10px] font-black uppercase tracking-wider text-text-muted">Last heartbeat</dt><dd className="mt-1 text-xs font-semibold text-text">{localTime(state?.heartbeat_at)}</dd></div>
                <div><dt className="text-[10px] font-black uppercase tracking-wider text-text-muted">Lease expires</dt><dd className="mt-1 text-xs font-semibold text-text">{localTime(state?.lease_until)}</dd></div>
                <div><dt className="text-[10px] font-black uppercase tracking-wider text-text-muted">Docker stack started</dt><dd className="mt-1 text-xs font-semibold text-text">{localTime(state?.server_started_at)}</dd></div>
                <div><dt className="text-[10px] font-black uppercase tracking-wider text-text-muted">Selected startup laptop</dt><dd className="mt-1 text-sm font-bold text-text">{state?.owner_name || state?.requested_owner || "First online laptop"}</dd></div>
              </dl>

              {snapshot?.backendUrl && <a className="mt-4 inline-flex items-center gap-1.5 break-all text-xs font-bold text-accent underline underline-offset-4" href={`${snapshot.backendUrl.replace(/\/+$/, "")}/api/status`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Current MQTT backend</a>}

              <div className="mt-5 border-t border-border pt-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-black text-text"><Server size={14} className="text-accent" /> Docker services</div>
                {serviceRows.length ? <div className="flex flex-wrap gap-2">{serviceRows.map((service, index) => <span key={`${service.service || "service"}-${index}`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-text"><span className={`h-1.5 w-1.5 rounded-full ${/running/i.test(service.state || "") ? "bg-emerald-500" : "bg-amber-500"}`} />{service.service || "container"}<span className="text-text-muted">{service.state || "unknown"}{service.health ? ` · ${service.health}` : ""}</span></span>)}</div> : <p className="text-xs font-medium text-text-muted">No running container details have been reported yet.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-sm font-black text-text">Start or stop the server</h3>
              <p className="mt-1 text-xs leading-5 text-text-muted">The first controller to claim the database lease wins. If the other laptop already owns it, the request is declined.</p>
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={() => void act("start", "hemanth")} disabled={Boolean(busy) || activeLease || !snapshot?.configured} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-[var(--btn-text)] shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"><Play size={14} />{busy === "start-hemanth" ? "Requesting…" : "Start on Hemanth’s laptop"}</button>
                <button type="button" onClick={() => void act("start", "lrv")} disabled={Boolean(busy) || activeLease || !snapshot?.configured} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-black text-text hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"><Play size={14} />{busy === "start-lrv" ? "Requesting…" : "Start on LRV’s laptop"}</button>
                <button type="button" onClick={() => void act("stop")} disabled={Boolean(busy) || (!activeLease && !state?.desired_run)} className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 text-xs font-black text-red-600 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300"><Square size={13} />{busy === "stop" ? "Stopping…" : "Stop MQTT server"}</button>
              </div>
              <p className="mt-4 flex items-start gap-2 text-[10px] font-medium leading-4 text-text-muted"><Clock3 size={13} className="mt-0.5 shrink-0" />The owner renews its lease every few seconds. If that laptop or its internet connection fails, the other controller waits for the lease to expire before taking over.</p>
            </div>
          </div>

          <section className="grid gap-4 lg:grid-cols-[minmax(280px,.75fr)_minmax(0,1.25fr)]">
            <form onSubmit={scheduleStart} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center gap-2"><Clock3 size={16} className="text-accent" /><h3 className="text-sm font-black text-text">Schedule a one-time start</h3></div>
              <p className="mt-1 text-xs leading-5 text-text-muted">Choose the laptop, date, and local time. The defaults are set to the current date and time.</p>
              <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-text-muted" htmlFor="mqtt-schedule-owner">Laptop to start</label>
              <AppSelect id="mqtt-schedule-owner" value={scheduleOwner} onChange={(event) => setScheduleOwner(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-text outline-none focus:border-accent"><option value="hemanth">Hemanth’s laptop</option><option value="lrv">LRV’s laptop</option></AppSelect>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-black uppercase tracking-wider text-text-muted" htmlFor="mqtt-schedule-date">Date</label><input id="mqtt-schedule-date" type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} required className="mt-1.5 min-h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-text outline-none focus:border-accent" /></div>
                <div><label className="block text-[10px] font-black uppercase tracking-wider text-text-muted" htmlFor="mqtt-schedule-time">Time</label><input id="mqtt-schedule-time" type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} required className="mt-1.5 min-h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-text outline-none focus:border-accent" /></div>
              </div>
              <button type="submit" disabled={Boolean(busy)} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 text-xs font-black text-accent hover:bg-accent/15 disabled:opacity-50"><Clock3 size={14} />{busy === "schedule" ? "Saving…" : "Save scheduled start"}</button>
              <p className="mt-3 text-[10px] font-medium leading-4 text-text-muted">If the selected laptop is asleep or offline when the time arrives, this start is marked missed and does not run later.</p>
            </form>
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-sm font-black text-text">Scheduled starts</h3>
              <div className="mt-3 divide-y divide-border">
                {schedules.length ? schedules.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="text-xs font-bold text-text">{item.owner_name === "lrv" ? "LRV’s laptop" : "Hemanth’s laptop"} <span className="font-medium text-text-muted">· {localTime(item.scheduled_at)}</span></p><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-text-muted">{item.status.replaceAll("_", " ")}</p></div>{item.status === "pending" && <button type="button" onClick={() => void cancelSchedule(item.id)} disabled={Boolean(busy)} className="min-h-8 rounded-lg border border-border px-3 text-[10px] font-black text-text hover:border-red-400/50 hover:text-red-500 disabled:opacity-50">{busy === `cancel-${item.id}` ? "Cancelling…" : "Cancel"}</button>}</div>) : <p className="py-7 text-center text-xs font-semibold text-text-muted">No scheduled starts yet.</p>}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2"><Terminal size={15} className="text-accent" /><h3 className="text-sm font-black text-text">MQTT server logs</h3><span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-text-muted">{logs.length} recent</span></div>
              <button type="button" onClick={() => void loadLogs()} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[10px] font-black text-text hover:border-accent/60"><Activity size={12} />Refresh logs</button>
            </div>
            {logsError ? <div role="status" className="px-4 py-4 text-xs font-semibold leading-5 text-amber-700 dark:text-amber-300">{logsError}</div> : logs.length ? <div className="max-h-[440px] overflow-auto"><table className="w-full min-w-[640px] text-left"><thead className="sticky top-0 bg-card-alt text-[10px] uppercase tracking-wider text-text-muted"><tr><th className="px-4 py-2.5 font-black">Time</th><th className="px-3 py-2.5 font-black">Level</th><th className="px-3 py-2.5 font-black">Event</th><th className="px-4 py-2.5 font-black">Details</th></tr></thead><tbody>{[...logs].reverse().map((item, index) => <tr key={`${item.ts}-${index}`} className="border-t border-border/70 align-top"><td className="whitespace-nowrap px-4 py-2.5 text-[10px] font-medium text-text-muted">{localTime(item.ts)}</td><td className="px-3 py-2.5 text-[10px] font-black uppercase text-text">{item.level}</td><td className="max-w-[220px] break-words px-3 py-2.5 text-[11px] font-bold text-text">{item.event}</td><td className="max-w-[420px] break-words px-4 py-2.5 font-mono text-[10px] leading-4 text-text-muted">{item.line}</td></tr>)}</tbody></table></div> : <div className="px-4 py-10 text-center text-xs font-semibold text-text-muted">{refreshing ? <><LoaderCircle size={16} className="mx-auto mb-2 animate-spin" />Loading MQTT logs…</> : "No log entries are available yet."}</div>}
          </section>
        </>
      )}
    </section>
  );
}
