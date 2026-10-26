"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Activity, AlertCircle, CheckCircle2, CircleHelp, Clock3, Cpu, Download,
  LoaderCircle, Power, RefreshCw, Settings2, Wifi, WifiOff,
} from "lucide-react";

function ago(value) {
  if (!value) return "Never connected";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  return Math.floor(seconds / 3600) + "h ago";
}

export default function DeviceFleet() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState({});
  const [restartByBoard, setRestartByBoard] = useState({});
  const [provisioningInfoByBoard, setProvisioningInfoByBoard] = useState({});
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setAccessToken(session?.access_token || "");
      if (!session?.access_token) {
        setLoading(false);
        setNotice("Your admin session expired. Sign in again.");
      }
    });
    return () => { active = false; };
  }, []);

  const loadDevices = useCallback(async (silent = false) => {
    if (!accessToken) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/admin/devices", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load hardware fleet");
      setDevices(data.devices || []);
      if (data.migrationRequired) setNotice("Apply supabase/device_management.sql before using remote device management.");
    } catch (error) {
      setNotice(error.message || "Could not load hardware fleet");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    loadDevices();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadDevices(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [accessToken, loadDevices]);

  useEffect(() => {
    const boardIds = Object.entries(restartByBoard)
      .filter(([, info]) => info?.polling)
      .map(([boardId]) => boardId);
    if (!accessToken || !boardIds.length) return;
    let active = true;
    const poll = async () => {
      await Promise.all(boardIds.map(async (boardId) => {
        try {
          const response = await fetch("/api/admin/devices/" + boardId + "/restart", {
            cache: "no-store",
            headers: { Authorization: "Bearer " + accessToken },
          });
          const data = await response.json();
          if (!response.ok || !active) return;
          const command = (data.commands || []).find((item) =>
            item.id === restartByBoard[boardId]?.commandId
          );
          if (!command || !active) return;
          const terminal = ["completed", "failed", "cancelled"].includes(command.status);
          const startedAt = restartByBoard[boardId]?.startedAt || Date.now();
          if (!terminal && Date.now() - startedAt > 120000) {
            setRestartByBoard((previous) => {
              const current = previous[boardId];
              if (current?.polling === false && current?.timedOut) return previous;
              return { ...previous, [boardId]: { ...current, polling: false, timedOut: true } };
            });
            setNotice("No restart acknowledgement arrived within 2 minutes. The command remains in the audit history; check status before requesting another restart.");
            return;
          }
          setRestartByBoard((previous) => {
            const current = previous[boardId];
            const error = command.last_error || "";
            if (current && current.status === command.status && current.error === error && current.polling === !terminal) {
              return previous;
            }
            return {
              ...previous,
              [boardId]: {
                ...current,
                status: command.status,
                error,
                polling: !terminal,
              },
            };
          });
          if (terminal) {
            setNotice(command.status === "completed"
              ? "ESP32 restarted and checked in successfully."
              : command.status === "failed"
                ? (command.last_error || "The ESP32 reported a restart failure.")
                : (command.last_error || "Restart request expired or was cancelled."));
            loadDevices(true);
          }
        } catch {
          // Keep the last status visible during a temporary network interruption.
        }
      }));
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [accessToken, restartByBoard, loadDevices]);

  const restartDevice = async (device) => {
    if (!device.provisioned) {
      setNotice("Prepare and flash the device-agent firmware once before requesting a remote restart.");
      return;
    }
    const meshOnly = !device.config.directOnline && Boolean(device.config.meshOnline);
    if (!device.config.directOnline && !meshOnly) {
      setNotice("This ESP32 has no recent direct check-in or live mesh-gateway observation. Reconnect it before sending a restart request.");
      return;
    }
    const deliveryNote = meshOnly
      ? "\n\nThis board is reachable through its mesh leader. The signed restart request will target this board identifier only, and success requires the member to rejoin the mesh."
      : "";
    const approved = window.confirm(
      "Restart " + device.name + "?\n\nThis will briefly disconnect the ESP32 and its attached relay channels. Use this only when a software restart is safe for the connected equipment." + deliveryNote
    );
    if (!approved) return;

    setBusy((current) => ({ ...current, [device.id]: "restart" }));
    setNotice("");
    try {
      const response = await fetch("/api/admin/devices/" + device.id + "/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue restart");
      setRestartByBoard((previous) => ({
        ...previous,
        [device.id]: { commandId: data.command.id, status: data.command.status, polling: true, startedAt: Date.now(), timedOut: false, error: "" },
      }));
      setNotice(data.deliveryMode === "mesh_gateway"
        ? "Restart queued through the mesh leader. Waiting for the selected member to reboot and rejoin."
        : "Restart queued. Waiting for the ESP32 to acknowledge and reconnect.");
    } catch (error) {
      setNotice(error.message || "Could not queue restart");
    } finally {
      setBusy((current) => ({ ...current, [device.id]: "" }));
    }
  };

  const checkRestartStatus = async (device) => {
    const current = restartByBoard[device.id];
    if (!current?.commandId || !accessToken) return;
    setBusy((previous) => ({ ...previous, [device.id]: "check-restart" }));
    try {
      const response = await fetch("/api/admin/devices/" + device.id + "/restart", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check restart status");
      const command = (data.commands || []).find((item) => item.id === current.commandId);
      if (!command) throw new Error("The restart command is not in the latest history.");
      const terminal = ["completed", "failed", "cancelled"].includes(command.status);
      setRestartByBoard((previous) => ({
        ...previous,
        [device.id]: {
          ...previous[device.id],
          status: command.status,
          error: command.last_error || "",
          polling: !terminal && !previous[device.id]?.timedOut,
        },
      }));
      if (terminal) {
        setNotice(command.status === "completed"
          ? "ESP32 restart completed and the device acknowledged its return."
          : command.status === "failed"
            ? (command.last_error || "ESP32 reported a restart failure.")
            : (command.last_error || "Restart request expired or was cancelled."));
        loadDevices(true);
      } else {
        setNotice("Latest status: " + command.status + ". The command is still non-terminal; do not queue another restart unless you have reviewed the audit history.");
      }
    } catch (error) {
      setNotice(error.message || "Could not check restart status");
    } finally {
      setBusy((previous) => ({ ...previous, [device.id]: "" }));
    }
  };

  const provisionDevice = async (device) => {
    const approved = window.confirm(
      "Prepare one-time enrollment firmware for " + device.name + "?\n\nThe downloaded file must be flashed to the ESP32 once over USB. After enrollment, Wi-Fi changes and software restart requests can be sent remotely."
    );
    if (!approved) return;
    setBusy((current) => ({ ...current, [device.id]: "provision" }));
    setNotice("");
    try {
      const response = await fetch("/api/admin/devices/" + device.id + "/provision", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare enrollment firmware");
      const blob = new Blob([data.firmware], { type: "text/x-c++src;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.fileName || (device.boardIdentifier + ".cpp");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setProvisioningInfoByBoard((previous) => ({
        ...previous,
        [device.id]: {
          meshSsid: data.meshSsid || "",
          meshPassword: data.meshPassword || "",
          setupUrl: data.setupUrl || "http://192.168.4.1/setup",
        },
      }));
      setNotice("Enrollment firmware downloaded. Flash it once, connect your phone to the device setup Wi-Fi shown on this card, then open its local setup page.");
      await loadDevices(true);
    } catch (error) {
      setNotice(error.message || "Could not prepare enrollment firmware");
    } finally {
      setBusy((current) => ({ ...current, [device.id]: "" }));
    }
  };

  const copySetupDetails = async (device) => {
    const info = provisioningInfoByBoard[device.id];
    if (!info) return;
    const text = "VikaTech ESP32 initial setup\nWi-Fi network: " + info.meshSsid +
      "\nWi-Fi password: " + info.meshPassword +
      "\nOpen: " + info.setupUrl;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Initial setup details copied.");
    } catch {
      setNotice("Copy was blocked by the browser. Use the setup details shown on this card.");
    }
  };

  const filteredDevices = devices.filter((device) =>
    filter === "all" ||
    (filter === "online" && device.config.online) ||
    (filter === "offline" && !device.config.online) ||
    (filter === "unprovisioned" && !device.provisioned)
  );

  if (loading) {
    return <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm font-semibold text-text-muted">
      <LoaderCircle className="mx-auto mb-3 animate-spin text-accent" size={24} />Loading customer hardware…
    </div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-accent">
              <Cpu size={14} /> Device fleet
            </div>
            <h2 className="mt-2 text-xl font-black sm:text-2xl">Customer hardware</h2>
            <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-text-muted">
              Manage ESP32 boards, update Wi-Fi configuration, and request a software restart for an individual board.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={filter} onChange={(event) => setFilter(event.target.value)}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-xs font-bold outline-none focus:border-accent">
              <option value="all">All boards</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="unprovisioned">Needs enrollment</option>
            </select>
            <button onClick={() => loadDevices(true)} disabled={refreshing}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-black hover:border-accent disabled:opacity-50">
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Total boards", devices.length],
            ["Online", devices.filter((item) => item.config.online).length],
            ["Offline", devices.filter((item) => !item.config.online).length],
            ["Need enrollment", devices.filter((item) => !item.provisioned).length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-background p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-text-muted">{label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-3 text-xs font-semibold leading-5">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 break-words">{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice" className="shrink-0 px-1 text-text-muted">×</button>
        </div>
      )}

      {filteredDevices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <CircleHelp className="mx-auto text-text-muted" size={26} />
          <h3 className="mt-3 font-black">No boards in this view</h3>
          <p className="mt-1 text-xs text-text-muted">Boards appear here when they are assigned to a customer in Supabase.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filteredDevices.map((device) => {
            const restart = restartByBoard[device.id];
            const busyAction = busy[device.id];
            const needsEnrollment = !device.provisioned;
            const canManageDirectly = Boolean(device.config.directOnline);
            const meshOnly = Boolean(device.config.online && !device.config.directOnline && device.config.meshOnline);
            const canRestart = canManageDirectly || Boolean(device.config.meshOnline);
            const setupInfo = provisioningInfoByBoard[device.id];
            const versionText = device.config.version == null
              ? "Not enrolled"
              : "v" + device.config.appliedVersion + " applied / v" + device.config.version + " requested";
            return (
              <article key={device.id} className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                    <Cpu size={21} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-base font-black">{device.name || "ESP32 board"}</h3>
                      <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black uppercase " + (canManageDirectly ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-500" : meshOnly ? "border-amber-400/40 bg-amber-400/10 text-amber-600" : "border-slate-500/30 bg-slate-500/10 text-text-muted")}>
                        {canManageDirectly ? <Wifi size={11} /> : <WifiOff size={11} />}
                        {canManageDirectly ? "Online" : meshOnly ? "Mesh reachable" : "Offline"}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-[10px] text-text-muted">{device.boardIdentifier}</p>
                    <p className="mt-1 break-words text-xs font-semibold text-text-muted">{device.userEmail}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="min-w-0 rounded-xl border border-border bg-background p-3">
                    <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">Wi-Fi name</p>
                    <p className="mt-1 truncate text-xs font-bold">{device.config.wifiSsid || "Not configured"}</p>
                    <p className="mt-1 text-[10px] text-text-muted">{device.config.wifiSecurity === "open" ? "Open network" : "WPA2-PSK"}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-border bg-background p-3">
                    <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">Configuration</p>
                    <p className="mt-1 break-words text-xs font-bold">{versionText}</p>
                    <p className={"mt-1 text-[10px] font-bold " + (device.config.status === "failed" ? "text-red-500" : device.config.status === "applied" ? "text-emerald-500" : "text-text-muted")}>
                      {String(device.config.status || "unprovisioned").replaceAll("_", " ")}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-text-muted">
                  <span className="inline-flex items-center gap-1"><Clock3 size={12} /> Last check-in: {ago(device.config.lastSeenAt)}</span>
                  <span>{device.devices?.length || 0} relay channels</span>
                </div>

                {meshOnly && (
                  <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-[11px] leading-5 text-amber-600 break-words">
                    This board is visible through the local mesh, but it has not checked in directly with the device agent. Remote Wi-Fi changes and restart are paused for this board until its own secure heartbeat is fresh.
                  </div>
                )}
                {device.config.lastError && (
                  <div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/5 p-3 text-[11px] leading-5 text-red-500 break-words">
                    {device.config.lastError}
                  </div>
                )}
                {restart && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-[11px] leading-5">
                    {restart.status === "completed" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" /> : <Activity size={15} className="mt-0.5 shrink-0 text-accent" />}
                    <div className="min-w-0">
                      <p className="font-black">Restart: {restart.status || "pending"}</p>
                      <p className="break-words text-text-muted">{restart.error || (restart.status === "completed" ? "Device restarted and checked in." : restart.timedOut ? "No acknowledgement received yet. The latest command remains visible in the audit history." : "Waiting for the ESP32 acknowledgement.")}</p>
                      {restart.timedOut && (
                        <button type="button" onClick={() => checkRestartStatus(device)} disabled={Boolean(busyAction)}
                          className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-[10px] font-black disabled:opacity-50">
                          {busyAction === "check-restart" ? <LoaderCircle size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          Check restart status
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {needsEnrollment ? (
                    <button type="button" onClick={() => provisionDevice(device)} disabled={Boolean(busyAction)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-black text-[var(--btn-text)] disabled:opacity-50 sm:col-span-2">
                      {busyAction === "provision" ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
                      {busyAction === "provision" ? "Preparing firmware…" : "Prepare one-time enrollment firmware"}
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => router.push("/admin/devices/" + device.id + "/update")}
                        disabled={!canManageDirectly || Boolean(busyAction)}
                        title={!canManageDirectly ? "A fresh direct device-agent check-in is required" : "Update Wi-Fi configuration"}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-black text-[var(--btn-text)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
                        <Settings2 size={14} /> Update configuration
                      </button>
                      <button type="button" onClick={() => restartDevice(device)}
                        disabled={!canRestart || Boolean(busyAction) || restart?.polling || (restart && ["pending", "accepted"].includes(restart.status))}
                        title={!canManageDirectly && canRestart ? "Restart will be forwarded through the current mesh leader" : !canRestart ? "A recent direct check-in or live mesh gateway is required" : "Restart this exact ESP32"}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-black hover:border-red-400/60 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40">
                        {busyAction === "restart" || restart?.polling ? <LoaderCircle size={14} className="animate-spin" /> : <Power size={14} />}
                        {busyAction === "restart" ? "Queueing…" : restart?.polling ? "Restart pending…" : "Restart this ESP32"}
                      </button>
                    </>
                  )}
                </div>
                {needsEnrollment && (
                  <p className="mt-2 text-[10px] leading-4 text-text-muted">
                    Enrollment requires one initial USB flash. Remote restart and configuration are unavailable until this firmware checks in.
                  </p>
                )}
                {needsEnrollment && setupInfo && (
                  <div className="mt-3 min-w-0 rounded-xl border border-accent/30 bg-accent/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-black">Initial local Wi-Fi setup</h4>
                      <button type="button" onClick={() => copySetupDetails(device)}
                        className="min-h-9 rounded-lg border border-border bg-background px-3 text-[10px] font-black">
                        Copy setup details
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="min-w-0 rounded-lg border border-border bg-background p-2.5">
                        <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">Connect to Wi-Fi</p>
                        <p className="mt-1 break-all text-xs font-bold">{setupInfo.meshSsid}</p>
                      </div>
                      <div className="min-w-0 rounded-lg border border-border bg-background p-2.5">
                        <p className="text-[9px] font-black uppercase tracking-wide text-text-muted">Setup password</p>
                        <p className="mt-1 break-all font-mono text-xs font-bold">{setupInfo.meshPassword}</p>
                      </div>
                    </div>
                    <p className="mt-3 break-all text-[11px] leading-5 text-text-muted">
                      1. Flash the downloaded firmware once over USB. 2. Connect your phone to the network above. 3. Open {setupInfo.setupUrl} and enter the customer's Wi-Fi name and security. 4. Return here and refresh until the board reports Online.
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="rounded-xl border border-border bg-background p-3 text-[10px] leading-5 text-text-muted">
        Remote restart is a software reboot request. It is not the physical EN pin; it works only after the updated firmware is installed, the board is online, and the device-agent check-in succeeds.
      </div>
    </section>
  );
}
