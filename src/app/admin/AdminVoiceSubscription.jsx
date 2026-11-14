"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  HelpCircle,
  LoaderCircle,
  Mic,
  Save,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { DEFAULT_VOICE_SUBSCRIPTION, setLocalVoiceSubscription } from "@/lib/voiceSubscription";

export default function AdminVoiceSubscription({ accessToken, onNotice }) {
  const [settings, setSettings] = useState(DEFAULT_VOICE_SUBSCRIPTION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewBilling, setPreviewBilling] = useState("monthly");

  useEffect(() => {
    let active = true;
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/voice-subscription");
        const json = await res.json();
        if (active && json.settings) {
          setSettings(json.settings);
        }
      } catch {
        // Keep defaults
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchSettings();
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/voice-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save subscription settings");
      setSettings(json.settings);
      setLocalVoiceSubscription(json.settings);
      onNotice?.("Voice agent subscription settings saved and published.");
    } catch (err) {
      onNotice?.(err.message || "Could not save subscription settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center text-sm font-semibold text-text-muted">
        <LoaderCircle className="mb-3 animate-spin text-accent" size={28} />
        <p className="text-base font-black text-text">Loading Voice Subscription Configuration…</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Top Configuration Card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                  <Mic size={16} />
                </div>
                <h2 className="text-base font-black text-text sm:text-lg">Voice Agent Subscription Management</h2>
              </div>
              <p className="mt-1 text-xs font-medium text-text-muted">
                Control the visibility of the Voice Agent subscription section on the website and update pricing tiers.
              </p>
            </div>

            {/* Master Visibility Switch */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2 px-3">
              <span className="text-xs font-black text-text">
                {settings.enabled ? "Panel Active" : "Panel Disabled"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.enabled}
                onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.enabled ? "bg-emerald-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    settings.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Form */}
        <form onSubmit={handleSave} className="space-y-5 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Monthly Price Field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-text-muted">
                Monthly Plan Amount
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.monthlyPrice}
                  onChange={(e) => setSettings((prev) => ({ ...prev, monthlyPrice: e.target.value }))}
                  placeholder="e.g. ₹499"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 font-mono text-sm font-black text-text outline-none transition focus:border-accent"
                />
              </div>
              <p className="text-[10px] font-medium text-text-muted">Billed every month. Includes standard AI voice control.</p>
            </div>

            {/* Yearly Price Field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-text-muted">
                Yearly Plan Amount
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.yearlyPrice}
                  onChange={(e) => setSettings((prev) => ({ ...prev, yearlyPrice: e.target.value }))}
                  placeholder="e.g. ₹4,999"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 font-mono text-sm font-black text-text outline-none transition focus:border-accent"
                />
              </div>
              <p className="text-[10px] font-medium text-text-muted">Billed annually. Recommended for whole-home deployments.</p>
            </div>

            {/* Discount Badge Text */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-text-muted">
                Yearly Savings Badge Text
              </label>
              <input
                type="text"
                value={settings.discountBadge}
                onChange={(e) => setSettings((prev) => ({ ...prev, discountBadge: e.target.value }))}
                placeholder="e.g. Save 20% · 2 Months Free"
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 text-xs font-black text-text outline-none transition focus:border-accent"
              />
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between border-t border-border/70 pt-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
              {settings.enabled ? (
                <span className="flex items-center gap-1.5 text-emerald-500 font-bold">
                  <Check size={14} /> Visible on Website
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-zinc-500 font-bold">
                  <EyeOff size={14} /> Hidden from Website
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-xs font-black text-[var(--btn-text)] shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
              <span>{saving ? "Saving Changes…" : "Save & Publish"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Live Preview Panel */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500" />
            <h3 className="text-sm font-black text-text uppercase tracking-wider">Live Customer Preview</h3>
          </div>
          <span className="text-[11px] font-medium text-text-muted">
            {settings.enabled ? "Displayed on site" : "Currently hidden on site"}
          </span>
        </div>

        {/* Plan Cards Container */}
        <div className="rounded-2xl border border-border/80 bg-background/50 p-4 sm:p-6">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-500">
              <Sparkles size={12} />
              Voice Intelligence
            </span>
            <h4 className="mt-2 text-xl font-black text-text sm:text-2xl">{settings.headline}</h4>
            <p className="mx-auto mt-1 max-w-xl text-xs font-medium text-text-muted">
              {settings.subheadline}
            </p>

            {/* Monthly / Yearly Toggle in Preview */}
            <div className="mt-5 inline-flex items-center rounded-2xl border border-border bg-card p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setPreviewBilling("monthly")}
                className={`rounded-xl px-4 py-2 text-xs font-black transition-all ${
                  previewBilling === "monthly"
                    ? "bg-accent text-[var(--btn-text)] shadow-sm"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setPreviewBilling("yearly")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                  previewBilling === "yearly"
                    ? "bg-accent text-[var(--btn-text)] shadow-sm"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <span>Yearly Billing</span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black text-emerald-500">
                  {settings.discountBadge}
                </span>
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:max-w-4xl lg:mx-auto">
            {/* Monthly Plan Card */}
            <div
              className={`flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                previewBilling === "monthly"
                  ? "border-amber-500/80 bg-card shadow-lg ring-1 ring-amber-500/30"
                  : "border-border bg-card/60"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h5 className="text-base font-black text-text">Voice Monthly</h5>
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-black text-text-muted uppercase">
                    Flexible
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-mono text-3xl font-black text-text">{settings.monthlyPrice}</span>
                  <span className="text-xs font-bold text-text-muted">{settings.monthlyPeriod}</span>
                </div>
                <p className="mt-2 text-xs font-medium text-text-muted">
                  Billed monthly. Cancel anytime with zero lock-in or cancellation penalties.
                </p>

                <div className="mt-4 space-y-2.5 border-t border-border/70 pt-4 text-xs">
                  {settings.monthlyFeatures.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check size={14} className="shrink-0 text-emerald-500" />
                      <span className="font-semibold text-text">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-2">
                <button
                  type="button"
                  className="w-full rounded-xl border border-border bg-background py-3 text-xs font-black text-text hover:border-accent transition"
                >
                  Activate Monthly Voice
                </button>
              </div>
            </div>

            {/* Yearly Plan Card (Highlighted) */}
            <div
              className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                previewBilling === "yearly"
                  ? "border-amber-500 bg-card shadow-xl ring-2 ring-amber-500/50"
                  : "border-border bg-card/60"
              }`}
            >
              <div className="absolute -top-3 right-5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow-md">
                Most Popular
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h5 className="text-base font-black text-text">Voice Annual Pro</h5>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-500 uppercase">
                    Best Value
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-mono text-3xl font-black text-text">{settings.yearlyPrice}</span>
                  <span className="text-xs font-bold text-text-muted">{settings.yearlyPeriod}</span>
                </div>
                <p className="mt-2 text-xs font-medium text-text-muted">
                  Includes 2 free months and priority access to neural Sarvam AI processing models.
                </p>

                <div className="mt-4 space-y-2.5 border-t border-border/70 pt-4 text-xs">
                  {settings.yearlyFeatures.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check size={14} className="shrink-0 text-emerald-500" />
                      <span className="font-semibold text-text">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-2">
                <button
                  type="button"
                  className="w-full rounded-xl bg-accent py-3 text-xs font-black text-[var(--btn-text)] shadow-md transition hover:brightness-105"
                >
                  Activate Yearly Voice (Save 20%)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
