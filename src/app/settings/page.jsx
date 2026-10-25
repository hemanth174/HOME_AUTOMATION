"use client";

import { useEffect, useState } from "react";
import { Bell, Mic, SlidersHorizontal, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ensurePushSubscription,
  getNotificationPermission,
  requestBrowserNotificationPermission,
} from "@/lib/browserNotifications";
import {
  isVoiceAgentAvailable,
  isVoiceAgentVisible,
  setVoiceAgentVisible,
} from "@/lib/agentVisibility";
import Loader from "@/components/Loader";
import Toast from "@/components/Toast";

function SettingSwitch({ label, description, checked, onChange, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-input px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-extrabold">{label}</p>
        <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-text-muted">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${checked ? "bg-(--pg-control-on) border-(--pg-control-on)" : "bg-toggle-track border-toggle-track"}`}
      >
        <span
          className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-all ${checked ? "left-[calc(100%-1.75rem)]" : "left-1"}`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [tariff, setTariff] = useState("8.00");
  const [voltage, setVoltage] = useState("230");
  const [currency, setCurrency] = useState("INR");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifyAlarm, setNotifyAlarm] = useState(true);
  const [notifySchedule, setNotifySchedule] = useState(true);
  const [scheduleLeadMinutes, setScheduleLeadMinutes] = useState("5");
  const [notifyEnergy, setNotifyEnergy] = useState(true);
  const [energyThreshold, setEnergyThreshold] = useState("3");
  const [notifyGhost, setNotifyGhost] = useState(true);
  const [ghostSummaryHour, setGhostSummaryHour] = useState("20");
  const [activeTab, setActiveTab] = useState("energy");
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [agentVisible, setAgentVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!currentUser) {
        window.location.href = "/login";
        return;
      }

      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      const detectedTimeZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

      setUser(currentUser);
      setTimezone(data?.timezone || detectedTimeZone);
      setNotificationPermission(getNotificationPermission());
      if (data) {
        setTariff(String(data.tariff_per_kwh));
        setVoltage(String(data.voltage));
        setCurrency(data.currency || "INR");
        setNotificationsEnabled(data.notifications_enabled !== false);
        setNotifyAlarm(data.notify_alarm !== false);
        setNotifySchedule(data.notify_schedule !== false);
        setScheduleLeadMinutes(String(data.schedule_lead_minutes ?? 5));
        setNotifyEnergy(data.notify_energy !== false);
        setEnergyThreshold(String(data.energy_device_kwh_threshold ?? 3));
        setNotifyGhost(data.notify_ghost !== false);
        setGhostSummaryHour(String(data.ghost_summary_hour ?? 20));
      }
       setAgentAvailable(isVoiceAgentAvailable());
       setAgentVisible(isVoiceAgentVisible());
      setLoading(false);
    };
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const saveEnergySettings = async (event) => {
    event.preventDefault();
    const parsedTariff = parseFloat(tariff);
    const parsedVoltage = parseInt(voltage, 10);
    if (!Number.isFinite(parsedTariff) || parsedTariff <= 0) {
      setToast("Please enter a valid tariff rate.");
      return;
    }
    if (
      !Number.isInteger(parsedVoltage) ||
      parsedVoltage < 100 ||
      parsedVoltage > 500
    ) {
      setToast("Voltage must be between 100 and 500V.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        tariff_per_kwh: parsedTariff,
        voltage: parsedVoltage,
        currency,
        timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    setToast(
      error
        ? `Failed to save settings: ${error.message}`
        : "Energy settings saved successfully!",
    );
  };

  const saveNotificationSettings = async (event) => {
    event.preventDefault();
    const lead = parseInt(scheduleLeadMinutes, 10);
    const threshold = parseFloat(energyThreshold);
    const ghostHour = parseInt(ghostSummaryHour, 10);

    if (!Number.isInteger(lead) || lead < 0 || lead > 60) {
      setToast("Schedule reminder must be between 0 and 60 minutes.");
      return;
    }
    if (!Number.isFinite(threshold) || threshold <= 0) {
      setToast("Energy threshold must be greater than zero.");
      return;
    }
    if (!Number.isInteger(ghostHour) || ghostHour < 0 || ghostHour > 23) {
      setToast("Choose a valid idle summary hour.");
      return;
    }

    setSavingNotifications(true);
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: user.id,
        tariff_per_kwh: parseFloat(tariff) || 8,
        voltage: parseInt(voltage, 10) || 230,
        currency,
        timezone,
        notifications_enabled: notificationsEnabled,
        notify_alarm: notifyAlarm,
        notify_schedule: notifySchedule,
        schedule_lead_minutes: lead,
        notify_energy: notifyEnergy,
        energy_device_kwh_threshold: threshold,
        notify_ghost: notifyGhost,
        ghost_summary_hour: ghostHour,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSavingNotifications(false);
    setToast(
      error
        ? `Failed to save notification settings: ${error.message}`
        : "Notification settings saved successfully!",
    );
  };

  const enableBrowserNotifications = async () => {
    const permission = await requestBrowserNotificationPermission();
    setNotificationPermission(permission);
    if (permission !== "granted") {
      setToast(
        permission === "denied"
          ? "Browser notifications are blocked. Allow them in your browser settings."
          : "Browser notifications were not enabled.",
      );
      return;
    }

    const result = await ensurePushSubscription();
    setToast(
      result.ok
        ? "Browser notifications and background push are enabled."
        : `Browser notifications enabled, but background push failed: ${result.reason}.`,
    );
  };

  const sendTestNotification = async () => {
    setTestingPush(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setToast("Please sign in again to send a test notification.");
        return;
      }
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        setToast(payload.error || "Could not send the test notification.");
        return;
      }
      if (payload.push?.sent > 0) {
        setToast(`Test notification sent to ${payload.push.sent} device(s).`);
      } else {
        setToast(
          "Test notification created. Enable browser notifications on this device to receive background alerts.",
        );
      }
    } catch {
      setToast("Could not reach the notification service.");
    } finally {
      setTestingPush(false);
    }
  };

  if (loading) return <Loader message="Loading settings..." />;

  return (
    <div className="w-full min-h-screen bg-background text-text pt-16 sm:pt-20 pb-12 px-3.5 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        <header className="flex items-center gap-3 bg-card/60 backdrop-blur-xl border border-border p-4 sm:p-5 rounded-2xl shadow-xl">
          <div className="w-10 h-10 rounded-xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shrink-0">
            <SlidersHorizontal size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-extrabold tracking-tight">
              Settings
            </h1>
            <p className="text-[11px] sm:text-xs text-text-muted mt-0.5">
              Configure energy tracking and assistant controls.
            </p>
          </div>
        </header>

        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm"
        >
          {[
            { id: "energy", label: "Energy", icon: Zap },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "voice", label: "Voice", icon: Mic },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`flex min-h-[42px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-[11px] font-extrabold transition-colors sm:text-xs ${
                activeTab === id
                  ? "bg-accent text-[var(--btn-text)] shadow-sm"
                  : "text-text-muted hover:bg-accent-bg hover:text-accent"
              }`}
            >
              <Icon size={15} strokeWidth={2.5} />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "energy" && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shrink-0">
              <Zap size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight">
                Energy &amp; Billing
              </h2>
              <p className="text-[11px] sm:text-xs font-semibold text-text-muted">
                Set the values used for cost tracking.
              </p>
            </div>
          </div>
          <form
            onSubmit={saveEnergySettings}
            className="flex flex-col gap-4 max-w-md"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-extrabold text-text-muted">
                Electricity Tariff
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={tariff}
                  onChange={(e) => setTariff(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-input text-text text-xs sm:text-sm outline-none focus:border-accent"
                  required
                />
                <span className="text-[10px] font-semibold">per kWh</span>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-extrabold text-text-muted">
                Household Voltage
                <input
                  type="number"
                  min="100"
                  max="500"
                  step="1"
                  value={voltage}
                  onChange={(e) => setVoltage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-input text-text text-xs sm:text-sm outline-none focus:border-accent"
                  required
                />
                <span className="text-[10px] font-semibold">Volts (V)</span>
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-extrabold text-text-muted">
              Currency Symbol
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-input text-text text-xs sm:text-sm outline-none focus:border-accent cursor-pointer"
              >
                <option value="INR">₹ INR — Indian Rupee</option>
                <option value="USD">$ USD — US Dollar</option>
                <option value="EUR">€ EUR — Euro</option>
                <option value="GBP">£ GBP — British Pound</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto min-h-[44px] rounded-xl bg-accent px-6 py-2.5 text-xs font-extrabold text-[var(--btn-text)] hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Energy Settings"}
            </button>
          </form>
        </section>
        )}

        {activeTab === "notifications" && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shrink-0">
              <Bell size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight">
                Notifications
              </h2>
              <p className="text-[11px] sm:text-xs font-semibold text-text-muted">
                Alerts for alarms, schedules, energy and idle devices.
              </p>
            </div>
          </div>

          <form
            onSubmit={saveNotificationSettings}
            className="flex flex-col gap-3.5 max-w-xl"
          >
            <SettingSwitch
              label="Enable notifications"
              description="Master switch for all in-app and background alerts."
              checked={notificationsEnabled}
              onChange={setNotificationsEnabled}
            />
            <SettingSwitch
              label="Alarm notifications"
              description="Notify when an alarm fires."
              checked={notifyAlarm}
              onChange={setNotifyAlarm}
              disabled={!notificationsEnabled}
            />
            <SettingSwitch
              label="Schedule reminders"
              description="Remind before a recurring schedule runs."
              checked={notifySchedule}
              onChange={setNotifySchedule}
              disabled={!notificationsEnabled}
            />
            <SettingSwitch
              label="High energy alerts"
              description="Alert once per device per day when its estimated usage crosses the limit."
              checked={notifyEnergy}
              onChange={setNotifyEnergy}
              disabled={!notificationsEnabled}
            />
            <SettingSwitch
              label="Idle device summary"
              description="Send one daily summary of devices that used no energy."
              checked={notifyGhost}
              onChange={setNotifyGhost}
              disabled={!notificationsEnabled}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-extrabold text-text-muted">
                Reminder lead
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  value={scheduleLeadMinutes}
                  onChange={(event) => setScheduleLeadMinutes(event.target.value)}
                  disabled={!notificationsEnabled || !notifySchedule}
                  className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-input text-text text-xs sm:text-sm outline-none focus:border-accent disabled:opacity-50"
                />
                <span className="text-[10px] font-semibold">minutes before</span>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-extrabold text-text-muted">
                Energy limit
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={energyThreshold}
                  onChange={(event) => setEnergyThreshold(event.target.value)}
                  disabled={!notificationsEnabled || !notifyEnergy}
                  className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-input text-text text-xs sm:text-sm outline-none focus:border-accent disabled:opacity-50"
                />
                <span className="text-[10px] font-semibold">kWh per device/day</span>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-extrabold text-text-muted">
                Idle summary time
                <select
                  value={ghostSummaryHour}
                  onChange={(event) => setGhostSummaryHour(event.target.value)}
                  disabled={!notificationsEnabled || !notifyGhost}
                  className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-input text-text text-xs sm:text-sm outline-none focus:border-accent disabled:opacity-50 cursor-pointer"
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {`${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-semibold">local time ({timezone})</span>
              </label>
            </div>

            <div className="rounded-xl border border-border bg-input p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-extrabold">
                    Browser &amp; background notifications
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-text-muted">
                    {notificationPermission === "granted"
                      ? "Enabled on this device."
                      : notificationPermission === "denied"
                        ? "Blocked. Allow notifications in your browser settings."
                        : notificationPermission === "unsupported"
                          ? "Not supported in this browser."
                          : "Enable to receive alerts when the app is closed."}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={enableBrowserNotifications}
                    disabled={notificationPermission === "granted"}
                    className="min-h-[38px] rounded-xl border border-accent/30 bg-accent-bg px-3.5 py-2 text-[11px] font-extrabold text-accent transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {notificationPermission === "granted" ? "Enabled" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={sendTestNotification}
                    disabled={testingPush}
                    className="min-h-[38px] rounded-xl border border-border bg-card px-3.5 py-2 text-[11px] font-extrabold text-text transition hover:bg-card-alt disabled:opacity-50"
                  >
                    {testingPush ? "Sending..." : "Send test"}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingNotifications}
              className="w-full sm:w-auto min-h-[44px] rounded-xl bg-accent px-6 py-2.5 text-xs font-extrabold text-[var(--btn-text)] hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {savingNotifications ? "Saving..." : "Save Notification Settings"}
            </button>
          </form>
        </section>
        )}

        {activeTab === "voice" && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shrink-0">
              <Mic size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight">
                Voice Agent
              </h2>
              <p className="text-[11px] sm:text-xs font-semibold text-text-muted">
                Show or hide voice controls across the app.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 max-w-md rounded-xl border border-border bg-input px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-extrabold">
                Voice assistant button
              </p>
              <p className="text-[11px] font-semibold text-text-muted mt-0.5 leading-relaxed">
                {!agentAvailable
                  ? "Disabled on the deployed site. An administrator must enable it for this deployment."
                  : agentVisible
                   ? "Visible — floating mic and schedule/alarm voice buttons are shown."
                   : "Hidden — all voice controls are removed from every page."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={agentAvailable && agentVisible}
              aria-label="Show voice agent"
              disabled={!agentAvailable}
              onClick={() => {
                const next = !agentVisible;
                setAgentVisible(next);
                setVoiceAgentVisible(next);
                setToast(next ? "Voice agent shown." : "Voice agent hidden.");
              }}
              className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors ${agentAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${agentVisible ? "bg-(--pg-control-on) border-(--pg-control-on)" : "bg-toggle-track border-toggle-track"}`}
            >
              <span
                className={`absolute top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white shadow transition-all ${agentVisible ? "left-[calc(100%-1.75rem)]" : "left-1"}`}
              />
            </button>
          </div>
        </section>
        )}
      </div>
      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
