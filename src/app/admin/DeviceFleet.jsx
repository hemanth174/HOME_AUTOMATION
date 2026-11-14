"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Clock3,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileClock,
  LoaderCircle,
  Network,
  Power,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import AdminConfirmDrawer from "./AdminConfirmDrawer";
import DeviceWifiDrawer from "./DeviceWifiDrawer";

function ago(value) {
  if (!value) return "Never connected";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  return Math.floor(seconds / 3600) + "h ago";
}

function CopyableIdentifier({ label, value }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-1.5 font-mono text-[11px]">
      <div className="min-w-0 flex-1 truncate">
        <span className="text-[10px] uppercase text-text-muted">{label}: </span>
        <span className="font-semibold text-text">{value || "—"}</span>
      </div>
      <button
        type="button"
        onClick={copy}
        title={`Copy ${label}`}
        className="shrink-0 text-text-muted transition hover:text-accent"
      >
        {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
      </button>
    </div>
  );
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
  const [wifiEditor, setWifiEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
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
    return () => {
      active = false;
    };
  }, []);

  const loadDevices = useCallback(
    async (silent = false) => {
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
        if (data.migrationRequired) {
          setNotice("Apply supabase/device_management.sql before using remote device management.");
        }
      } catch (error) {
        setNotice(error.message || "Could not load hardware fleet");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken]
  );

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
      await Promise.all(
        boardIds.map(async (boardId) => {
          try {
            const response = await fetch("/api/admin/devices/" + boardId + "/restart", {
              cache: "no-store",
              headers: { Authorization: "Bearer " + accessToken },
            });
            const data = await response.json();
            if (!response.ok || !active) return;
            const command = (data.commands || []).find(
              (item) => item.id === restartByBoard[boardId]?.commandId
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
              setNotice(
                "No restart acknowledgement arrived within 2 minutes. The command remains in the audit history; check status before requesting another restart."
              );
              return;
            }
            setRestartByBoard((previous) => {
              const current = previous[boardId];
              const error = command.last_error || "";
              if (
                current &&
                current.status === command.status &&
                current.error === error &&
                current.polling === !terminal
              ) {
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
              setNotice(
                command.status === "completed"
                  ? "ESP32 restarted and checked in successfully."
                  : command.status === "failed"
                  ? command.last_error || "The ESP32 reported a restart failure."
                  : command.last_error || "Restart request expired or was cancelled."
              );
              loadDevices(true);
            }
          } catch {
            // Keep the last status visible during a temporary network interruption.
          }
        })
      );
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [accessToken, restartByBoard, loadDevices]);

  // Retain restart handler functions for future activation
  const restartDevice = (device) => {
    if (!device.provisioned) {
      setNotice("Prepare and flash the device-agent firmware once before requesting a remote restart.");
      return;
    }
    const meshOnly = !device.config.directOnline && Boolean(device.config.meshOnline);
    if (!device.config.directOnline && !meshOnly) {
      setNotice(
        "This ESP32 has no recent direct check-in or live mesh-gateway observation. Reconnect it before sending a restart request."
      );
      return;
    }
    const deliveryNote = meshOnly
      ? "This board is reachable through its mesh leader. The signed restart request targets this board identifier only, and success requires the member to rejoin the mesh."
      : "";
    setConfirmation({
      kind: "restart",
      deviceId: device.id,
      title: "Restart this ESP32?",
      deviceName: device.name,
      message:
        "This will briefly disconnect the ESP32 and its attached relay channels. Use this only when a software restart is safe for the connected equipment. " +
        deliveryNote,
      confirmLabel: "Restart ESP32",
      tone: "danger",
    });
  };

  const executeRestart = async (device) => {
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
        [device.id]: {
          commandId: data.command.id,
          status: data.command.status,
          polling: true,
          startedAt: Date.now(),
          timedOut: false,
          error: "",
        },
      }));
      setNotice(
        data.deliveryMode === "mesh_gateway"
          ? "Restart queued through the mesh leader. Opening the selected member's live restart tracker."
          : "Restart queued. Opening the live restart tracker."
      );
      router.push(
        "/admin/devices/" +
          encodeURIComponent(device.id) +
          "/restart?commandId=" +
          encodeURIComponent(data.command.id) +
          "&deliveryMode=" +
          encodeURIComponent(data.deliveryMode || "direct")
      );
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
        setNotice(
          command.status === "completed"
            ? "ESP32 restart completed and the device acknowledged its return."
            : command.status === "failed"
            ? command.last_error || "ESP32 reported a restart failure."
            : command.last_error || "Restart request expired or was cancelled."
        );
        loadDevices(true);
      } else {
        setNotice(
          "Latest status: " +
            command.status +
            ". The command is still non-terminal; do not queue another restart unless you have reviewed the audit history."
        );
      }
    } catch (error) {
      setNotice(error.message || "Could not check restart status");
    } finally {
      setBusy((previous) => ({ ...previous, [device.id]: "" }));
    }
  };

  const openWifiEditor = (device, mode) => {
    if (mode === "update") {
      if (!device.provisioned) {
        setNotice("Prepare and flash enrollment firmware before updating Wi-Fi remotely.");
        return;
      }
      if (!device.config.directOnline) {
        setNotice("Connect to this board directly before changing its Wi-Fi settings.");
        return;
      }
      router.push("/admin/devices/" + encodeURIComponent(device.id) + "/update");
      return;
    }
    setWifiEditor({ deviceId: device.id, mode });
  };

  const downloadLatestFirmware = (device) => {
    if (!device.provisioned) {
      openWifiEditor(device, "enroll");
      return;
    }
    setConfirmation({
      kind: "firmware",
      deviceId: device.id,
      title: "Download latest firmware?",
      deviceName: device.name,
      message:
        "Existing device and Wi-Fi credentials will be preserved. Flash the downloaded file over USB to update this board.",
      confirmLabel: "Download firmware",
      tone: "accent",
    });
  };

  const executeDownloadLatestFirmware = async (device) => {
    setBusy((current) => ({ ...current, [device.id]: "provision" }));
    setNotice("");
    try {
      const response = await fetch("/api/admin/devices/" + device.id + "/provision", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare latest firmware");
      const blob = new Blob([data.firmware], { type: "text/x-c++src;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.fileName || device.boardIdentifier + ".cpp";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNotice(data.message || "Latest firmware downloaded. Flash it over USB to update this board.");
      await loadDevices(true);
    } catch (error) {
      setNotice(error.message || "Could not prepare latest firmware");
    } finally {
      setBusy((current) => ({ ...current, [device.id]: "" }));
    }
  };

  const revokeDevice = (device) => {
    if (!device.provisioned) return;
    setConfirmation({
      kind: "revoke",
      deviceId: device.id,
      title: "Revoke device credential?",
      deviceName: device.name,
      message:
        "The current firmware will stop authenticating. A new one-time enrollment flash will be required.",
      confirmLabel: "Revoke credential",
      tone: "danger",
    });
  };

  const executeRevokeDevice = async (device) => {
    setBusy((current) => ({ ...current, [device.id]: "revoke" }));
    try {
      const response = await fetch("/api/admin/devices/" + device.id + "/revoke", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not revoke device credential");
      setNotice("Device credential revoked. Generate replacement enrollment firmware and flash this board once.");
      await loadDevices(true);
    } catch (error) {
      setNotice(error.message || "Could not revoke device credential");
    } finally {
      setBusy((current) => ({ ...current, [device.id]: "" }));
    }
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    const pending = confirmation;
    setConfirmation(null);
    const device = devices.find((item) => item.id === pending.deviceId);
    if (!device) return;
    if (pending.kind === "restart") await executeRestart(device);
    if (pending.kind === "firmware") await executeDownloadLatestFirmware(device);
    if (pending.kind === "revoke") await executeRevokeDevice(device);
  };

  const filteredDevices = devices.filter(
    (device) =>
      filter === "all" ||
      (filter === "online" && device.config.online) ||
      (filter === "offline" && !device.config.online) ||
      (filter === "unprovisioned" && !device.provisioned)
  );

  const activeEditorDevice = wifiEditor
    ? devices.find((device) => device.id === wifiEditor.deviceId) || null
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center text-sm font-semibold text-text-muted">
        <LoaderCircle className="mb-3 animate-spin text-accent" size={28} />
        <p className="text-base font-black text-text">Loading Enrolled Hardware Fleet…</p>
        <p className="mt-1 text-xs text-text-muted">Querying Supabase device registry and telemetry states.</p>
      </div>
    );
  }

  const totalBoards = devices.length;
  const directOnlineCount = devices.filter((item) => item.config.directOnline).length;
  const meshCount = devices.filter(
    (item) => item.config.online && !item.config.directOnline && item.config.meshOnline
  ).length;
  const unprovisionedCount = devices.filter((item) => !item.provisioned).length;

  return (
    <section className="space-y-4">
      {/* Metric Tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Total Fleet</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-text sm:text-3xl">{totalBoards}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500">Direct Online</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-emerald-500 sm:text-3xl">
            {directOnlineCount}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">Mesh Reachable</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-amber-500 sm:text-3xl">
            {meshCount}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-purple-400">Needs Enrollment</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-purple-400 sm:text-3xl">
            {unprovisionedCount}
          </p>
        </div>
      </div>

      {/* Main Hardware Container */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Toolbar Header */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-accent" />
              <h2 className="text-base font-black text-text sm:text-lg">ESP32 Hardware Inventory</h2>
            </div>
            <p className="mt-0.5 text-xs font-medium text-text-muted">
              Live fleet telemetry, Wi-Fi parameters, and firmware deployment management.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3.5 text-xs font-black text-text transition hover:border-accent"
            >
              <ExternalLink size={14} />
              <span>Back to VikaTech site</span>
            </Link>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="min-h-11 min-w-0 appearance-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs font-black text-text outline-none transition focus:border-accent"
            >
              <option value="all">All Boards ({devices.length})</option>
              <option value="online">Online Only</option>
              <option value="offline">Offline Only</option>
              <option value="unprovisioned">Needs Enrollment</option>
            </select>

            <button
              type="button"
              onClick={() => loadDevices(true)}
              disabled={refreshing}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-black text-text transition hover:border-accent disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin text-accent" : ""} />
              <span className="hidden sm:inline">{refreshing ? "Updating…" : "Refresh Fleet"}</span>
            </button>
          </div>
        </div>

        {/* System Notice Box */}
        {notice && (
          <div
            role="status"
            className="m-4 flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent/10 p-3.5 text-xs font-semibold text-accent"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notice"
              className="shrink-0 text-text-muted hover:text-text"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Empty State */}
        {filteredDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CircleHelp size={32} className="text-text-muted/60" />
            <h3 className="mt-3 text-base font-black text-text">No hardware boards found</h3>
            <p className="mt-1 text-xs text-text-muted">
              Boards appear here when they are assigned to a customer in Supabase.
            </p>
          </div>
        ) : (
          /* Responsive Device Grid */
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            {filteredDevices.map((device) => {
              const restart = restartByBoard[device.id];
              const busyAction = busy[device.id];
              const needsEnrollment = !device.provisioned;
              const canManageDirectly = Boolean(device.config.directOnline);
              const meshOnly = Boolean(
                device.config.online && !device.config.directOnline && device.config.meshOnline
              );
              const versionText =
                device.config.version == null
                  ? "Not enrolled"
                  : `v${device.config.appliedVersion ?? "—"} applied / v${device.config.version} target`;

              return (
                <article
                  key={device.id}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-background p-4 shadow-sm transition hover:border-accent/40 sm:p-5"
                >
                  <div className="space-y-3.5">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                          <Cpu size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-black text-text">
                            {device.name || "ESP32 Controller"}
                          </h3>
                          <p className="mt-0.5 truncate font-mono text-xs text-text-muted">
                            {device.userEmail || "Unassigned"}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                          canManageDirectly
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                            : meshOnly
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                            : "border-slate-500/30 bg-slate-500/10 text-text-muted"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            canManageDirectly
                              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse"
                              : meshOnly
                              ? "bg-amber-500"
                              : "bg-slate-500"
                          }`}
                        />
                        {canManageDirectly ? "Direct Online" : meshOnly ? "Mesh Gateway" : "Offline"}
                      </span>
                    </div>

                    {/* Identifiers with One-Click Copy */}
                    <div className="space-y-1.5">
                      <CopyableIdentifier label="Board Identifier" value={device.boardIdentifier} />
                      <CopyableIdentifier label="DB Record ID" value={device.databaseBoardId} />
                    </div>

                    {/* Telemetry & Firmware Grid */}
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-card/60 p-3 text-[11px]">
                      <div>
                        <span className="text-text-muted">Last Check-in</span>
                        <p className="mt-0.5 font-mono font-bold text-text">
                          {ago(device.config.lastSeen || device.updatedAt)}
                        </p>
                      </div>
                      <div>
                        <span className="text-text-muted">Firmware Version</span>
                        <p className="mt-0.5 font-mono font-bold text-text">{versionText}</p>
                      </div>
                    </div>

                    {/* Mesh Note if applicable */}
                    {meshOnly && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-500">
                        <Network size={14} className="mt-0.5 shrink-0" />
                        <span>Reachable through mesh gateway. Direct socket connection required for OTA Wi-Fi edits.</span>
                      </div>
                    )}

                    {/* Device Error if applicable */}
                    {device.config.lastError && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 font-mono text-[11px] text-red-500">
                        Error: {device.config.lastError}
                      </div>
                    )}

                    {/* Restart Command State if active */}
                    {restart && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-xs">
                        {restart.status === "completed" ? (
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Activity size={16} className="mt-0.5 shrink-0 text-accent animate-pulse" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-text">Restart status: {restart.status || "pending"}</p>
                          <p className="text-text-muted">
                            {restart.error ||
                              (restart.status === "completed"
                                ? "Device rebooted and acknowledged its return."
                                : restart.timedOut
                                ? "No acknowledgement within 2 minutes. Command recorded in audit history."
                                : "Waiting for ESP32 acknowledgement…")}
                          </p>
                          {restart.timedOut && (
                            <button
                              type="button"
                              onClick={() => checkRestartStatus(device)}
                              disabled={Boolean(busyAction)}
                              className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-black text-text disabled:opacity-50"
                            >
                              {busyAction === "check-restart" ? (
                                <LoaderCircle size={12} className="animate-spin text-accent" />
                              ) : (
                                <RefreshCw size={12} />
                              )}
                              <span>Check Restart Status</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Section */}
                  <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
                    {needsEnrollment ? (
                      <button
                        type="button"
                        onClick={() => openWifiEditor(device, "enroll")}
                        disabled={Boolean(busyAction)}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-[var(--btn-text)] shadow-sm transition hover:brightness-105 disabled:opacity-50"
                      >
                        {busyAction === "provision" ? (
                          <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        <span>
                          {busyAction === "provision"
                            ? "Preparing firmware…"
                            : "Prepare One-Time Enrollment Firmware"}
                        </span>
                      </button>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {/* Update Wi-Fi */}
                          <button
                            type="button"
                            onClick={() => openWifiEditor(device, "update")}
                            disabled={!device.provisioned || !canManageDirectly || Boolean(busyAction)}
                            title={
                              !canManageDirectly
                                ? "Direct connection to this board is required to edit Wi-Fi"
                                : "Update Wi-Fi configuration"
                            }
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-black text-[var(--btn-text)] shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Settings2 size={14} />
                            <span>Update Wi-Fi</span>
                          </button>

                          {/* REMOTE RESTART BUTTON: TEMPORARILY DISABLED PER USER REQUEST */}
                          <button
                            type="button"
                            disabled={true}
                            title="Remote restart is temporarily disabled for maintenance. Physical power cycling is unaffected."
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-xs font-bold text-text-muted opacity-50 cursor-not-allowed"
                          >
                            <Power size={14} className="text-text-muted" />
                            <span>Restart ESP32 (Disabled)</span>
                          </button>
                        </div>

                        {/* Secondary Actions */}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => downloadLatestFirmware(device)}
                            disabled={Boolean(busyAction)}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-text transition hover:border-accent disabled:opacity-40"
                          >
                            <Download size={14} />
                            <span>Download Firmware</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => router.push("/admin/devices/" + encodeURIComponent(device.id) + "/logs")}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-text transition hover:border-accent hover:text-accent"
                          >
                            <FileClock size={14} />
                            <span>View Device Logs</span>
                          </button>
                        </div>

                        {/* Revoke Credential */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => revokeDevice(device)}
                            disabled={Boolean(busyAction)}
                            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/30 px-3 text-[11px] font-bold text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <ShieldAlert size={13} />
                            <span>
                              {busyAction === "revoke" ? "Revoking credential…" : "Revoke Device Credential"}
                            </span>
                          </button>
                        </div>
                      </>
                    )}

                    {needsEnrollment && (
                      <p className="text-[10px] leading-relaxed text-text-muted">
                        {device.credentialRevoked
                          ? "The previous device credential was revoked. "
                          : "Enrollment requires an initial USB flash. "}
                        Remote telemetry and configuration will activate once replacement firmware checks in.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Footer Maintenance Guidance */}
        <div className="border-t border-border bg-card/60 p-4 text-[11px] leading-relaxed text-text-muted">
          <p>
            <span className="font-bold text-text">Hardware Note:</span> Remote restart requests have been temporarily paused across the command center while telemetry systems are being updated. Wi-Fi updates and firmware downloads operate normally.
          </p>
        </div>
      </div>

      {/* Confirmation Modal Drawer */}
      <AdminConfirmDrawer
        confirmation={confirmation}
        busy={false}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmAction}
      />

      {/* Wi-Fi Configuration Drawer */}
      {wifiEditor && activeEditorDevice && (
        <DeviceWifiDrawer
          device={activeEditorDevice}
          mode={wifiEditor.mode}
          accessToken={accessToken}
          refreshing={refreshing}
          onClose={() => setWifiEditor(null)}
          onSaved={() => loadDevices(true)}
          onDownloaded={(data) => {
            setNotice(
              data.message ||
                "Enrollment firmware downloaded. Flash it once over USB; Wi-Fi settings are pre-compiled into the file."
            );
            loadDevices(true);
          }}
          onCheckConnection={() => loadDevices(true)}
        />
      )}
    </section>
  );
}
