"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/admin";
import {
  ArrowLeft, Check, CheckCircle2, ChevronRight, Clock3, Cpu, ExternalLink,
  LoaderCircle, LockKeyhole, RefreshCw, RotateCcw, ShieldAlert, Wifi, X, Zap,
} from "lucide-react";

const API = "/api/admin/hardware";
const UPDATE_STEPS = ["Validate", "Save settings", "Deliver", "Apply on ESP32", "Verify online"];
const RESTART_STEPS = ["Validate board", "Queue restart", "Restart ESP32", "Verify reconnect"];

function statusLabel(board) {
  if (!board.provisioned) return { label: "Provisioning needed", tone: "border-amber-400/40 bg-amber-400/10 text-amber-500" };
  if (board.online) return { label: "Online", tone: "border-emerald-400/40 bg-emerald-400/10 text-emerald-500" };
  return { label: "Offline", tone: "border-red-400/40 bg-red-400/10 text-red-500" };
}
function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function relativeSeen(value) {
  if (!value) return "Never connected";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Seen " + seconds + "s ago";
  if (seconds < 3600) return "Seen " + Math.floor(seconds / 60) + "m ago";
  return "Seen " + Math.floor(seconds / 3600) + "h ago";
}

export default function AdminHardwarePage() {
  const [user, setUser] = useState(null);
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [wifiSSID, setWifiSSID] = useState("");
  const [wifiSecurity, setWifiSecurity] = useState("wpa2_psk");
  const [wifiPassword, setWifiPassword] = useState("");
  const [tracking, setTracking] = useState(null);
  const [trackState, setTrackState] = useState({ status: "idle", step: 0, message: "" });
  const [lastRefresh, setLastRefresh] = useState(null);
  const [meshSSID, setMeshSSID] = useState("");
  const [meshPassword, setMeshPassword] = useState("");
  const router = useRouter();
  const refreshRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (refreshRef.current) return;
    refreshRef.current = true;
    if (!silent) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      if (!session || !isAdminEmail(session.user.email)) {
        setBoards([]);
        setError("Admin access is required.");
        return;
      }
      const response = await fetch(API, {
        cache: "no-store",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load hardware devices.");
      setBoards(json.boards || []);
      setLastRefresh(new Date());
      setError("");
    } catch (err) {
      setError(err.message || "Could not load hardware devices.");
    } finally {
      refreshRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!tracking?.commandId || !user || !isAdminEmail(user.email)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const response = await fetch(API + "/commands/" + tracking.commandId, {
          cache: "no-store",
          headers: { Authorization: "Bearer " + session.access_token },
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not read command status.");
        if (cancelled) return;
        const command = json.command;
        const restart = tracking.commandType === "restart";
        const steps = restart ? RESTART_STEPS : UPDATE_STEPS;

        if (command.status === "failed" || command.status === "expired") {
          setTrackState({
            status: "failed",
            step: steps.length - 1,
            message: command.result?.message || (command.status === "expired" ? "The command expired before completion." : "The ESP32 reported a failure."),
          });
          return;
        }

        if (restart) {
          if (command.status === "completed" && json.deviceOnline && json.lastBootAt && new Date(json.lastBootAt) >= new Date(command.created_at)) {
            setTrackState({ status: "completed", step: steps.length - 1, message: "A new ESP32 boot was reported and the board is online." });
            void load(true);
            return;
          }
          const step = command.status === "queued" ? 1 : command.status === "accepted" ? 2 : 1;
          setTrackState({
            status: "running",
            step,
            message: command.status === "queued"
              ? "Restart command is queued. Waiting for the board to receive it."
              : json.deviceOnline
                ? "The board accepted the restart command. Waiting for it to boot again."
                : "The board is restarting or reconnecting. Waiting for its next heartbeat.",
          });
          return;
        }

        if (command.status === "completed" &&
            json.deviceOnline &&
            Number(json.lastAppliedConfigVersion) >= Number(tracking.expectedVersion)) {
          setTrackState({ status: "completed", step: steps.length - 1, message: "The ESP32 acknowledged the configuration and is reporting online with the expected version." });
          void load(true);
          return;
        }
        const step = command.status === "queued" ? 2 : command.status === "accepted" ? 3 : command.status === "completed" ? 4 : 1;
        setTrackState({
          status: "running",
          step: Math.min(step, steps.length - 1),
          message: command.status === "queued"
            ? "Settings are saved. Waiting for the ESP32 to receive the update."
            : command.status === "accepted"
              ? "The ESP32 received the command and is applying the new settings."
              : "The device reported completion. Verifying its next heartbeat and applied version.",
        });
      } catch (err) {
        if (!cancelled) setTrackState((current) => ({ ...current, status: "running", message: err.message || "Temporarily unable to read progress; retrying automatically." }));
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [tracking, user, load]);

  const openConfig = (board) => {
    if (!board.provisioned) {
      setNotice("This board needs the one-time secure provisioning firmware before remote settings can be changed.");
      return;
    }
    setSelected(board);
    setMode("config");
    setWifiSSID(board.wifiSSID || "");
    setWifiSecurity(board.wifiSecurity || "wpa2_psk");
    setWifiPassword("");
    setTracking(null);
    setTrackState({ status: "idle", step: 0, message: "" });
  };

  const startUpdate = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    if (!wifiSSID.trim() || wifiSSID.trim().length > 32) {
      setNotice("Wi-Fi name is required and must be 1–32 characters.");
      return;
    }
    if (wifiSecurity === "wpa2_psk" && wifiPassword && (wifiPassword.length < 8 || wifiPassword.length > 63)) {
      setNotice("WPA2-PSK passwords must be 8–63 characters.");
      return;
    }
    if (wifiSecurity === "wpa2_psk" && selected.wifiSecurity === "open" && !wifiPassword) {
      setNotice("Enter a password when switching from an open network to WPA2-PSK.");
      return;
    }

    setBusy(true);
    setMode("tracking");
    setTrackState({ status: "running", step: 0, message: "Validating fields and saving an encrypted configuration." });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch(API + "/" + selected.id + "/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ wifiSSID: wifiSSID.trim(), wifiSecurity, wifiPassword }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not queue configuration update.");
      router.push("/admin/hardware/track/" + json.commandId + "?type=config&version=" + json.configVersion);
      void load(true);
    } catch (err) {
      setTrackState({ status: "failed", step: 0, message: err.message || "Configuration update failed." });
    } finally {
      setBusy(false);
    }
  };

  const downloadFirmware = (firmware, fileName) => {
    const blob = new Blob([firmware], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "vikatech-esp32.cpp";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const requestProvisioning = async (board, suppliedMesh = null) => {
    setSelected(board);
    setBusy(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch(API + "/" + board.id + "/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify(suppliedMesh || {}),
      });
      const json = await response.json();
      if (response.status === 409 && json.code === "MESH_SETTINGS_REQUIRED" && !suppliedMesh) {
        setMeshSSID("");
        setMeshPassword("");
        setMode("provisionSettings");
        setNotice(json.error || "Enter the current mesh network details to preserve the installed mesh.");
        return;
      }
      if (!response.ok || !json.firmware) throw new Error(json.error || "Could not generate secure firmware.");
      downloadFirmware(json.firmware, json.fileName);
      setMode(null);
      setSelected(null);
      setNotice("Secure provisioning firmware downloaded. Compile and flash it once to this ESP32; remote updates and restarts will enable after its next authenticated heartbeat.");
    } catch (err) {
      setError(err.message || "Could not generate secure firmware.");
    } finally {
      setBusy(false);
    }
  };

  const submitProvisioningSettings = async (event) => {
    event.preventDefault();
    if (!selected) return;
    if (!meshSSID.trim() || meshSSID.trim().length > 32 || meshPassword.length < 8 || meshPassword.length > 63) {
      setNotice("Enter the current mesh SSID (1–32 characters) and mesh password (8–63 characters).");
      return;
    }
    await requestProvisioning(selected, { meshSSID: meshSSID.trim(), meshPassword });
  };

  const requestRestart = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setMode("tracking");
    setTrackState({ status: "running", step: 0, message: "Checking the selected board and queueing a restart." });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch(API + "/" + selected.id + "/restart", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not queue ESP32 restart.");
      router.push("/admin/hardware/track/" + json.commandId + "?type=restart");

    } catch (err) {
      setTrackState({ status: "failed", step: 0, message: err.message || "Restart request failed." });
    } finally {
      setBusy(false);
    }
  };

  const closeModal = () => {
    setMode(null);
    setSelected(null);
    setTracking(null);
    setTrackState({ status: "idle", step: 0, message: "" });
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-background px-4 text-text"><div className="text-center"><LoaderCircle size={36} className="mx-auto animate-spin text-accent" /><p className="mt-4 text-sm font-bold">Loading hardware fleet…</p></div></main>;
  if (!user || !isAdminEmail(user.email)) return <main className="min-h-screen bg-background px-4 py-16 text-center text-text"><ShieldAlert size={36} className="mx-auto text-red-500" /><h1 className="mt-4 text-2xl font-black">Admin access required</h1><Link className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold" href="/">Back to main site</Link></main>;

  return (
    <main className="min-h-screen overflow-x-hidden bg-background px-3 pb-16 pt-5 text-text sm:px-6 sm:pt-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-accent"><Cpu size={14} /> VikaTech hardware management</p>
            <h1 className="text-2xl font-black tracking-tight sm:text-4xl">ESP32 Device Fleet</h1>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-text-muted sm:text-sm">Manage board configuration, restart one selected ESP32, and verify its next heartbeat. Device cards refresh every 15 seconds.</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
            <button onClick={() => load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-black hover:border-accent/50"><RefreshCw size={14} /> Refresh fleet</button>
            <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-black text-[var(--btn-text)] hover:bg-accent-hover"><ArrowLeft size={14} /> Back to main site</Link>
          </div>
        </header>

        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-accent/10 p-2 text-accent"><ShieldAlert size={20} /></div><div><h2 className="text-sm font-black">Remote restart safety</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted">Restart is a software reboot of the selected ESP32, similar to pressing EN. It is not a power cut. The tracker reports success only after a new boot and online heartbeat are observed.</p></div></div>
          <p className="shrink-0 text-[10px] font-semibold text-text-muted">{lastRefresh ? "Last refresh " + lastRefresh.toLocaleTimeString("en-IN") : "Connecting…"}</p>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-500">{error}<button onClick={() => load()} className="ml-3 underline">Retry</button></div>}
        {notice && <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs font-semibold text-amber-600"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss" className="shrink-0"><X size={14} /></button></div>}

        {boards.length === 0 ? <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center sm:p-14"><Cpu className="mx-auto text-text-muted" size={30} /><h2 className="mt-4 text-lg font-black">No boards registered</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted">Boards will appear here after a customer adds them to their VikaTech account.</p><Link href="/admin" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-black">Back to Admin Center <ChevronRight size={14} /></Link></section> :
          <section className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {boards.map((board) => {
              const badge = statusLabel(board);
              const command = board.latestCommand;
              return <article key={board.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-accent/20 bg-accent/10 p-2.5 text-accent"><Cpu size={22} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-base font-black">{board.name || "ESP32 board"}</h2><span className={"rounded-full border px-2 py-1 text-[9px] font-black " + badge.tone}>{badge.label}</span></div>
                      <p className="mt-1 break-all font-mono text-[10px] text-text-muted">{board.board_identifier}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-background p-3">
                    <p className="break-all text-xs font-black">{board.ownerEmail}</p>
                    <p className="mt-1 text-[10px] text-text-muted">{(board.devices || []).length} relay records · {relativeSeen(board.lastSeenAt)}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="min-w-0 rounded-lg border border-border p-2"><p className="text-text-muted">Configuration</p><p className="mt-1 font-black">v{board.lastAppliedConfigVersion}/{board.configVersion}</p></div>
                      <div className="min-w-0 rounded-lg border border-border p-2"><p className="text-text-muted">Wi-Fi</p><p className="mt-1 break-words font-black">{board.wifiSSID || "Not configured"}</p></div>
                    </div>
                    {board.lastIP && <p className="mt-2 break-all text-[10px] text-text-muted">IP {board.lastIP}</p>}
                    {board.lastError && <p className="mt-2 break-words text-[10px] font-semibold text-amber-500">{board.lastError}</p>}
                  </div>
                </div>
                {!board.provisioned ? <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-600"><LockKeyhole size={16} className="mt-0.5 shrink-0" /><p><b>One-time firmware setup required.</b> This board has not authenticated to the secure device API. Install the new provisioning firmware once; future Wi-Fi changes and restarts will not require reflashing.</p></div>
                  <button disabled={busy} onClick={() => requestProvisioning(board)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-3 text-xs font-black text-[var(--btn-text)] disabled:opacity-50"><LockKeyhole size={14} /> {busy && selected?.id === board.id ? "Preparing secure firmware…" : "Generate one-time secure firmware"}</button>
                  <p className="mt-2 text-[10px] leading-4 text-text-muted">This is a one-time migration. Confirm the existing mesh SSID/password if the server has no matching provisioning record. Do not guess these values.</p>
                </div> : <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 sm:p-5">
                  <button onClick={() => openConfig(board)} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-black hover:border-accent/50"><Wifi size={14} /> Update Wi-Fi</button>
                  <button disabled={!board.online} onClick={() => { setSelected(board); setMode("restartConfirm"); setTracking(null); setTrackState({ status: "idle", step: 0, message: "" }); }} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl bg-red-500/10 px-3 py-3 text-xs font-black text-red-500 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={14} /> Restart ESP32</button>
                  {!board.online && <p className="col-span-full text-[10px] text-text-muted">Restart is disabled while the board is offline.</p>}
                </div>}
                {command && <div className="border-t border-border px-4 py-3 sm:px-5"><p className="text-[9px] font-black uppercase tracking-wider text-text-muted">Latest command</p><p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold"><span>{command.command_type === "restart" ? "Restart" : "Configuration update"}</span><span className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase">{command.status}</span><span className="text-[10px] font-normal text-text-muted">{formatDate(command.created_at)}</span></p></div>}
              </article>;
            })}
          </section>
        }
      </div>

      {mode && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={closeModal}>
        <section className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-card p-4 shadow-2xl sm:rounded-3xl sm:p-6 lg:p-8" onClick={(event) => event.stopPropagation()}>
          <header className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">ESP32 remote management</p><h2 className="mt-2 break-words text-xl font-black sm:text-2xl">{mode === "config" ? "Update device configuration" : mode === "provisionSettings" ? "Preserve mesh settings" : mode === "restartConfirm" ? "Restart this ESP32?" : "ESP32 remote management"}</h2><p className="mt-1 break-all text-[10px] text-text-muted">{selected?.name} · {selected?.board_identifier}</p></div>
            <button onClick={closeModal} aria-label="Close dialog" className="shrink-0 rounded-lg border border-border p-2 text-text-muted hover:text-text"><X size={16} /></button>
          </header>

          {mode === "provisionSettings" && <form onSubmit={submitProvisioningSettings} className="space-y-4">
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-600">These must match the currently installed leader mesh network exactly. Changing them here may disconnect existing mesh members. This is only to preserve the network during the one-time security firmware update.</div>
            <div><label htmlFor="mesh-ssid" className="mb-1.5 block text-xs font-black">Current mesh Wi-Fi name (SSID) <span className="text-red-500">*</span></label><input id="mesh-ssid" value={meshSSID} onChange={(event) => setMeshSSID(event.target.value)} maxLength={32} required className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent" placeholder="Read from the currently installed firmware" /></div>
            <div><label htmlFor="mesh-password" className="mb-1.5 block text-xs font-black">Current mesh password <span className="text-red-500">*</span></label><input id="mesh-password" value={meshPassword} onChange={(event) => setMeshPassword(event.target.value)} type="password" minLength={8} maxLength={63} required autoComplete="new-password" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent" placeholder="Exact current mesh passphrase" /></div>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={closeModal} className="rounded-xl border border-border px-4 py-3 text-xs font-black">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-black text-[var(--btn-text)] disabled:opacity-50"><Cpu size={14} /> {busy ? "Generating…" : "Generate firmware"}</button></div>
          </form>}

          {mode === "config" && <form onSubmit={startUpdate} className="space-y-4">
            <div><label htmlFor="wifi-ssid" className="mb-1.5 block text-xs font-black">Wi-Fi network name (SSID) <span className="text-red-500">*</span></label><input id="wifi-ssid" value={wifiSSID} onChange={(event) => setWifiSSID(event.target.value)} maxLength={32} required autoComplete="off" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent" placeholder="Customer Wi-Fi name" /><p className="mt-1 text-[10px] text-text-muted">Required · 1–32 characters</p></div>
            <div><label htmlFor="wifi-security" className="mb-1.5 block text-xs font-black">Wi-Fi security <span className="text-red-500">*</span></label><select id="wifi-security" value={wifiSecurity} onChange={(event) => setWifiSecurity(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent"><option value="open">None — Open Network</option><option value="wpa2_psk">WPA2-PSK</option></select></div>
            {wifiSecurity === "wpa2_psk" && <div><label htmlFor="wifi-password" className="mb-1.5 block text-xs font-black">Wi-Fi password {selected?.wifiSecurity === "open" ? <span className="text-red-500">*</span> : <span className="text-text-muted">(leave blank to keep existing)</span>}</label><input id="wifi-password" type="password" value={wifiPassword} onChange={(event) => setWifiPassword(event.target.value)} autoComplete="new-password" minLength={selected?.wifiSecurity === "open" ? 8 : undefined} maxLength={63} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-accent" placeholder={selected?.wifiSecurity === "open" ? "Enter 8–63 characters" : "Enter a new password or leave blank"} /><p className="mt-1 text-[10px] text-text-muted">The saved password is encrypted and is never returned to the browser.</p></div>}
            {wifiSecurity === "open" && <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-600">Open Wi-Fi has no password and is less secure. Selecting this will clear the stored Wi-Fi password.</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={closeModal} className="rounded-xl border border-border px-4 py-3 text-xs font-black">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-black text-[var(--btn-text)] disabled:opacity-50"><Wifi size={14} /> {busy ? "Saving…" : "Save and update ESP32"}</button></div>
          </form>}

          {mode === "restartConfirm" && <div className="space-y-5">
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4"><div className="flex gap-3"><ShieldAlert size={20} className="shrink-0 text-red-500" /><div><p className="text-sm font-black">This restarts only the selected board.</p><p className="mt-1 text-xs leading-5 text-text-muted">Relay outputs may briefly be unavailable. This sends a software restart command similar to pressing EN; it does not disconnect board power. Do not restart while an installation is in a safety-critical state.</p></div></div></div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={closeModal} className="rounded-xl border border-border px-4 py-3 text-xs font-black">Cancel</button><button onClick={requestRestart} disabled={busy || !selected?.online} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-xs font-black text-white disabled:opacity-50"><RotateCcw size={14} /> {busy ? "Queueing…" : "Confirm restart"}</button></div>
          </div>}

          {mode === "tracking" && <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
              <div className="mb-5 flex items-center gap-3"><div className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl " + (trackState.status === "completed" ? "bg-emerald-500/10 text-emerald-500" : trackState.status === "failed" ? "bg-red-500/10 text-red-500" : "bg-accent/10 text-accent")}>{trackState.status === "completed" ? <CheckCircle2 size={25} /> : trackState.status === "failed" ? <ShieldAlert size={25} /> : <LoaderCircle size={25} className="animate-spin" />}</div><div className="min-w-0"><h3 className="text-sm font-black">{trackState.status === "completed" ? "Update successful" : trackState.status === "failed" ? "Update needs attention" : "Working with the ESP32"}</h3><p className="mt-1 text-xs leading-5 text-text-muted">{trackState.message || "Waiting for the next device status event…"}</p></div></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(tracking?.commandType === "restart" ? RESTART_STEPS : UPDATE_STEPS).map((step, index, steps) => {
                  const done = trackState.status === "completed" || index < trackState.step;
                  const current = trackState.status === "running" && index === trackState.step;
                  return <div key={step} className="min-w-0 rounded-xl border border-border p-2.5 sm:p-3"><div className={"mb-2 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black " + (done ? "bg-emerald-500 text-white" : current ? "bg-accent text-[var(--btn-text)] animate-pulse" : "bg-card text-text-muted")}>{done ? <Check size={13} /> : index + 1}</div><p className="break-words text-[10px] font-bold leading-4">{step}</p></div>;
                })}
              </div>
            </div>
            {trackState.status === "running" && <div className="rounded-xl border border-border p-3 text-xs text-text-muted"><div className="flex items-center gap-2"><LoaderCircle size={14} className="animate-spin text-accent" /><span>Checking command status every 2 seconds. Keep this page open while it completes.</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full w-1/2 animate-pulse rounded-full bg-accent" /></div></div>}
            {trackState.status === "failed" && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs leading-5 text-red-500">{trackState.message}</div>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => { setTracking(null); setMode(tracking?.commandType === "restart" ? "restartConfirm" : "config"); setTrackState({ status: "idle", step: 0, message: "" }); }} className="rounded-xl border border-border px-4 py-3 text-xs font-black">{trackState.status === "failed" ? "Back to settings" : "Keep tracking"}</button><button onClick={() => { closeModal(); void load(true); }} className="rounded-xl bg-accent px-4 py-3 text-xs font-black text-[var(--btn-text)]">{trackState.status === "completed" ? "Done" : "Close tracker"}</button></div>
          </div>}
        </section>
      </div>}
    </main>
  );
}
