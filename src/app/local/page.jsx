'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Zap, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Power, 
  CheckCircle2, 
  AlertTriangle, 
  Settings, 
  ShieldCheck, 
  Radio, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  ArrowRight,
  Info
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
  const [lastSynced, setLastSynced] = useState(null);
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
      setLastSynced(new Date());
    } catch (err) {
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
        showToast(`Device ${index + 1} turned ${targetState ? 'ON' : 'OFF'} (< 30ms)`);
      } else {
        throw new Error('Toggle request failed');
      }
    } catch (err) {
      showToast(`⚠️ Failed to toggle Device ${index + 1}. Check connection.`);
      fetchLocalState(true); // Re-sync
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
        showToast(`All devices turned ${targetState ? 'ON' : 'OFF'}`);
      } else {
        throw new Error('All toggle failed');
      }
    } catch (err) {
      showToast(`⚠️ Could not toggle all devices. Check connection.`);
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
    <div className="min-h-screen bg-background text-text selection:bg-accent selection:text-black py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed top-20 right-6 z-50 bg-card border border-accent/40 text-text px-4 py-2.5 rounded-xl shadow-2xl animate-scale-in text-xs font-bold flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent animate-pulse" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 backdrop-blur-xl border border-border p-5 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
              isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-text">
                  Local Autonomous Controller
                </h1>
                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {isConnected ? '⚡ Sub-30ms Mesh' : 'Probing AP...'}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                <span>Target: <strong className="font-mono text-text">{baseUrl}</strong></span>
                {latency !== null && (
                  <span className="text-emerald-400 font-bold font-mono">(&lt; {latency}ms)</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => fetchLocalState(false)}
              disabled={loading}
              className="p-2.5 rounded-xl border border-border bg-card-alt/40 hover:bg-card-alt text-text-muted hover:text-text transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="Refresh State"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-accent' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-2.5 rounded-xl border border-border bg-card-alt/40 hover:bg-card-alt text-text-muted hover:text-text transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="Configure Endpoint"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>

        {/* Endpoint Configuration Bar (Collapsible) */}
        {showConfig && (
          <form onSubmit={handleSaveUrl} className="bg-card border border-border p-4 rounded-2xl shadow-lg space-y-3 animate-scale-in">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                ESP32 Local Gateway IP / Hostname
              </label>
              <span className="text-[11px] text-text-muted">Default: <code className="text-accent font-mono">http://192.168.4.1</code></span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customUrlInput}
                onChange={(e) => setCustomUrlInput(e.target.value)}
                placeholder="http://192.168.4.1 or http://home-automation.local"
                className="flex-1 bg-background border border-border rounded-xl px-3.5 py-2 text-xs font-mono text-text focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-[var(--btn-text)] rounded-xl text-xs font-extrabold cursor-pointer transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Connection Notice / Offline Help Banner */}
        {!isConnected && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-amber-200">
                  ESP32 Local Server Not Detected at {baseUrl}
                </h4>
                <p className="text-xs text-amber-300/80 leading-relaxed">
                  To control devices directly offline: Connect your phone or laptop Wi-Fi to <strong>HOME-AUTO-LEADER</strong> (Password: <code className="font-mono bg-black/30 px-1 py-0.5 rounded">12345678</code>).
                </p>
              </div>
            </div>
            <a
              href={baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-2 rounded-xl text-xs font-bold border border-amber-500/40 transition-colors"
            >
              <span>Direct AP Panel</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Quick Batch Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleToggleAll(true)}
            disabled={allToggling !== null}
            className="flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-card border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 text-text font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {allToggling === 'on' ? (
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 text-emerald-400" />
            )}
            <span>Turn All ON</span>
          </button>

          <button
            onClick={() => handleToggleAll(false)}
            disabled={allToggling !== null}
            className="flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-card border border-border hover:border-red-500/40 hover:bg-red-500/5 text-text font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {allToggling === 'off' ? (
              <RefreshCw className="w-4 h-4 text-red-400 animate-spin" />
            ) : (
              <Power className="w-4 h-4 text-red-400" />
            )}
            <span>Turn All OFF</span>
          </button>
        </div>

        {/* 4 Device Control Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {devices.map((device, idx) => {
            const isToggling = togglingMap[device.relay_index] || false;
            const isOn = device.is_on;
            const hasACFeedback = device.feedback_on;

            return (
              <div
                key={device.relay_index}
                className={`relative rounded-2xl p-5 border transition-all duration-300 flex flex-col justify-between min-h-[145px] ${
                  isOn
                    ? 'bg-gradient-to-br from-card to-emerald-950/20 border-emerald-500/40 shadow-[0_0_24px_rgba(16,185,129,0.12)]'
                    : 'bg-card border-border hover:border-border/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                      isOn 
                        ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                        : 'bg-card-alt text-text-muted border-border'
                    }`}>
                      <Power className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-text">
                        Device {device.relay_index + 1}
                      </h3>
                      <p className="text-[11px] text-text-muted font-mono">
                        Relay Pin GPIO {device.relay_index === 0 ? 32 : device.relay_index === 1 ? 33 : device.relay_index === 2 ? 25 : 26}
                      </p>
                    </div>
                  </div>

                  {/* Physical Wall Switch Status Pill */}
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border tracking-wider flex items-center gap-1 ${
                    hasACFeedback
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-border/40 text-text-muted border-border'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${hasACFeedback ? 'bg-emerald-400' : 'bg-text-muted/60'}`} />
                    {hasACFeedback ? 'AC ON' : 'AC OFF'}
                  </span>
                </div>

                {/* Bottom Action Button with Micro-Loader */}
                <div className="mt-5 flex items-center justify-between gap-3 pt-3 border-t border-border/60">
                  <span className="text-xs font-bold text-text-muted flex items-center gap-1.5">
                    <span>Status:</span>
                    <strong className={isOn ? 'text-emerald-400 font-extrabold' : 'text-text-muted font-normal'}>
                      {isOn ? 'ACTIVE (ON)' : 'IDLE (OFF)'}
                    </strong>
                  </span>

                  <button
                    onClick={() => handleToggle(device.relay_index, !isOn)}
                    disabled={isToggling}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
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
        <div className="bg-card border border-border rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-text">
                ESP32 Hardware Diagnostics
              </h3>
            </div>
            <span className="text-[11px] text-text-muted">
              Auto-synced every 2.5s
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-card-alt/40 border border-border/60 p-3 rounded-xl">
              <span className="text-[10px] text-text-muted font-bold block uppercase">Mesh Role</span>
              <span className="font-extrabold text-text uppercase font-mono">{nodeInfo?.role || 'Leader Node'}</span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-3 rounded-xl">
              <span className="text-[10px] text-text-muted font-bold block uppercase">SoftAP SSID</span>
              <span className="font-extrabold text-text font-mono">HOME-AUTO-LEADER</span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-3 rounded-xl">
              <span className="text-[10px] text-text-muted font-bold block uppercase">Active Gateway</span>
              <span className="font-extrabold text-accent font-mono">{baseUrl}</span>
            </div>
            <div className="bg-card-alt/40 border border-border/60 p-3 rounded-xl">
              <span className="text-[10px] text-text-muted font-bold block uppercase">Response Speed</span>
              <span className="font-extrabold text-emerald-400 font-mono">
                {latency !== null ? `< ${latency}ms` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Architecture & Scenarios Guide (For Maker Conclave Judges & Users) */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-text">
                Dual-Plane & Offline Scenarios Explained
              </h3>
            </div>
          </div>

          <div className="flex gap-2 border-b border-border/60 pb-2">
            <button
              onClick={() => setActiveScenario(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeScenario === 1 ? 'bg-accent text-black font-extrabold' : 'text-text-muted hover:text-text'
              }`}
            >
              Scenario 1: Internet Outage
            </button>
            <button
              onClick={() => setActiveScenario(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeScenario === 2 ? 'bg-accent text-black font-extrabold' : 'text-text-muted hover:text-text'
              }`}
            >
              Scenario 2: Cloud Recovery
            </button>
            <button
              onClick={() => setActiveScenario(3)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeScenario === 3 ? 'bg-accent text-black font-extrabold' : 'text-text-muted hover:text-text'
              }`}
            >
              Scenario 3: Wall Switches
            </button>
          </div>

          {activeScenario === 1 && (
            <div className="text-xs text-text-muted space-y-2 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">🔴 When Router / ISP Internet is completely DEAD:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>ESP32 concurrently broadcasts SoftAP: <strong className="text-text font-mono">HOME-AUTO-LEADER</strong> (Pass: <code className="text-accent font-mono">12345678</code>).</li>
                <li>Your phone connects directly to the ESP32 chip over local radio waves.</li>
                <li>This local page sends direct HTTP POST requests to <code className="text-text font-mono">192.168.4.1</code> with sub-30ms execution.</li>
              </ul>
            </div>
          )}

          {activeScenario === 2 && (
            <div className="text-xs text-text-muted space-y-2 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">🟢 Store-and-Forward Cloud Auto-Sync:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Any switches flipped while offline are placed in the ESP32's local RAM/NVS queue.</li>
                <li>The moment home Wi-Fi reconnects, the ESP32 flushes its queue to Supabase automatically.</li>
                <li>Zero lost state updates, full historical logging preserved.</li>
              </ul>
            </div>
          )}

          {activeScenario === 3 && (
            <div className="text-xs text-text-muted space-y-2 leading-relaxed animate-scale-in">
              <p className="text-text font-bold">⚡ Bidirectional Physical Wall Switch Support (XOR Logic):</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Flip any standard manual wall switch connected to GPIO 19, 18, 5, 17.</li>
                <li>The ESP32 detects the hardware edge interrupt, toggles the light, and updates the <strong className="text-emerald-400">AC ON / AC OFF</strong> pill on this screen in real-time.</li>
              </ul>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
