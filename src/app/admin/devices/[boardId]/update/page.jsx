"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Check, CheckCircle2, CircleAlert, CircleDashed, Cloud,
  Cpu, LoaderCircle, LockKeyhole, RadioTower, RefreshCw, ShieldCheck,
  Wifi, WifiOff, XCircle,
} from "lucide-react";

const STEPS = [
  { key: "validated", label: "Validate", detail: "Check the requested settings" },
  { key: "checking_wifi", label: "Wi-Fi check", detail: "Check visibility and connection" },
  { key: "sending", label: "Send", detail: "Deliver settings to the board" },
  { key: "applying", label: "Apply", detail: "Connect and cache the settings" },
  { key: "applied", label: "Verify", detail: "Confirm the new version is active" },
];

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
}

function stageFor(status) {
  if (status === "checking_wifi") return 1;
  if (status === "sending") return 2;
  if (status === "applying") return 3;
  if (status === "applied") return 4;
  return 0;
}

function eventIcon(status) {
  if (status === "applied") return CheckCircle2;
  if (status === "failed") return XCircle;
  if (status === "pending" || status === "sending" || status === "checking_wifi" || status === "applying") return LoaderCircle;
  return CircleDashed;
}

export default function DeviceUpdatePage() {
  const params = useParams();
  const router = useRouter();
  const boardId = Array.isArray(params?.boardId) ? params.boardId[0] : params?.boardId;

  const [accessToken, setAccessToken] = useState("");
  const [board, setBoard] = useState(null);
  const [config, setConfig] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiSecurity, setWifiSecurity] = useState("wpa2_psk");
  const [wifiPassword, setWifiPassword] = useState("");
  const [keepExistingPassword, setKeepExistingPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setAccessToken(session?.access_token || "");
      if (!session?.access_token) {
        setLoading(false);
        setError("Your admin session has expired. Sign in again.");
      }
    });
    return () => { active = false; };
  }, []);

  const loadStatus = useCallback(async (silent = false) => {
    if (!accessToken || !boardId) return;
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/admin/devices/" + boardId + "/configuration", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load device configuration");
      setBoard(data.board || null);
      setConfig(data.config || null);
      setEvents(data.events || []);
      if (data.config && !wifiSsid) {
        setWifiSsid(data.config.wifiSsid || "");
        setWifiSecurity(data.config.wifiSecurity === "open" ? "open" : "wpa2_psk");
        setKeepExistingPassword(Boolean(data.config.hasWifiPassword && data.config.wifiSecurity === "wpa2_psk"));
      }
      setLastFetchedAt(new Date().toISOString());
      if (data.config?.status === "applied" && Number(data.config.appliedVersion) >= Number(data.config.version)) {
        setTracking(false);
      }
      if (data.config?.status === "failed") setTracking(false);
    } catch (err) {
      if (!silent) setError(err.message || "Could not load device configuration");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [accessToken, boardId, wifiSsid]);

  useEffect(() => {
    if (!accessToken || !boardId) return;
    loadStatus();
  }, [accessToken, boardId, loadStatus]);

  useEffect(() => {
    if (!tracking || !accessToken || !boardId) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadStatus(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [tracking, accessToken, boardId, loadStatus]);

  const isComplete = config?.status === "applied" &&
    Number(config?.appliedVersion) >= Number(config?.version) && Number(config?.version) > 0;
  const isFailed = config?.status === "failed";
  const currentStep = stageFor(config?.status);
  const isOnline = Boolean(config?.lastSeenAt) && Date.now() - new Date(config.lastSeenAt).getTime() < 120000;
  const progressPercent = isComplete ? 100 : isFailed ? Math.max(14, currentStep * 20) : Math.max(8, currentStep * 20 + (tracking ? 8 : 0));
  const newestEvents = useMemo(() => events.slice(0, 12), [events]);

  const submitConfiguration = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!wifiSsid.trim() || wifiSsid.trim().length > 32) {
      setError("Wi-Fi name is required and must be 1–32 characters.");
      return;
    }
    if (wifiSecurity === "wpa2_psk" && !keepExistingPassword &&
        (wifiPassword.length < 8 || wifiPassword.length > 63)) {
      setError("Enter a WPA2-PSK password of 8–63 characters, or choose to keep the saved password.");
      return;
    }
    if (!config || !config.version && !config.status) {
      setError("This device needs enrollment firmware before a remote configuration can be sent.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/devices/" + boardId + "/configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
        body: JSON.stringify({
          wifiSsid: wifiSsid.trim(),
          wifiSecurity,
          wifiPassword: wifiSecurity === "open" ? "" : keepExistingPassword ? "" : wifiPassword,
          keepExistingPassword: wifiSecurity === "wpa2_psk" && keepExistingPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start the update");
      setNotice("Configuration v" + data.version + " saved securely. Waiting for the ESP32 to validate and apply it.");
      setTracking(true);
      setWifiPassword("");
      await loadStatus(true);
    } catch (err) {
      setError(err.message || "Could not start the update");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-background px-4 py-8 text-text sm:px-6">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card p-10 text-center">
        <LoaderCircle size={26} className="mx-auto animate-spin text-accent" />
        <p className="mt-3 text-sm font-bold">Loading secure device tracker…</p>
      </div>
    </main>;
  }

  if (error && !board) {
    return <main className="min-h-screen bg-background px-4 py-10 text-text sm:px-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-red-400/30 bg-card p-6 sm:p-8">
        <CircleAlert size={28} className="text-red-500" />
        <h1 className="mt-3 text-xl font-black">Device tracker unavailable</h1>
        <p className="mt-2 text-sm text-text-muted">{error}</p>
        <button type="button" onClick={() => router.push("/admin")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-xs font-black">
          <ArrowLeft size={14} /> Back to Admin Panel
        </button>
      </div>
    </main>;
  }

  if (!config || !Boolean(config && config.version !== undefined) || !board) {
    return <main className="min-h-screen bg-background px-4 py-10 text-text sm:px-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-8">
        <Cpu size={28} className="text-accent" />
        <h1 className="mt-3 text-xl font-black">Enrollment required</h1>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          This board does not have a device-agent configuration record yet. Open Hardware Fleet in the Admin Panel and prepare the one-time enrollment firmware. Remote updates and restart commands become available after that firmware is flashed and the board checks in.
        </p>
        <button type="button" onClick={() => router.push("/admin")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-[var(--btn-text)]">
          <ArrowLeft size={14} /> Back to Hardware Fleet
        </button>
      </div>
    </main>;
  }

  return (
    <main className="min-h-screen bg-background px-3 pb-12 pt-4 text-text sm:px-6 sm:pt-8 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={() => router.push("/admin")} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-black hover:border-accent">
              <ArrowLeft size={14} /> Back to Hardware Fleet
            </button>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-accent">
              <ShieldCheck size={14} /> VikaTech secure configuration
            </div>
            <h1 className="mt-2 break-words text-2xl font-black sm:text-4xl">Update ESP32 configuration</h1>
            <p className="mt-2 break-all font-mono text-[11px] text-text-muted">{board.name} · {board.boardIdentifier}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <span className={"inline-flex items-center gap-1 rounded-full border px-3 py-2 text-[10px] font-black " + (isOnline ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-500" : "border-slate-500/30 bg-slate-500/10 text-text-muted")}>
              {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
              {isOnline ? "Device online" : "Waiting for device"}
            </span>
            <button type="button" onClick={() => loadStatus(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-black">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/5 p-3 text-sm font-semibold text-red-500">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm font-semibold">{notice}</div>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Wifi size={20} /></div>
              <div>
                <h2 className="text-base font-black">Wi-Fi settings</h2>
                <p className="mt-1 text-xs leading-5 text-text-muted">The Wi-Fi name is required. Select Open Network only if the customer's router does not require a password.</p>
              </div>
            </div>

            <form onSubmit={submitConfiguration} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-black">Wi-Fi Name (SSID) <span className="text-red-500">*</span></span>
                <input value={wifiSsid} onChange={(event) => setWifiSsid(event.target.value)} maxLength={32} required
                  autoComplete="off" placeholder="Customer Wi-Fi name"
                  className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-accent" />
              </label>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-xs font-black">Wi-Fi security</legend>
                <label className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 " + (wifiSecurity === "open" ? "border-accent bg-accent/5" : "border-border")}>
                  <input type="radio" name="wifiSecurity" value="open" checked={wifiSecurity === "open"} onChange={() => { setWifiSecurity("open"); setKeepExistingPassword(false); setWifiPassword(""); }} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block text-sm font-black">None — Open Network</span>
                    <span className="mt-1 block text-xs leading-5 text-text-muted">No Wi-Fi password is required. Existing saved password is cleared in the next configuration.</span>
                  </span>
                </label>
                <label className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 " + (wifiSecurity === "wpa2_psk" ? "border-accent bg-accent/5" : "border-border")}>
                  <input type="radio" name="wifiSecurity" value="wpa2_psk" checked={wifiSecurity === "wpa2_psk"} onChange={() => setWifiSecurity("wpa2_psk")} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block text-sm font-black">WPA2-PSK</span>
                    <span className="mt-1 block text-xs leading-5 text-text-muted">Password-protected router or hotspot.</span>
                  </span>
                </label>
              </fieldset>

              {wifiSecurity === "wpa2_psk" && (
                <div className="space-y-2">
                  {config.hasWifiPassword && (
                    <label className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-xs leading-5">
                      <input type="checkbox" checked={keepExistingPassword} onChange={(event) => setKeepExistingPassword(event.target.checked)} className="mt-1" />
                      <span><b>Keep saved password</b><span className="block text-text-muted">The existing password stays encrypted. It will not be shown here.</span></span>
                    </label>
                  )}
                  <label className="block space-y-1.5">
                    <span className="text-xs font-black">Wi-Fi Password {!keepExistingPassword && <span className="text-red-500">*</span>}</span>
                    <input value={wifiPassword} onChange={(event) => setWifiPassword(event.target.value)} minLength={keepExistingPassword ? undefined : 8} maxLength={63}
                      required={!keepExistingPassword} disabled={keepExistingPassword} autoComplete="new-password"
                      placeholder={keepExistingPassword ? "Saved password remains hidden" : "Enter new WPA2-PSK password"}
                      className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-accent disabled:opacity-50" />
                    <span className="block text-[10px] leading-4 text-text-muted">8–63 characters. Passwords are never returned in the device list.</span>
                  </label>
                </div>
              )}

              <div className="rounded-xl border border-border bg-background p-3 text-[11px] leading-5 text-text-muted">
                The server stores the password encrypted. The ESP32 tests the network and retains the last known-good settings if the new connection fails. A board that is offline cannot receive this update until it reconnects.
              </div>

              <button type="submit" disabled={submitting || !accessToken}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-[var(--btn-text)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <Cloud size={16} />}
                {submitting ? "Saving securely…" : "Save & start device update"}
              </button>
            </form>
          </section>

          <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black">Live update tracker</h2>
                <p className="mt-1 text-xs leading-5 text-text-muted">This tracker uses acknowledgements from the ESP32, not just a successful database write.</p>
              </div>
              {tracking && !isComplete && !isFailed && <LoaderCircle size={18} className="shrink-0 animate-spin text-accent" />}
              {isComplete && <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />}
              {isFailed && <XCircle size={20} className="shrink-0 text-red-500" />}
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-border">
              <div className={"h-full rounded-full transition-all duration-700 " + (isFailed ? "bg-red-500" : isComplete ? "bg-emerald-500" : "bg-accent animate-pulse")}
                style={{ width: progressPercent + "%" }} />
            </div>

            <div className="mt-5 space-y-3">
              {STEPS.map((step, index) => {
                const completed = isComplete || (!isFailed && index < currentStep) || (config.status === "applied" && index <= currentStep);
                const active = tracking && !isComplete && !isFailed && index === currentStep;
                return (
                  <div key={step.key} className="flex items-start gap-3">
                    <div className={"mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border " +
                      (completed ? "border-emerald-500 bg-emerald-500 text-white" : active ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-text-muted")}>
                      {completed ? <Check size={14} /> : active ? <LoaderCircle size={14} className="animate-spin" /> : <span className="text-[10px] font-black">{index + 1}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={"text-xs font-black " + (completed ? "text-emerald-500" : active ? "text-accent" : "text-text-muted")}>{step.label}</p>
                      <p className="mt-0.5 text-[11px] leading-5 text-text-muted">
                        {active && config.status === "pending" && index === 0 ? "Saved on server. Waiting for the ESP32 to check in." :
                         active && config.status === "checking_wifi" ? "Scanning for the selected network and testing connection settings." :
                         active && config.status === "sending" ? "The device has checked in and received the updated configuration." :
                         active && config.status === "applying" ? "The ESP32 is connecting, verifying, and saving the accepted settings." :
                         completed ? "Confirmed" : step.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {isComplete && (
              <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-emerald-500"><CheckCircle2 size={18} /> Update successful</div>
                <p className="mt-1 text-xs leading-5 text-text-muted">Configuration v{config.version} was applied and acknowledged by the ESP32.</p>
                <p className="mt-1 text-[10px] text-text-muted">Applied at {formatTime(config.appliedAt)} · Last device check-in {formatTime(config.lastSeenAt)}</p>
              </div>
            )}

            {isFailed && (
              <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/5 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-red-500"><XCircle size={18} /> Update failed</div>
                <p className="mt-1 break-words text-xs leading-5">{config.lastError || "The ESP32 could not apply this configuration. Check the network and retry."}</p>
                <p className="mt-1 text-[10px] text-text-muted">The previous settings should remain in use if rollback succeeded.</p>
              </div>
            )}

            {!isComplete && !isFailed && (
              <div className="mt-5 rounded-xl border border-border bg-background p-3 text-xs leading-5 text-text-muted">
                <div className="flex items-center gap-2 font-black text-text"><RadioTower size={14} /> Device communication</div>
                <p className="mt-1">{tracking ? "Waiting for firmware status updates…" : "No update is running. Save settings to start a tracked update."}</p>
                <p className="mt-1 text-[10px]">Last status refresh: {formatTime(lastFetchedAt)}</p>
                {!isOnline && tracking && <p className="mt-2 inline-flex items-center gap-1 font-bold text-amber-500"><WifiOff size={12} /> Device is offline; the update remains pending.</p>}
              </div>
            )}

            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-xs font-black">Live event log</h3>
              <div className="mt-3 space-y-2">
                {newestEvents.length ? newestEvents.map((item) => {
                  const Icon = eventIcon(item.status);
                  return (
                    <div key={item.id} className="flex items-start gap-2 text-[11px] leading-5">
                      <Icon size={14} className={"mt-0.5 shrink-0 " + (item.status === "applied" ? "text-emerald-500" : item.status === "failed" ? "text-red-500" : "text-accent " + (["pending", "sending", "checking_wifi", "applying"].includes(item.status) ? "animate-pulse" : ""))} />
                      <span className="min-w-0 flex-1 break-words">{item.message || item.status}</span>
                      <time className="shrink-0 text-[9px] text-text-muted">{formatTime(item.created_at)}</time>
                    </div>
                  );
                }) : (
                  <p className="text-[11px] leading-5 text-text-muted">No update events yet. Device check-ins and update attempts will appear here.</p>
                )}
              </div>
            </div>
          </section>
        </div>
        <p className="text-center text-[10px] leading-5 text-text-muted">Remote configuration applies only after the board is running the device-agent firmware. No firmware binary is flashed by this network update.</p>
      </div>
    </main>
  );
}
