"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap,
  RefreshCw,
  Power,
  AlertTriangle,
  Settings,
  ExternalLink,
  Cpu,
  Layers,
  WifiOff,
} from "lucide-react";
import {
  getLocalBaseUrl,
  setLocalBaseUrl,
  getLocalCandidateUrls,
  discoverLocalNode,
  fetchLocalStatus,
  fetchLocalDevices,
  setLocalDeviceState,
  triggerLocalAll,
} from "@/lib/localApi";

// Connection lifecycle:
//   connecting  -> probing candidate gateways (max ~1s)
//   connected   -> ESP32 answered, UI is usable
//   unavailable -> nothing answered (shows help, manual retry only)
const PHASE = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  UNAVAILABLE: "unavailable",
};

export default function LocalControlPage() {
  const [baseUrl, setBaseUrlState] = useState("http://192.168.4.1");
  const [customUrlInput, setCustomUrlInput] = useState("http://192.168.4.1");
  const [showConfig, setShowConfig] = useState(false);

  // connection | devices | latency | node info
  const [phase, setPhase] = useState(PHASE.CONNECTING);
  const [nodeInfo, setNodeInfo] = useState(null);
  const [meshNodes, setMeshNodes] = useState([]);
  const [devices, setDevices] = useState([]);

  const [togglingMap, setTogglingMap] = useState({}); // { [key]: boolean }
  const [allToggling, setAllToggling] = useState(null); // 'on' | 'off' | null
  const [latency, setLatency] = useState(null);
  const [activeScenario, setActiveScenario] = useState(1);
  const [toastMessage, setToastMessage] = useState(null);

  const refreshTimerRef = useRef(null);
  const connectAttemptRef = useRef(0);
  const baseUrlRef = useRef(baseUrl);
  baseUrlRef.current = baseUrl;

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  /**
   * Full connection attempt.
   * 1. Probe ALL candidate gateways in PARALLEL (first answer wins).
   * 2. Immediately load status + devices IN PARALLEL.
   * Total worst-case time to a decision: ~1 second - not a loading marathon.
   */
  const connect = useCallback(async () => {
    const attempt = ++connectAttemptRef.current;
    setPhase(PHASE.CONNECTING);
    try {
      // Generous first probe: Chrome may pause the request to show a
      // "Local network access" permission prompt (required for an HTTPS
      // site to talk to a plain-HTTP device like the ESP32).
      const { baseUrl: winnerUrl } = await discoverLocalNode(2500);
      setBaseUrlState(winnerUrl);
      setCustomUrlInput(winnerUrl);

      // Status & devices fetched simultaneously - one round trip each.
      const start = performance.now();
      const [statusData, deviceList] = await Promise.all([
        fetchLocalStatus(2200),
        fetchLocalDevices(2200).catch(() => []),
      ]);
      if (attempt !== connectAttemptRef.current) return;
      setLatency(Math.round(performance.now() - start));

      setNodeInfo(statusData);
      setDevices(deviceList);
      setPhase(PHASE.CONNECTED);
    } catch {
      if (attempt !== connectAttemptRef.current) return;
      setPhase(PHASE.UNAVAILABLE);
      setLatency(null);
    }
  }, []);

  /** Light silent state refresh while connected (paused when tab hidden). */
  const silentRefresh = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [deviceList] = await Promise.all([
        fetchLocalDevices(2200).catch(() => null),
      ]);
      if (deviceList) {
        setDevices(deviceList);
      } else {
        // Re-discover the endpoint if the saved AP/LAN address disappeared.
        connect();
      }
    } catch {
      // transient failure - next tick or explicit retry will recover
    }
  }, [connect]);

  // Initial connect + slow background beat (no aggressive polling).
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = getLocalBaseUrl();
      setBaseUrlState(saved);
      setCustomUrlInput(saved);
    }
    connect();

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [connect]);

  useEffect(() => {
    if (phase !== PHASE.CONNECTED) return;
    refreshTimerRef.current = setInterval(silentRefresh, 4000);
    return () => clearInterval(refreshTimerRef.current);
  }, [phase, silentRefresh]);

  // Group devices into rooms by their owning node.
  const rooms = [];
  const roomMap = {};
  for (const d of devices) {
    const key = d.node_id || "esp32";
    if (!roomMap[key]) {
      roomMap[key] = { nodeId: key, role: d.node_role, devices: [] };
      rooms.push(roomMap[key]);
    }
    roomMap[key].devices.push(d);
  }

  const handleToggle = async (device) => {
    const key = `${device.node_id || "local"}_${device.relay_index}`;
    const targetState = !device.is_on;

    setTogglingMap((prev) => ({ ...prev, [key]: true }));

    // Optimistic update
    setDevices((prev) =>
      prev.map((d) =>
        d.node_id === device.node_id && d.relay_index === device.relay_index
          ? { ...d, is_on: targetState }
          : d,
      ),
    );

    try {
      await setLocalDeviceState(device.relay_index, targetState, device.node_id);
      showToast(
        `Switch ${device.relay_index + 1} turned ${targetState ? "ON" : "OFF"}`,
      );
    } catch {
      showToast(
        `⚠️ Failed to switch Device ${device.relay_index + 1}. Check ESP32 connection.`,
      );
      setDevices((prev) =>
        prev.map((d) =>
          d.node_id === device.node_id && d.relay_index === device.relay_index
            ? { ...d, is_on: !targetState }
            : d,
        ),
      );
    } finally {
      setTogglingMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  // All ON/OFF - firmware fans this out across the mesh in one request.
  const handleToggleAll = async (targetState) => {
    const action = targetState ? "on" : "off";
    setAllToggling(action);

    // Optimistic update
    setDevices((prev) => prev.map((d) => ({ ...d, is_on: targetState })));

    try {
      await triggerLocalAll(action);
      showToast(`All switches turned ${targetState ? "ON" : "OFF"}`);
    } catch {
      showToast(`⚠️ Could not toggle all switches. Check connection.`);
      silentRefresh();
    } finally {
      setAllToggling(null);
    }
  };

  const handleSaveUrl = (e) => {
    e.preventDefault();
    let cleaned = customUrlInput.trim().replace(/\/+$/, "");
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      cleaned = `http://${cleaned}`;
    }
    setLocalBaseUrl(cleaned);
    setBaseUrlState(cleaned);
    setShowConfig(false);
    showToast(`Target updated to ${cleaned}`);
    connect();
  };

  const isConnected = phase === PHASE.CONNECTED;

  return (
    <div className="w-full min-h-screen bg-background text-text pt-16 sm:pt-20 pb-12 px-3.5 sm:px-6 lg:px-8 select-none">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed top-16 sm:top-20 right-3 left-3 sm:left-auto sm:right-6 z-50 bg-card border border-accent/50 text-text px-4 py-2.5 rounded-xl shadow-2xl animate-scale-in text-xs font-bold flex items-center justify-between sm:justify-start gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent animate-pulse shrink-0" />
              <span className="truncate">{toastMessage}</span>
            </div>
          </div>
        )}

        {/* Header Title Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card/60 backdrop-blur-xl border border-border p-4 sm:p-5 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border shrink-0 transition-all ${
                isConnected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                  : phase === PHASE.UNAVAILABLE
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              }`}
            >
              {phase === PHASE.UNAVAILABLE ? (
                <WifiOff className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-text truncate">
                  Local Control
                </h1>
                <span
                  className={`text-[9px] sm:text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                    isConnected
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : phase === PHASE.UNAVAILABLE
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  }`}
                >
                  {isConnected
                    ? `Connected · ${nodeInfo?.role || "node"}${meshNodes.length > 0 ? ` · ${meshNodes.length} nodes` : ""}`
                    : phase === PHASE.UNAVAILABLE
                      ? "Unavailable"
                      : "Connecting..."}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-text-muted mt-0.5 flex items-center gap-1.5 truncate">
                <span>
                  Target:{" "}
                  <strong className="font-mono text-text">{baseUrl}</strong>
                </span>
                {latency !== null && (
                  <span className="text-emerald-400 font-bold font-mono">
                    ({latency}ms)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2.5 sm:pt-0 border-border/40">
            <button
              onClick={() => connect()}
              disabled={phase === PHASE.CONNECTING}
              className="flex-1 sm:flex-none py-2 px-3 sm:p-2.5 rounded-xl border border-border bg-card-alt/40 hover:bg-card-alt text-text-muted hover:text-text transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50"
              title="Reconnect / Refresh State"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${phase === PHASE.CONNECTING ? "animate-spin text-accent" : ""}`}
              />
              <span>{isConnected ? "Refresh" : "Retry"}</span>
            </button>

            <button
              onClick={() => setShowConfig(!showConfig)}
              className="flex-1 sm:flex-none py-2 px-3 sm:p-2.5 rounded-xl border border-border bg-card-alt/40 hover:bg-card-alt text-text-muted hover:text-text transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold"
              title="Configure Endpoint"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>

        {/* Endpoint Configuration Bar (Collapsible) */}
        {showConfig && (
          <form
            onSubmit={handleSaveUrl}
            className="bg-card border border-border p-4 rounded-2xl shadow-lg space-y-3 animate-scale-in"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                ESP32 Local Gateway IP / Hostname
              </label>
              <span className="text-[11px] text-text-muted">
                Auto-probed:{" "}
                <code className="text-accent font-mono">
                  {getLocalCandidateUrls().join(", ")}
                </code>
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={customUrlInput}
                onChange={(e) => setCustomUrlInput(e.target.value)}
                placeholder="http://192.168.4.1"
                className="flex-1 bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono text-text focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="py-2.5 px-5 bg-accent hover:bg-accent-hover text-[var(--btn-text)] rounded-xl text-xs font-extrabold cursor-pointer transition-colors"
              >
                Save &amp; Connect
              </button>
            </div>
          </form>
        )}

        {/* Unavailable state - clear message + manual retry, NO endless spinner */}
        {phase === PHASE.UNAVAILABLE && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-amber-200">
                  No ESP32 found on {baseUrl}
                </h4>
                <p className="text-[11px] sm:text-xs text-amber-300/80 leading-relaxed">
                  <strong>Mobile Setup Checklist:</strong>
                  <br />
                  1️⃣ Connect Wi-Fi to <strong>HOME-AUTO-LEADER</strong> (Pass:{" "}
                  <code className="font-mono bg-black/30 px-1 py-0.5 rounded">
                    12345678
                  </code>
                  ).
                  <br />
                  2️⃣ <strong>Turn OFF Mobile Data (Cellular)</strong> so your
                  phone routes commands over Wi-Fi.
                  <br />
                  3️⃣ If the browser asks for <strong>&quot;Local network
                  access&quot;</strong> permission, tap <strong>Allow</strong>.
                  <br />
                  4️⃣ Tap Retry above, or open the direct AP panel.
                </p>
              </div>
            </div>
            <a
              href={baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto text-center shrink-0 flex items-center justify-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-4 py-2.5 rounded-xl text-xs font-extrabold border border-amber-500/40 transition-colors shadow-sm"
            >
              <span>Open Direct AP Panel</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Quick Batch Actions */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <button
            onClick={() => handleToggleAll(true)}
            disabled={!isConnected || allToggling !== null}
            className="flex items-center justify-center gap-2 py-3 px-3 sm:p-3.5 rounded-2xl bg-card border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 text-text font-extrabold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 min-h-[48px]"
          >
            {allToggling === "on" ? (
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
            ) : (
              <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>Turn All ON</span>
          </button>

          <button
            onClick={() => handleToggleAll(false)}
            disabled={!isConnected || allToggling !== null}
            className="flex items-center justify-center gap-2 py-3 px-3 sm:p-3.5 rounded-2xl bg-card border border-border hover:border-red-500/40 hover:bg-red-500/5 text-text font-extrabold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 min-h-[48px]"
          >
            {allToggling === "off" ? (
              <RefreshCw className="w-4 h-4 text-red-400 animate-spin shrink-0" />
            ) : (
              <Power className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>Turn All OFF</span>
          </button>
        </div>

        {/* Connecting skeleton - brief, only shown during the ~1s probe */}
        {phase === PHASE.CONNECTING && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl p-5 border border-border bg-card min-h-[140px] animate-pulse opacity-60"
              />
            ))}
          </div>
        )}

        {/* Room Sections (multi-board aware) */}
        {rooms.map((room) => (
          <div key={room.nodeId} className="space-y-3">
            {rooms.length > 1 && (
              <div className="flex items-center gap-2 pt-1">
                <Cpu className="w-3.5 h-3.5 text-accent shrink-0" />
                <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
                  {room.nodeId}
                  <span className="ml-2 text-[9px] normal-case font-bold text-accent">
                    ({room.role || "node"})
                  </span>
                </h2>
                <span className="flex-1 h-px bg-border/60" />
                <span className="text-[9px] font-bold text-text-muted">
                  {room.devices.filter((d) => d.is_on).length}/{room.devices.length} ON
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {room.devices.map((device) => {
                const key = `${room.nodeId}_${device.relay_index}`;
                const isToggling = togglingMap[key] || false;
                const isOn = device.is_on;
                const hasACFeedback = device.feedback_on;

                return (
                  <div
                    key={key}
                    className={`relative rounded-2xl p-4 sm:p-5 border transition-all duration-300 flex flex-col justify-between min-h-[140px] ${
                      isOn
                        ? "bg-gradient-to-br from-card to-emerald-950/20 border-emerald-500/40 shadow-[0_0_24px_rgba(16,185,129,0.12)]"
                        : "bg-card border-border hover:border-border/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border shrink-0 transition-all ${
                            isOn
                              ? "bg-emerald-500 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                              : "bg-card-alt text-text-muted border-border"
                          }`}
                        >
                          <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-xs sm:text-sm text-text">
                            Device {device.relay_index + 1}
                          </h3>
                          <p className="text-[10px] sm:text-[11px] text-text-muted font-mono">
                            Relay GPIO{" "}
                            {device.relay_index === 0
                              ? 32
                              : device.relay_index === 1
                                ? 33
                                : device.relay_index === 2
                                  ? 25
                                  : 26}
                          </p>
                        </div>
                      </div>

                      {/* Physical Wall Switch Status Pill */}
                      <span
                        className={`text-[9px] sm:text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border tracking-wider flex items-center gap-1 shrink-0 ${
                          hasACFeedback
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-border/40 text-text-muted border-border"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${hasACFeedback ? "bg-emerald-400 animate-pulse" : "bg-text-muted/60"}`}
                        />
                        {hasACFeedback ? "AC ON" : "AC OFF"}
                      </span>
                    </div>

                    {/* Bottom Action Button with Micro-Loader */}
                    <div className="mt-4 sm:mt-5 flex items-center justify-between gap-2 pt-3 border-t border-border/60">
                      <span className="text-[11px] sm:text-xs font-bold text-text-muted flex items-center gap-1 truncate">
                        <span>State:</span>
                        <strong
                          className={
                            isOn
                              ? "text-emerald-400 font-extrabold"
                              : "text-text-muted font-normal"
                          }
                        >
                          {isOn ? "ACTIVE (ON)" : "IDLE (OFF)"}
                        </strong>
                      </span>

                      <button
                        onClick={() => handleToggle(device)}
                        disabled={isToggling || !isConnected}
                        className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 min-h-[40px] shrink-0 ${
                          isOn
                            ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20"
                            : "bg-card-alt hover:bg-card-alt/80 text-text border border-border"
                        } disabled:opacity-50`}
                      >
                        {isToggling ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Switching...</span>
                          </>
                        ) : (
                          <>
                            <Power className="w-3.5 h-3.5" />
                            <span>{isOn ? "TURN OFF" : "TURN ON"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Mesh Status Diagnostics */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-lg space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent shrink-0" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-text">
                ESP32 Hardware Diagnostics
              </h3>
            </div>
            <span className="text-[10px] sm:text-[11px] text-text-muted">
              Auto-synced
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-xs">
            <div className="bg-card-alt/40 border border-border/60 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[9px] sm:text-[10px] text-text-muted font-bold block uppercase">
                Mesh Role
              </span>
              <span className="font-extrabold text-text uppercase font-mono text-xs">
                {nodeInfo?.role || "—"}
              </span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[9px] sm:text-[10px] text-text-muted font-bold block uppercase">
                Node ID
              </span>
              <span className="font-extrabold text-text font-mono text-xs truncate block">
                {nodeInfo?.nodeId || "—"}
              </span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[9px] sm:text-[10px] text-text-muted font-bold block uppercase">
                Mesh Nodes
              </span>
              <span className="font-extrabold text-accent font-mono text-xs truncate block">
                {(nodeInfo?.meshNodes ?? 0) > 0
                  ? `+${nodeInfo.meshNodes} members`
                  : "Single board"}
              </span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[9px] sm:text-[10px] text-text-muted font-bold block uppercase">
                Response Speed
              </span>
              <span className="font-extrabold text-emerald-400 font-mono text-xs">
                {latency !== null ? `${latency}ms` : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Architecture & Scenarios Guide */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-lg space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent shrink-0" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-text">
                Offline Scenarios &amp; Specs
              </h3>
            </div>
          </div>

          <div className="flex gap-1.5 border-b border-border/60 pb-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveScenario(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeScenario === 1
                  ? "bg-accent text-black font-extrabold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              Scenario 1: Internet Outage
            </button>
            <button
              onClick={() => setActiveScenario(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeScenario === 2
                  ? "bg-accent text-black font-extrabold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              Scenario 2: Cloud Sync
            </button>
            <button
              onClick={() => setActiveScenario(3)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeScenario === 3
                  ? "bg-accent text-black font-extrabold"
                  : "text-text-muted hover:text-text"
              }`}
            >
              Scenario 3: Wall Switches
            </button>
          </div>

          {activeScenario === 1 && (
            <div className="text-xs text-text-muted space-y-1.5 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">
                🔴 When Router / ISP Internet is completely DOWN:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] sm:text-xs">
                <li>
                  The elected LEADER ESP32 broadcasts SoftAP:{" "}
                  <strong className="text-text font-mono">
                    HOME-AUTO-LEADER
                  </strong>{" "}
                  (Pass: <code className="text-accent font-mono">12345678</code>
                  ).
                </li>
                <li>
                  Other room boards automatically join the leader as members -
                  all rooms stay controllable through one network.
                </li>
                <li>
                  Your commands are proxied by the leader to each room board
                  instantly.
                </li>
              </ul>
            </div>
          )}

          {activeScenario === 2 && (
            <div className="text-xs text-text-muted space-y-1.5 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">
                🟢 Store-and-Forward Auto Sync:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] sm:text-xs">
                <li>
                  Any switches toggled offline are queued in ESP32 non-volatile
                  memory (NVS).
                </li>
                <li>
                  When home Wi-Fi connects, each board flushes its queue to
                  Supabase automatically.
                </li>
                <li>
                  Zero lost state updates, full historical logging preserved.
                </li>
              </ul>
            </div>
          )}

          {activeScenario === 3 && (
            <div className="text-xs text-text-muted space-y-1.5 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">
                ⚡ Physical Wall Switch Integration (XOR Logic):
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] sm:text-xs">
                <li>
                  Flip any standard physical wall switch connected to GPIO 19,
                  18, 5, 17.
                </li>
                <li>
                  The board detects the change, toggles its relay, reports to
                  the leader instantly (event-driven), and syncs to the cloud
                  later.
                </li>
                <li>
                  If the board is a member, the leader reflects the change to
                  every connected client immediately.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
