"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/admin";
import {
  ArrowLeft, Check, CheckCircle2, Clock3, Cpu, ExternalLink,
  LoaderCircle, Power, RefreshCw, RotateCcw, ShieldAlert, Wifi, WifiOff, XCircle,
} from "lucide-react";

const STEPS = [
  { title: "Validate selected board", description: "Verify this board's identity and recent direct check-in." },
  { title: "Deliver restart command", description: "Queue an authenticated command for this exact board." },
  { title: "Restarting ESP32", description: "The firmware acknowledges the request, then reboots like pressing EN." },
  { title: "Verify reconnection", description: "Wait for the device-agent to check in after the reboot." },
];

function timeText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DeviceRestartTrackerPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = Array.isArray(params?.boardId) ? params.boardId[0] : params?.boardId;
  const [accessToken, setAccessToken] = useState("");
  const [commandId, setCommandId] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("direct");
  const [board, setBoard] = useState(null);
  const [command, setCommand] = useState(null);
  const [deviceConfig, setDeviceConfig] = useState(null);
  const [state, setState] = useState({
    status: "running",
    step: 0,
    message: "Validating your admin session and selected ESP32.",
  });
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const lastEventKey = useRef("");
  const pollInFlight = useRef(false);

  const addEvent = useCallback((key, title, detail) => {
    if (!key || lastEventKey.current === key) return;
    lastEventKey.current = key;
    setEvents((current) => [
      { id: key, title, detail, at: new Date().toISOString() },
      ...current,
    ].slice(0, 12));
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        if (!session || !isAdminEmail(session.user.email)) {
          router.replace("/admin");
          return;
        }
        const search = new URLSearchParams(window.location.search);
        const requestedCommandId = search.get("commandId") || "";
        const requestedDeliveryMode = search.get("deliveryMode") === "mesh_gateway" ? "mesh_gateway" : "direct";
        setDeliveryMode(requestedDeliveryMode);
        if (!/^[0-9a-f-]{36}$/i.test(requestedCommandId)) {
          setError("A valid restart command ID was not provided. Return to Hardware Fleet and request a restart from the selected device card.");
          setState({ status: "failed", step: 0, message: "Restart tracking cannot start without a valid command ID." });
          setLoading(false);
          return;
        }
        setAccessToken(session.access_token);
        setCommandId(requestedCommandId);
        addEvent("request", "Restart request opened", "Tracking command " + requestedCommandId);
        setLoading(false);
      } catch {
        if (!active) return;
        setError("Could not verify the administrator session.");
        setState({ status: "failed", step: 0, message: "The tracker could not authenticate this session." });
        setLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [router, addEvent]);

  const pollStatus = useCallback(async () => {
    if (!accessToken || !boardId || !commandId || pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      const headers = { Authorization: "Bearer " + accessToken };
      const [commandResponse, configResponse] = await Promise.all([
        fetch("/api/admin/devices/" + boardId + "/restart", {
          cache: "no-store",
          headers,
        }),
        fetch("/api/admin/devices/" + boardId + "/configuration", {
          cache: "no-store",
          headers,
        }),
      ]);
      const [commandData, configData] = await Promise.all([
        commandResponse.json(),
        configResponse.json(),
      ]);
      if (!commandResponse.ok) throw new Error(commandData.error || "Could not read restart status.");
      if (!configResponse.ok) throw new Error(configData.error || "Could not read device connection status.");

      const nextCommand = (commandData.commands || []).find((item) => item.id === commandId);
      if (!nextCommand) throw new Error("This restart command is not present in the selected board's command history.");
      const nextConfig = configData.config || null;
      setCommand(nextCommand);
      setBoard(configData.board || commandData.board || null);
      setDeviceConfig(nextConfig);
      setError("");

      const directOnline = Boolean(nextConfig?.directOnline);
      const meshOnline = Boolean(nextConfig?.meshOnline);
      const targetOnline = deliveryMode === "mesh_gateway" ? meshOnline : directOnline;
      const status = nextCommand.status;
      const statusError = nextCommand.last_error || "";

      if (status === "failed" || status === "cancelled") {
        const message = statusError || (status === "cancelled"
          ? "The restart request expired or was cancelled before completion."
          : "The ESP32 reported that the restart command failed.");
        setState({ status: "failed", step: 3, message });
        addEvent("terminal-" + status, "Restart needs attention", message);
        return;
      }

      if (status === "completed" && targetOnline) {
        const completionMessage = deliveryMode === "mesh_gateway"
          ? "The ESP32 member restarted and the mesh leader has observed it rejoin the mesh."
          : "The ESP32 accepted the restart command, rebooted, and made a fresh authenticated device-agent check-in.";
        setState({
          status: "completed",
          step: 3,
          message: completionMessage,
        });
        addEvent(
          "complete",
          "ESP32 restarted successfully",
          deliveryMode === "mesh_gateway"
            ? "Command acknowledgement and the selected member's return to the mesh were verified."
            : "Command acknowledgement and direct device reconnection were verified."
        );
        return;
      }

      if (status === "completed" && !targetOnline) {
        setState({
          status: "running",
          step: 3,
          message: deliveryMode === "mesh_gateway"
            ? "The leader accepted the restart acknowledgement. Waiting for a fresh mesh observation of the selected member before marking this complete."
            : "The firmware acknowledged the reboot. Waiting for a fresh direct online status before marking this complete.",
        });
        addEvent(
          "completed-wait-online",
          "Restart acknowledged",
          deliveryMode === "mesh_gateway"
            ? "Waiting for the mesh gateway to observe the selected member again."
            : "Waiting for the board's current direct connection status."
        );
        return;
      }

      if (status === "pending") {
        setState({
          status: "running",
          step: 1,
          message: targetOnline
            ? "The selected board is reachable. Waiting for the ESP32 to receive the queued restart."
            : deliveryMode === "mesh_gateway"
              ? "The restart is queued. Waiting for the gateway to observe the selected member before forwarding."
              : "The restart is queued, but the ESP32 has not reported a fresh direct check-in.",
        });
        addEvent("pending", "Restart command queued", "Only board " + (configData.board?.boardIdentifier || boardId) + " is eligible to receive this command.");
        return;
      }

      if (status === "accepted") {
        setState({
          status: "running",
          step: 2,
          message: deliveryMode === "mesh_gateway"
            ? "The mesh gateway accepted the board-specific restart. Waiting for the member to reboot and rejoin."
            : directOnline
              ? "The ESP32 accepted the command. Waiting for its next boot and fresh heartbeat."
              : "The ESP32 accepted the command and appears to be restarting or reconnecting.",
        });
        addEvent("accepted", "ESP32 accepted restart", "Waiting for the post-restart device-agent acknowledgement.");
        return;
      }

      setState({ status: "running", step: 0, message: "Waiting for the command to reach the ESP32." });
    } catch (caught) {
      setError(caught.message || "Could not refresh restart status. Retrying automatically.");
      setState((current) => ({
        ...current,
        status: current.status === "completed" || current.status === "failed" ? current.status : "running",
        message: "Status checking is temporarily unavailable. The tracker will retry automatically.",
      }));
    } finally {
      pollInFlight.current = false;
    }
  }, [accessToken, boardId, commandId, addEvent]);

  useEffect(() => {
    if (!accessToken || !boardId || !commandId) return undefined;
    void pollStatus();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void pollStatus();
    }, 2500);
    return () => clearInterval(timer);
  }, [accessToken, boardId, commandId, pollStatus]);

  const isComplete = state.status === "completed";
  const isFailed = state.status === "failed";
  const statusColor = isComplete
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-500"
    : isFailed
      ? "border-red-400/30 bg-red-400/10 text-red-500"
      : "border-accent/30 bg-accent/5 text-accent";

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-background px-4 text-text">
      <div className="text-center"><LoaderCircle size={32} className="mx-auto animate-spin text-accent" /><p className="mt-3 text-sm font-bold">Opening restart tracker…</p></div>
    </main>;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background px-3 pb-12 pt-4 text-text sm:px-6 sm:pt-8 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
        <header className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-accent"><Power size={14} /> VikaTech device operations</p>
            <h1 className="text-2xl font-black tracking-tight sm:text-4xl">ESP32 restart tracker</h1>
            <p className="mt-2 break-all font-mono text-[10px] leading-5 text-text-muted">Board ID: {boardId}<br />Command ID: {commandId || "Resolving…"}</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
            <Link href="/admin" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-xs font-black hover:border-accent/50"><ArrowLeft size={14} /> Back to Admin Panel</Link>
            <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-[var(--btn-text)] hover:brightness-105"><ExternalLink size={14} /> Back to VikaTech site</Link>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)] lg:gap-6">
          <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6 lg:p-8">
            <div className={"rounded-2xl border p-4 sm:p-5 " + statusColor}>
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-current/10">
                  {isComplete ? <CheckCircle2 size={25} /> : isFailed ? <XCircle size={25} /> : <RotateCcw size={25} className="animate-pulse" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-base font-black sm:text-lg">{isComplete ? "Restart verified" : isFailed ? "Restart needs attention" : "Working with the selected ESP32"}</h2>
                  <p className="mt-1 break-words text-xs leading-5">{state.message}</p>
                </div>
                {!isComplete && !isFailed && <LoaderCircle size={17} className="mt-1 shrink-0 animate-spin" />}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {STEPS.map((step, index) => {
                const done = isComplete || index < state.step;
                const current = state.status === "running" && index === state.step;
                return <div key={step.title} className={"flex min-w-0 items-center gap-3 rounded-xl border p-3 transition-colors sm:p-4 " + (done ? "border-emerald-400/30 bg-emerald-400/5" : current ? "border-accent/40 bg-accent/5" : "border-border bg-background")}>
                  <div className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full " + (done ? "bg-emerald-500 text-white" : current ? "bg-accent text-[var(--btn-text)]" : "bg-card text-text-muted")}>
                    {done ? <Check size={15} /> : current ? <LoaderCircle size={15} className="animate-spin" /> : <span className="text-xs font-black">{index + 1}</span>}
                  </div>
                  <div className="min-w-0 flex-1"><p className="break-words text-xs font-black sm:text-sm">{step.title}</p><p className="mt-1 break-words text-[10px] leading-4 text-text-muted">{current ? state.message : step.description}</p></div>
                  {current && <span className="shrink-0 text-[9px] font-black uppercase text-accent">Live</span>}
                </div>;
              })}
            </div>

            {!isComplete && !isFailed && <div className="mt-5 rounded-xl border border-border bg-background p-3 sm:p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-muted"><LoaderCircle size={14} className="animate-spin text-accent" /> Checking command and device status every 2.5 seconds.</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full w-1/2 animate-pulse rounded-full bg-accent" /></div>
            </div>}
            {error && <div role="status" className="mt-4 break-words rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-600">{error} The tracker will continue retrying.</div>}

            {isComplete && <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-emerald-500"><CheckCircle2 size={18} /> Device came back online</div>
              <p className="mt-1 text-xs leading-5 text-text-muted">The command was completed and a fresh direct device-agent connection was confirmed.</p>
              <p className="mt-2 text-[10px] text-text-muted">Last seen: {timeText(deviceConfig?.lastSeenAt)}</p>
            </div>}
            {isFailed && <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/5 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-red-500"><XCircle size={18} /> Restart not verified</div>
              <p className="mt-1 break-words text-xs leading-5">{state.message}</p>
              <p className="mt-1 text-[10px] leading-4 text-text-muted">Review the device's network status and command history before requesting another restart.</p>
            </div>}

            <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
              <button type="button" onClick={() => void pollStatus()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-xs font-black"><RefreshCw size={14} /> Refresh status</button>
              <Link href="/admin" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-xs font-black"><ArrowLeft size={14} /> Return to Admin Panel</Link>
              {isComplete && <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-[var(--btn-text)]"><ExternalLink size={14} /> Main site</Link>}
            </div>
          </section>

          <aside className="min-w-0 space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center gap-2"><Cpu size={17} className="text-accent" /><h2 className="text-sm font-black">Selected device</h2></div>
              <p className="mt-3 break-words text-sm font-black">{board?.name || "Loading board…"}</p>
              <p className="mt-1 break-all font-mono text-[10px] text-text-muted">{board?.boardIdentifier || "Resolving board identity"}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-text-muted">Device status</p><p className="mt-1 flex items-center gap-1.5 text-xs font-black"><span className={"h-2 w-2 rounded-full " + (deviceConfig?.directOnline ? "bg-emerald-500" : "animate-pulse bg-amber-500")} />{deliveryMode === "mesh_gateway"
                    ? deviceConfig?.meshOnline ? "Mesh reachable" : "Waiting"
                    : deviceConfig?.directOnline ? "Online" : "Waiting"}</p></div>
                <div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-text-muted">Command</p><p className="mt-1 break-words text-xs font-black">{command?.status || "Loading"}</p></div>
              </div>
              {deviceConfig?.meshOnline && !deviceConfig?.directOnline && <p className="mt-3 text-xs leading-5 text-amber-600">The board is visible through the mesh, but only a direct check-in can verify this restart.</p>}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2"><Clock3 size={17} className="text-accent" /><h2 className="text-sm font-black">Live event log</h2></div>
              {events.length === 0 ? <p className="text-xs text-text-muted">Waiting for device events…</p> : <div className="space-y-3">{events.map((event) => <div key={event.id} className="flex min-w-0 gap-3"><span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (event.id.includes("terminal") ? "bg-red-500" : event.id === "complete" ? "bg-emerald-500" : "bg-accent")} /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{event.title}</p><p className="mt-0.5 break-words text-[10px] leading-4 text-text-muted">{event.detail}</p><p className="mt-1 text-[9px] text-text-muted">{timeText(event.at)}</p></div></div>)}</div>}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
