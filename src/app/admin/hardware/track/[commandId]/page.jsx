"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/admin";
import {
  ArrowLeft, Check, CheckCircle2, Clock3, Cpu, ExternalLink, LoaderCircle,
  RadioTower, RotateCcw, ShieldAlert, Wifi, XCircle,
} from "lucide-react";

const UPDATE_STEPS = ["Validate", "Check device link", "Send configuration", "Test new Wi-Fi", "Verify online"];
const RESTART_STEPS = ["Validate board", "Send restart", "Restarting", "Verify reconnect"];

function stamp(value) {
  return value ? new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
}

export default function Esp32CommandTrackerPage() {
  const params = useParams();
  const router = useRouter();
  const commandId = String(params?.commandId || "");
  const [user, setUser] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [commandType, setCommandType] = useState("config");
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [state, setState] = useState({ status: "running", step: 0, message: "Validating the command and loading device status." });
  const [board, setBoard] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const lastEventRef = useRef("");

  const addEvent = useCallback((key, title, detail) => {
    if (lastEventRef.current === key) return;
    lastEventRef.current = key;
    setEvents((current) => [{ id: key, title, detail, at: new Date().toISOString() }, ...current].slice(0, 8));
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !isAdminEmail(session.user.email)) {
        router.replace("/admin");
        return;
      }
      setUser(session.user);
      const search = new URLSearchParams(window.location.search);
      const type = search.get("type") === "restart" ? "restart" : "config";
      const version = Math.max(0, Number(search.get("version")) || 0);
      setCommandType(type);
      setExpectedVersion(version);
      addEvent("started", type === "restart" ? "Restart requested" : "Configuration update requested", "Tracking command " + commandId);
      setInitialized(true);
    };
    void init();
  }, [router, commandId, addEvent]);

  useEffect(() => {
    if (!initialized || !user || !commandId) return undefined;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Admin session expired. Sign in again.");
        const response = await fetch("/api/admin/hardware/commands/" + commandId, {
          cache: "no-store",
          headers: { Authorization: "Bearer " + session.access_token },
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not read command progress.");
        if (cancelled) return;
        const command = json.command;
        setBoard(json.board || null);

        if (command.status === "failed" || command.status === "expired") {
          const message = command.result?.message || (command.status === "expired" ? "The command expired before the ESP32 completed it." : "The device reported a failure.");
          setState({ status: "failed", step: (commandType === "restart" ? RESTART_STEPS : UPDATE_STEPS).length - 1, message });
          addEvent("failed-" + command.status, "Update needs attention", message);
          return;
        }

        if (commandType === "restart") {
          const verifiedBoot = Boolean(json.lastBootAt && new Date(json.lastBootAt).getTime() >= new Date(command.created_at).getTime());
          if (command.status === "completed" && verifiedBoot && json.deviceOnline) {
            setState({ status: "completed", step: RESTART_STEPS.length - 1, message: "A new boot and a fresh online heartbeat were confirmed." });
            addEvent("restart-completed", "ESP32 restarted successfully", "The selected board is online after its reboot.");
            return;
          }
          if (command.status === "queued") {
            setState({ status: "running", step: 1, message: "The restart command is queued. Waiting for this ESP32 to receive it." });
            addEvent("restart-queued", "Restart command queued", "Only " + (json.board?.board_identifier || "the selected board") + " can consume this command.");
          } else {
            setState({ status: "running", step: 2, message: json.deviceOnline
              ? "The ESP32 accepted the restart request. Waiting for its next boot heartbeat."
              : "The ESP32 is restarting or reconnecting. Waiting for it to come online." });
            addEvent("restart-accepted", "ESP32 accepted restart", "Awaiting a new boot ID and online heartbeat.");
          }
          return;
        }

        if (command.status === "completed" && json.deviceOnline &&
            Number(json.lastAppliedConfigVersion) >= expectedVersion) {
          setState({ status: "completed", step: UPDATE_STEPS.length - 1, message: "The ESP32 confirmed configuration version " + expectedVersion + " and is reporting online." });
          addEvent("config-completed", "Configuration applied", "ESP32 reports version " + json.lastAppliedConfigVersion + " and is online.");
          return;
        }

        const deviceProgress = command.result?.message || "";
        if (!json.deviceOnline) {
          setState({ status: "running", step: 1, message: "The ESP32 is not reporting a fresh heartbeat. The new configuration remains on the server; the device must reconnect before it can be applied." });
          addEvent("wifi-wait", "Checking device connectivity", "No fresh heartbeat yet. Delivery has not been confirmed.");
        } else if (command.status === "queued") {
          setState({ status: "running", step: 2, message: "The admin request is validated and saved. The ESP32 is online; waiting for it to retrieve this configuration." });
          addEvent("config-queued", "Configuration saved securely", "Waiting for delivery to the selected ESP32.");
        } else if (command.status === "accepted") {
          const targetWifiConnected =
            deviceProgress.includes("connected to the requested Wi-Fi network") ||
            deviceProgress.includes("Wi-Fi settings already match");
          setState({
            status: "running",
            step: targetWifiConnected ? 4 : 3,
            message: deviceProgress || "The ESP32 accepted the command and is validating the configuration.",
          });
          addEvent(
            targetWifiConnected ? "target-wifi-connected" : "config-accepted-" + deviceProgress,
            targetWifiConnected ? "Wi-Fi connection verified" : "Configuration received by ESP32",
            deviceProgress || "The device is validating connectivity and applying its staged settings.",
          );
        } else {
          setState({ status: "running", step: 4, message: deviceProgress || "The command is being verified against the ESP32's next heartbeat and applied configuration version." });
          addEvent("config-verifying-" + (deviceProgress || "pending"), "Verifying applied version", deviceProgress || ("Waiting for version " + expectedVersion + " to be reported by the device."));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Status check failed.");
          setState((current) => ({ ...current, status: "running", message: "Status check temporarily failed; retrying automatically." }));
        }
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [initialized, user, commandId, commandType, expectedVersion, addEvent]);

  const steps = commandType === "restart" ? RESTART_STEPS : UPDATE_STEPS;
  const completed = state.status === "completed";
  const failed = state.status === "failed";

  if (!initialized) return <main className="flex min-h-screen items-center justify-center bg-background px-4 text-text"><div className="text-center"><LoaderCircle size={34} className="mx-auto animate-spin text-accent" /><p className="mt-3 text-sm font-bold">Opening secure device tracker…</p></div></main>;

  return (
    <main className="min-h-screen overflow-x-hidden bg-background px-3 pb-12 pt-5 text-text sm:px-6 sm:pt-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-accent"><RadioTower size={14} /> VikaTech live device operations</p>
            <h1 className="text-2xl font-black tracking-tight sm:text-4xl">{commandType === "restart" ? "ESP32 restart tracker" : "ESP32 configuration tracker"}</h1>
            <p className="mt-2 break-all text-xs leading-5 text-text-muted">Command ID: {commandId}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link href="/admin/hardware" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-black hover:border-accent/50"><ArrowLeft size={14} /> Device fleet</Link>
            <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-black text-[var(--btn-text)] hover:bg-accent-hover"><ExternalLink size={14} /> Back to main site</Link>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
          <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6 lg:p-8">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl " + (completed ? "bg-emerald-500/10 text-emerald-500" : failed ? "bg-red-500/10 text-red-500" : "bg-accent/10 text-accent")}>
                {completed ? <CheckCircle2 size={26} /> : failed ? <XCircle size={26} /> : commandType === "restart" ? <RotateCcw size={25} className="animate-pulse" /> : <Cpu size={26} className="animate-pulse" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-base font-black sm:text-lg">{completed ? "All checks passed" : failed ? "Action needs attention" : "Working with your ESP32"}</h2>
                <p className="mt-1 text-xs leading-5 text-text-muted">{state.message}</p>
              </div>
            </div>

            <div className="mt-7 space-y-3">
              {steps.map((step, index) => {
                const done = completed || index < state.step;
                const active = state.status === "running" && index === state.step;
                return (
                  <div key={step} className={"flex min-w-0 items-center gap-3 rounded-xl border p-3 transition-colors sm:p-4 " + (done ? "border-emerald-500/30 bg-emerald-500/5" : active ? "border-accent/40 bg-accent/5" : "border-border bg-background")}>
                    <div className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full " + (done ? "bg-emerald-500 text-white" : active ? "bg-accent text-[var(--btn-text)]" : "bg-card text-text-muted")}>
                      {done ? <Check size={16} /> : active ? <LoaderCircle size={16} className="animate-spin" /> : <span className="text-xs font-black">{index + 1}</span>}
                    </div>
                    <div className="min-w-0 flex-1"><p className="break-words text-xs font-black sm:text-sm">{step}</p><p className="mt-0.5 text-[10px] text-text-muted">{done ? "Confirmed" : active ? "In progress" : "Waiting"}</p></div>
                    {active && <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-accent">Live</span>}
                  </div>
                );
              })}
            </div>

            {state.status === "running" && <div className="mt-5 rounded-xl border border-border bg-background p-3 sm:p-4"><div className="flex items-center gap-2 text-xs font-semibold text-text-muted"><LoaderCircle size={14} className="animate-spin text-accent" /> Status is checked every 2 seconds. The command continues on the server if you leave this page.</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full w-1/2 animate-pulse rounded-full bg-accent" /></div></div>}
            {error && <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-600">{error} Status checks will keep retrying.</div>}
            {failed && <button onClick={() => router.push("/admin/hardware")} className="mt-5 w-full rounded-xl border border-border px-4 py-3 text-xs font-black hover:border-accent sm:w-auto">Return to hardware fleet</button>}
            {completed && <div className="mt-5 flex flex-col gap-2 sm:flex-row"><Link href="/admin/hardware" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-black text-[var(--btn-text)]"><CheckCircle2 size={14} /> Done · Back to fleet</Link><Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-black"><ExternalLink size={14} /> Main site</Link></div>}
          </section>

          <aside className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center gap-2"><Cpu size={17} className="text-accent" /><h2 className="text-sm font-black">Device status</h2></div>
              <p className="mt-3 break-words text-sm font-black">{board?.name || "Loading board…"}</p>
              <p className="mt-1 break-all font-mono text-[10px] text-text-muted">{board?.board_identifier || "Resolving board"}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-text-muted">Connection</p><p className="mt-1 flex items-center gap-1.5 text-xs font-black"><span className={"h-2 w-2 rounded-full " + (completed ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />{completed ? "Verified online" : "Waiting"}</p></div>
                <div className="rounded-xl border border-border bg-background p-3"><p className="text-[10px] text-text-muted">Applied config</p><p className="mt-1 text-xs font-black">{commandType === "restart" ? "No change" : "v" + (expectedVersion || "—")}</p></div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2"><Clock3 size={17} className="text-accent" /><h2 className="text-sm font-black">Live event log</h2></div>
              {events.length === 0 ? <p className="text-xs text-text-muted">Waiting for device events…</p> : <div className="space-y-3">{events.map((event) => <div key={event.id} className="flex gap-3"><span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (event.id.includes("failed") ? "bg-red-500" : event.id.includes("completed") ? "bg-emerald-500" : "bg-accent")} /><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold">{event.title}</p><p className="mt-0.5 break-words text-[10px] leading-4 text-text-muted">{event.detail}</p><p className="mt-1 text-[9px] text-text-muted">{stamp(event.at)}</p></div></div>)}</div>}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
