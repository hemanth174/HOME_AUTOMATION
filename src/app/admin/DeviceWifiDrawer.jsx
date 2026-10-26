"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle, CheckCircle2, Cloud, Download, LoaderCircle, Power,
  RefreshCw, Wifi, WifiOff, X,
} from "lucide-react";

const WIFI_SSID_RE = /^[\x20-\x7e]{1,32}$/;
const WIFI_PASSWORD_RE = /^[\x20-\x7e]{8,63}$/;

function ago(value) {
  if (!value) return "never";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return seconds + "s ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  return Math.floor(seconds / 3600) + "h ago";
}

function downloadFirmware(data, device) {
  const blob = new Blob([data.firmware], { type: "text/x-c++src;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = data.fileName || (device.boardIdentifier + ".cpp");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function DeviceWifiDrawer({
  device, mode, accessToken, refreshing, onClose, onSaved, onDownloaded, onCheckConnection,
}) {
  const isEnroll = mode === "enroll";
  const lastFormKey = useRef("");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiSecurity, setWifiSecurity] = useState("wpa2_psk");
  const [wifiPassword, setWifiPassword] = useState("");
  const [keepExistingPassword, setKeepExistingPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const config = device.config || {};
  const directOnline = Boolean(config.directOnline);
  const meshOnline = Boolean(config.meshOnline);
  const online = Boolean(config.online);

  useEffect(() => {
    const formKey = device.id + ":" + mode;
    if (lastFormKey.current === formKey) return;
    lastFormKey.current = formKey;
    if (isEnroll) {
      setWifiSsid("");
      setWifiSecurity("wpa2_psk");
      setWifiPassword("");
      setKeepExistingPassword(false);
    } else {
      const security = config.wifiSecurity === "open" ? "open" : "wpa2_psk";
      setWifiSsid(config.wifiSsid || "");
      setWifiSecurity(security);
      setKeepExistingPassword(Boolean(config.hasWifiPassword && security === "wpa2_psk"));
      setWifiPassword("");
    }
    setError("");
    setNotice("");
  }, [device.id, mode, isEnroll, config]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submitting, onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const ssid = wifiSsid.trim();
    if (!WIFI_SSID_RE.test(ssid)) {
      setError("Wi-Fi name is required and must be 1–32 supported printable characters.");
      return;
    }
    if (wifiSecurity === "wpa2_psk" && !keepExistingPassword && !WIFI_PASSWORD_RE.test(wifiPassword)) {
      setError("Enter a WPA2-PSK password of 8–63 characters, or keep the saved password.");
      return;
    }
    if (wifiSecurity === "open" && wifiPassword.length > 0) {
      setError("Open networks must not include a password.");
      return;
    }
    if (!isEnroll && !directOnline) {
      setError("This board needs a live direct connection before Wi-Fi changes can be sent.");
      return;
    }
    setSubmitting(true);
    try {
      if (isEnroll) {
        const response = await fetch("/api/admin/devices/" + device.id + "/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
          body: JSON.stringify({
            wifiSsid: ssid,
            wifiSecurity,
            wifiPassword: wifiSecurity === "open" ? "" : wifiPassword,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not prepare enrollment firmware");
        downloadFirmware(data, device);
        onDownloaded?.(data);
        onClose?.();
      } else {
        const response = await fetch("/api/admin/devices/" + device.id + "/configuration", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
          body: JSON.stringify({
            wifiSsid: ssid,
            wifiSecurity,
            wifiPassword: wifiSecurity === "open" ? "" : keepExistingPassword ? "" : wifiPassword,
            keepExistingPassword: wifiSecurity === "wpa2_psk" && keepExistingPassword,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not save Wi-Fi configuration");
        setNotice("Configuration v" + data.version + " saved securely. The ESP32 will validate and apply it on its next check-in.");
        setWifiPassword("");
        onSaved?.(data);
      }
    } catch (err) {
      setError(err.message || "Could not save Wi-Fi configuration");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && Boolean(accessToken) && (isEnroll || directOnline);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-stretch md:justify-end"
      onClick={() => { if (!submitting) onClose?.(); }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-wifi-title"
        className="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[24px] border border-border bg-card shadow-2xl md:h-full md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-r-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div data-sheet-handle="1" className="mx-auto mt-2.5 h-1 w-12 shrink-0 rounded-full bg-border md:hidden" />

        <header className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">
              {isEnroll ? "First-boot Wi-Fi" : "Remote Wi-Fi configuration"}
            </p>
            <h2 id="device-wifi-title" className="mt-1 break-words text-lg font-black sm:text-xl">
              {isEnroll ? "Set up this ESP32" : "Update Wi-Fi"}
            </h2>
            <p className="mt-1 break-words text-xs font-semibold text-text-muted">
              {device.name || "ESP32 board"}
            </p>
            <p className="mt-0.5 break-all font-mono text-[10px] text-text-muted">
              {device.boardIdentifier}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close Wi-Fi editor"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border p-2 text-text-muted hover:text-text disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {!isEnroll && (
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Power
                      size={17}
                      className={directOnline ? "text-emerald-500" : meshOnline ? "text-amber-500" : "text-text-muted"}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-black">
                        {directOnline
                          ? "Direct connection live"
                          : meshOnline
                            ? "Local mesh only"
                            : online
                              ? "No direct link"
                              : "Offline"}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        Last check-in: {ago(config.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onCheckConnection}
                    disabled={refreshing}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[10px] font-black hover:border-accent disabled:opacity-50"
                  >
                    {refreshing ? <RefreshCw size={13} className="animate-spin" /> : <Power size={13} />}
                    {refreshing ? "Checking…" : "Check connection"}
                  </button>
                </div>
                {!directOnline && (
                  <p className="mt-2 text-[11px] leading-5 text-amber-600">
                    Wi-Fi changes are locked until this exact board checks in directly.
                    {meshOnline ? " It is currently reachable through the local mesh leader only." : " Reconnect it to its home Wi-Fi and refresh."}
                  </p>
                )}
              </div>
            )}

            {isEnroll && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-[11px] leading-5">
                <div className="flex items-center gap-2 font-black">
                  <Wifi size={14} /> Built into the firmware
                </div>
                <p className="mt-1 text-text-muted">
                  These credentials are compiled into the downloaded file. After the first USB flash the board connects automatically, so there is no local setup page to open.
                </p>
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/5 p-3 text-xs font-semibold leading-5 text-red-500">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{error}</span>
              </div>
            )}
            {notice && (
              <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs font-semibold leading-5 text-emerald-600">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{notice}</span>
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-black">
                Wi-Fi name (SSID) <span className="text-red-500">*</span>
              </span>
              <input
                value={wifiSsid}
                onChange={(event) => setWifiSsid(event.target.value)}
                maxLength={32}
                required
                autoComplete="off"
                placeholder="Customer Wi-Fi name"
                 className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base font-semibold outline-none focus:border-accent sm:text-sm"
              />
              <span className="block text-xs leading-5 text-amber-600">
                ESP32 boards support 2.4 GHz Wi-Fi only. A 5 GHz-only SSID will not connect; choose the router's 2.4 GHz network.
              </span>
            </label>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-black">Wi-Fi security</legend>
              <label className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 " + (wifiSecurity === "open" ? "border-accent bg-accent/5" : "border-border")}>
                <input
                  type="radio"
                  name="wifiSecurity"
                  value="open"
                  checked={wifiSecurity === "open"}
                  onChange={() => { setWifiSecurity("open"); setKeepExistingPassword(false); setWifiPassword(""); }}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black">Open network</span>
                  <span className="mt-0.5 block text-xs leading-5 text-text-muted">No password is required.</span>
                </span>
              </label>
              <label className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 " + (wifiSecurity === "wpa2_psk" ? "border-accent bg-accent/5" : "border-border")}>
                <input
                  type="radio"
                  name="wifiSecurity"
                  value="wpa2_psk"
                  checked={wifiSecurity === "wpa2_psk"}
                  onChange={() => setWifiSecurity("wpa2_psk")}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black">WPA2-PSK</span>
                  <span className="mt-0.5 block text-xs leading-5 text-text-muted">Password-protected router or hotspot.</span>
                </span>
              </label>
            </fieldset>

            {wifiSecurity === "wpa2_psk" && (
              <div className="space-y-2">
                {!isEnroll && config.hasWifiPassword && (
                  <label className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-xs leading-5">
                    <input
                      type="checkbox"
                      checked={keepExistingPassword}
                      onChange={(event) => setKeepExistingPassword(event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <b>Keep saved password</b>
                      <span className="block text-text-muted">The existing password stays encrypted and is never shown here.</span>
                    </span>
                  </label>
                )}
                <label className="block space-y-1.5">
                  <span className="text-xs font-black">
                    Wi-Fi password {!keepExistingPassword && <span className="text-red-500">*</span>}
                  </span>
                  <input
                    value={wifiPassword}
                    onChange={(event) => setWifiPassword(event.target.value)}
                    minLength={keepExistingPassword ? undefined : 8}
                    maxLength={63}
                    required={!keepExistingPassword}
                    disabled={keepExistingPassword}
                    autoComplete="new-password"
                    placeholder={keepExistingPassword ? "Saved password remains hidden" : "Enter WPA2-PSK password"}
                     className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base font-semibold outline-none focus:border-accent disabled:opacity-50 sm:text-sm"
                  />
                  <span className="block text-[10px] leading-4 text-text-muted">
                    8–63 characters. Passwords are stored encrypted and never returned to the browser.
                  </span>
                </label>
              </div>
            )}

            <div className="rounded-xl border border-border bg-background p-3 text-[11px] leading-5 text-text-muted">
              {isEnroll
                ? "If the first Wi-Fi connection fails, re-enter the SSID/password here and download the firmware again for another USB flash."
                : "The ESP32 tests the new network and keeps the last known-good settings if the connection fails. An offline board will receive this change when it reconnects directly."}
            </div>
          </div>

          <footer className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-black text-text hover:bg-card-alt disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-[var(--btn-text)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? <LoaderCircle size={15} className="animate-spin" />
                  : isEnroll
                    ? <Download size={15} />
                    : <Cloud size={15} />}
                {submitting
                  ? isEnroll ? "Preparing firmware…" : "Saving securely…"
                  : isEnroll ? "Download enrollment firmware" : "Save Wi-Fi configuration"}
              </button>
            </div>
            {!isEnroll && !directOnline && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600">
                <WifiOff size={12} /> Save unlocks when the board is directly online.
              </p>
            )}
          </footer>
        </form>
      </aside>
    </div>,
    document.body
  );
}
