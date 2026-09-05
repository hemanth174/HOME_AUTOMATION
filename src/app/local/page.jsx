"use client";

import { useCallback, useEffect, useState } from "react";
import { Power, RefreshCw, WifiOff } from "lucide-react";
import {
  discoverLocalNode,
  fetchLocalDevices,
  setLocalDeviceState,
} from "@/lib/localApi";
import useLocalConnection from "@/hooks/useLocalConnection";

const LOCAL_DEVICES_CACHE = "home_auto_cached_local_devices";

export default function LocalControlPage() {
  const { isLocalConnected, localUrl, checkConnection } = useLocalConnection();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localPageConnected, setLocalPageConnected] = useState(false);
  const [busy, setBusy] = useState({});

  const loadDevices = useCallback(async (rediscover = false) => {
    setLoading(true);
    try {
      if (rediscover) await discoverLocalNode(2500);
      setLocalPageConnected(true);
      const nextDevices = await fetchLocalDevices(2500);
      setDevices(nextDevices);
      localStorage.setItem(LOCAL_DEVICES_CACHE, JSON.stringify(nextDevices));
      setError("");
    } catch {
      if (!rediscover) {
        try {
          await discoverLocalNode(2500);
          setLocalPageConnected(true);
          const nextDevices = await fetchLocalDevices(2500);
          setDevices(nextDevices);
          localStorage.setItem(LOCAL_DEVICES_CACHE, JSON.stringify(nextDevices));
          setError("");
        } catch {
          setLocalPageConnected(false);
          setError("The ESP32 answered, but its device list could not be loaded.");
        }
      } else {
        setLocalPageConnected(false);
        setError("Connect to HOME-AUTO-LEADER and allow local network access.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(LOCAL_DEVICES_CACHE) || "[]");
      if (Array.isArray(cached) && cached.length) {
        setDevices(cached);
        setLoading(false);
      }
    } catch {
      // Ignore invalid cache and wait for the live request.
    }
    loadDevices(true);
    const timer = setInterval(() => loadDevices(false), 5000);
    return () => clearInterval(timer);
  }, [loadDevices]);

  const toggle = async (device) => {
    const key = `${device.node_id || "local"}-${device.relay_index}`;
    const nextState = !device.is_on;
    setBusy((current) => ({ ...current, [key]: true }));
    setDevices((current) => current.map((item) => item.id === device.id ? { ...item, is_on: nextState } : item));
    try {
      await setLocalDeviceState(device.relay_index, nextState, device.node_id);
    } catch {
      setDevices((current) => current.map((item) => item.id === device.id ? { ...item, is_on: !nextState } : item));
      await checkConnection();
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  };

  return (
    <main className="min-h-screen bg-background text-text px-4 pt-24 pb-12">
      <section className="max-w-4xl mx-auto space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">Local Control</h1>
            <p className="text-xs text-text-muted mt-1">Direct ESP32 device control</p>
          </div>
          <button onClick={() => loadDevices(true)} disabled={loading} className="rounded-xl border border-border p-3 cursor-pointer disabled:opacity-50" aria-label="Refresh local devices">
            <RefreshCw className={loading ? "animate-spin" : ""} size={18} />
          </button>
        </header>

        <div className={`rounded-2xl border p-4 text-sm ${isLocalConnected || localPageConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
          {isLocalConnected || localPageConnected ? `Connected to ESP32 at ${localUrl}` : "ESP32 is unavailable. Connect to HOME-AUTO-LEADER Wi-Fi and retry."}
        </div>

        {loading && <p className="text-sm text-text-muted">Loading local devices...</p>}
        {!loading && !devices.length && (
          <div className="rounded-2xl border border-border p-8 text-center text-text-muted">
            <WifiOff className="mx-auto mb-3" size={28} />
            {error || "No ESP32 devices found."}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {devices.map((device) => {
            const key = `${device.node_id || "local"}-${device.relay_index}`;
            return (
              <button key={device.id} onClick={() => toggle(device)} disabled={busy[key] || !(isLocalConnected || localPageConnected)} className="rounded-2xl border border-border bg-card p-5 text-left cursor-pointer disabled:opacity-50">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{device.node_id || "ESP32"} · Device {device.relay_index + 1}</span>
                  <Power size={20} className={device.is_on ? "text-emerald-400" : "text-text-muted"} />
                </div>
                <p className={`mt-4 text-sm font-black ${device.is_on ? "text-emerald-400" : "text-text-muted"}`}>
                  {busy[key] ? "Switching..." : device.is_on ? "ON" : "OFF"}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
