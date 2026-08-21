'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Zap, 
  RefreshCw, 
  Power, 
  AlertTriangle, 
  Settings, 
  ExternalLink,
  Cpu,
  Layers
} from 'lucide-react';
import { getLocalBaseUrl, setLocalBaseUrl } from '@/lib/localApi';

export default function LocalControlPage() {
  const [baseUrl, setBaseUrl] = useState('http://192.168.4.1');
  const [customUrlInput, setCustomUrlInput] = useState('http://192.168.4.1');
  const [showConfig, setShowConfig] = useState(false);
  
  const [isConnected, setIsConnected] = useState(false);
  const [nodeInfo, setNodeInfo] = useState(null);
  const [devices, setDevices] = useState([
    { id: 0, relay_index: 0, is_on: false, feedback_on: false },
    { id: 1, relay_index: 1, is_on: false, feedback_on: false },
    { id: 2, relay_index: 2, is_on: false, feedback_on: false },
    { id: 3, relay_index: 3, is_on: false, feedback_on: false },
  ]);
  
  const [loading, setLoading] = useState(true);
  const [togglingMap, setTogglingMap] = useState({}); // { [index]: boolean }
  const [allToggling, setAllToggling] = useState(null); // 'on' | 'off' | null
  const [latency, setLatency] = useState(null);
  const [activeScenario, setActiveScenario] = useState(1);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load saved Base URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = getLocalBaseUrl();
      setBaseUrl(saved);
      setCustomUrlInput(saved);
    }
  }, []);

  // Fetch Node Status and Device states directly from ESP32
  const fetchLocalState = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    const start = performance.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);

      // 1. Fetch Status
      const statusRes = await fetch(`${baseUrl}/api/status`, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      });
      clearTimeout(timeout);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setNodeInfo(statusData);
        setIsConnected(true);
        const diff = Math.round(performance.now() - start);
        setLatency(diff);
      } else {
        throw new Error('Status returned non-200');
      }

      // 2. Fetch Devices
      const devController = new AbortController();
      const devTimeout = setTimeout(() => devController.abort(), 1200);
      const devRes = await fetch(`${baseUrl}/api/devices`, {
        signal: devController.signal,
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      });
      clearTimeout(devTimeout);

      if (devRes.ok) {
        const devData = await devRes.json();
        if (Array.isArray(devData) && devData.length > 0) {
          setDevices(devData);
        }
      }
    } catch {
      setIsConnected(false);
      setLatency(null);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [baseUrl]);

  // Initial load and polling every 2.5 seconds
  useEffect(() => {
    fetchLocalState(false);
    const interval = setInterval(() => {
      fetchLocalState(true);
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchLocalState]);

  // Toggle single device with instant optimistic UI & loader
  const handleToggle = async (index, targetState) => {
    setTogglingMap(prev => ({ ...prev, [index]: true }));

    // Optimistic update
    setDevices(prev => prev.map(d => d.relay_index === index ? { ...d, is_on: targetState } : d));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(`${baseUrl}/api/device/${index}/state`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: Boolean(targetState) }),
        mode: 'cors'
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        setDevices(prev => prev.map(d => d.relay_index === index ? { ...d, is_on: data.state } : d));
        showToast(`Switch ${index + 1} turned ${targetState ? 'ON' : 'OFF'} (< 30ms)`);
      } else {
        throw new Error('Toggle request failed');
      }
    } catch {
      showToast(`⚠️ Failed to switch Device ${index + 1}. Check ESP32 connection.`);
      fetchLocalState(true);
    } finally {
      setTogglingMap(prev => ({ ...prev, [index]: false }));
    }
  };

  // Toggle all devices
  const handleToggleAll = async (targetState) => {
    const action = targetState ? 'on' : 'off';
    setAllToggling(action);

    // Optimistic update
    setDevices(prev => prev.map(d => ({ ...d, is_on: targetState })));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${baseUrl}/api/all/${action}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      });
      clearTimeout(timeout);

      if (res.ok) {
        showToast(`All switches turned ${targetState ? 'ON' : 'OFF'}`);
      } else {
        throw new Error('All toggle failed');
      }
    } catch {
      showToast(`⚠️ Could not toggle all switches. Check connection.`);
      fetchLocalState(true);
    } finally {
      setAllToggling(null);
    }
  };

  // Save new Base URL
  const handleSaveUrl = (e) => {
    e.preventDefault();
    let cleaned = customUrlInput.trim().replace(/\/+$/, '');
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = `http://${cleaned}`;
    }
    setBaseUrl(cleaned);
    setLocalBaseUrl(cleaned);
    setShowConfig(false);
    showToast(`Target updated to ${cleaned}`);
  };

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
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border shrink-0 transition-all ${
              isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl font-extrabold tracking-tight text-text truncate">
                  Local Control
                </h1>
                <span className={`text-[9px] sm:text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {isConnected ? '⚡ Sub-30ms Mesh' : 'Probing AP...'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-text-muted mt-0.5 flex items-center gap-1.5 truncate">
                <span>Target: <strong className="font-mono text-text">{baseUrl}</strong></span>
                {latency !== null && (
                  <span className="text-emerald-400 font-bold font-mono">(&lt; {latency}ms)</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2.5 sm:pt-0 border-border/40">
            <button
              onClick={() => fetchLocalState(false)}
              disabled={loading}
              className="flex-1 sm:flex-none py-2 px-3 sm:p-2.5 rounded-xl border border-border bg-card-alt/40 hover:bg-card-alt text-text-muted hover:text-text transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold"
              title="Refresh State"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
              <span>Refresh</span>
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
          <form onSubmit={handleSaveUrl} className="bg-card border border-border p-4 rounded-2xl shadow-lg space-y-3 animate-scale-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                ESP32 Local Gateway IP / Hostname
              </label>
              <span className="text-[11px] text-text-muted">Default: <code className="text-accent font-mono">http://192.168.4.1</code></span>
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
                Save Target
              </button>
            </div>
          </form>
        )}

        {/* Connection Notice / Offline Help Banner */}
        {!isConnected && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-amber-200">
                  ESP32 Local Gateway Not Detected ({baseUrl})
                </h4>
                <p className="text-[11px] sm:text-xs text-amber-300/80 leading-relaxed">
                  To operate switches offline without internet: Connect mobile Wi-Fi to <strong>HOME-AUTO-LEADER</strong> (Pass: <code className="font-mono bg-black/30 px-1 py-0.5 rounded">12345678</code>).
                </p>
              </div>
            </div>
            <a
              href={baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto text-center shrink-0 flex items-center justify-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-2 rounded-xl text-xs font-bold border border-amber-500/40 transition-colors"
            >
              <span>AP Setup Page</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Quick Batch Actions */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <button
            onClick={() => handleToggleAll(true)}
            disabled={allToggling !== null}
            className="flex items-center justify-center gap-2 py-3 px-3 sm:p-3.5 rounded-2xl bg-card border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 text-text font-extrabold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 min-h-[48px]"
          >
            {allToggling === 'on' ? (
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
            ) : (
              <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>Turn All ON</span>
          </button>

          <button
            onClick={() => handleToggleAll(false)}
            disabled={allToggling !== null}
            className="flex items-center justify-center gap-2 py-3 px-3 sm:p-3.5 rounded-2xl bg-card border border-border hover:border-red-500/40 hover:bg-red-500/5 text-text font-extrabold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50 min-h-[48px]"
          >
            {allToggling === 'off' ? (
              <RefreshCw className="w-4 h-4 text-red-400 animate-spin shrink-0" />
            ) : (
              <Power className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>Turn All OFF</span>
          </button>
        </div>

        {/* 4 Device Control Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {devices.map((device) => {
            const isToggling = togglingMap[device.relay_index] || false;
            const isOn = device.is_on;
            const hasACFeedback = device.feedback_on;

            return (
              <div
                key={device.relay_index}
                className={`relative rounded-2xl p-4 sm:p-5 border transition-all duration-300 flex flex-col justify-between min-h-[140px] ${
                  isOn
                    ? 'bg-gradient-to-br from-card to-emerald-950/20 border-emerald-500/40 shadow-[0_0_24px_rgba(16,185,129,0.12)]'
                    : 'bg-card border-border hover:border-border/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border shrink-0 transition-all ${
                      isOn 
                        ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                        : 'bg-card-alt text-text-muted border-border'
                    }`}>
                      <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-xs sm:text-sm text-text">
                        Device {device.relay_index + 1}
                      </h3>
                      <p className="text-[10px] sm:text-[11px] text-text-muted font-mono">
                        Relay GPIO {device.relay_index === 0 ? 32 : device.relay_index === 1 ? 33 : device.relay_index === 2 ? 25 : 26}
                      </p>
                    </div>
                  </div>

                  {/* Physical Wall Switch Status Pill */}
                  <span className={`text-[9px] sm:text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border tracking-wider flex items-center gap-1 shrink-0 ${
                    hasACFeedback
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-border/40 text-text-muted border-border'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasACFeedback ? 'bg-emerald-400 animate-pulse' : 'bg-text-muted/60'}`} />
                    {hasACFeedback ? 'AC ON' : 'AC OFF'}
                  </span>
                </div>

                {/* Bottom Action Button with Micro-Loader */}
                <div className="mt-4 sm:mt-5 flex items-center justify-between gap-2 pt-3 border-t border-border/60">
                  <span className="text-[11px] sm:text-xs font-bold text-text-muted flex items-center gap-1 truncate">
                    <span>State:</span>
                    <strong className={isOn ? 'text-emerald-400 font-extrabold' : 'text-text-muted font-normal'}>
                      {isOn ? 'ACTIVE (ON)' : 'IDLE (OFF)'}
                    </strong>
                  </span>

                  <button
                    onClick={() => handleToggle(device.relay_index, !isOn)}
                    disabled={isToggling}
                    className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 min-h-[40px] shrink-0 ${
                      isOn
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                        : 'bg-card-alt hover:bg-card-alt/80 text-text border border-border'
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
                        <span>{isOn ? 'TURN OFF' : 'TURN ON'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

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
              <span className="text-[9px] sm:text-[10px] text-text-muted font-bold block uppercase">Mesh Role</span>
              <span className="font-extrabold text-text uppercase font-mono text-xs">{nodeInfo?.role || 'Leader Node'}</span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[9px] sm:text-[10px] text-text-muted font-bold block uppercase">SoftAP SSID</span>
              <span className="font-extrabold text-text font-mono text-xs truncate block">HOME-AUTO-LEADER</span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[9px] sm:text-[10px] text-text-muted font-bold block uppercase">Active Gateway</span>
              <span className="font-extrabold text-accent font-mono text-xs truncate block">{baseUrl}</span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-2.5 sm:p-3 rounded-xl">
              <span className="text-[9px] sm:text-[10px] text-text-muted font-bold block uppercase">Response Speed</span>
              <span className="font-extrabold text-emerald-400 font-mono text-xs">
                {latency !== null ? `< ${latency}ms` : '—'}
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
                Offline Scenarios & Specs
              </h3>
            </div>
          </div>

          <div className="flex gap-1.5 border-b border-border/60 pb-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveScenario(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeScenario === 1 ? 'bg-accent text-black font-extrabold' : 'text-text-muted hover:text-text'
              }`}
            >
              Scenario 1: Internet Outage
            </button>
            <button
              onClick={() => setActiveScenario(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeScenario === 2 ? 'bg-accent text-black font-extrabold' : 'text-text-muted hover:text-text'
              }`}
            >
              Scenario 2: Cloud Sync
            </button>
            <button
              onClick={() => setActiveScenario(3)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeScenario === 3 ? 'bg-accent text-black font-extrabold' : 'text-text-muted hover:text-text'
              }`}
            >
              Scenario 3: Wall Switches
            </button>
          </div>

          {activeScenario === 1 && (
            <div className="text-xs text-text-muted space-y-1.5 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">🔴 When Router / ISP Internet is completely DOWN:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] sm:text-xs">
                <li>ESP32 broadcasts SoftAP: <strong className="text-text font-mono">HOME-AUTO-LEADER</strong> (Pass: <code className="text-accent font-mono">12345678</code>).</li>
                <li>Your phone connects directly over Wi-Fi radio waves.</li>
                <li>This Local Control page dispatches HTTP POST requests to <code className="text-text font-mono">192.168.4.1</code> with sub-30ms response time.</li>
              </ul>
            </div>
          )}

          {activeScenario === 2 && (
            <div className="text-xs text-text-muted space-y-1.5 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">🟢 Store-and-Forward Auto Sync:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] sm:text-xs">
                <li>Any switches toggled offline are queued in ESP32 non-volatile memory (NVS).</li>
                <li>When home Wi-Fi connects, the ESP32 flushes its queue to Supabase automatically.</li>
                <li>Zero lost state updates, full historical logging preserved.</li>
              </ul>
            </div>
          )}

          {activeScenario === 3 && (
            <div className="text-xs text-text-muted space-y-1.5 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">⚡ Physical Wall Switch Integration (XOR Logic):</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] sm:text-xs">
                <li>Flip any standard physical wall switch connected to GPIO 19, 18, 5, 17.</li>
                <li>The ESP32 detects the hardware state change, toggles the relay, and updates the <strong className="text-emerald-400">AC ON / AC OFF</strong> pill in real-time.</li>
              </ul>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
