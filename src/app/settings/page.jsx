"use client";

import { useEffect, useState } from "react";
import { Mic, SlidersHorizontal, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  isVoiceAgentAvailable,
  isVoiceAgentVisible,
  setVoiceAgentVisible,
} from "@/lib/agentVisibility";
import Loader from "@/components/Loader";
import Toast from "@/components/Toast";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [tariff, setTariff] = useState("8.00");
  const [voltage, setVoltage] = useState("230");
  const [currency, setCurrency] = useState("INR");
  const [agentVisible, setAgentVisible] = useState(true);
  const [agentAvailable, setAgentAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
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
        .select("tariff_per_kwh, voltage, currency")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      setUser(currentUser);
      if (data) {
        setTariff(String(data.tariff_per_kwh));
        setVoltage(String(data.voltage));
        setCurrency(data.currency || "INR");
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
      </div>
      <Toast message={toast} onClose={() => setToast("")} />
    </div>
  );
}
