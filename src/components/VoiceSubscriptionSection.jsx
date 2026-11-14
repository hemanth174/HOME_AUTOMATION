"use client";

import { useEffect, useState } from "react";
import { Check, Flame, Mic, Sparkles, Zap } from "lucide-react";
import { DEFAULT_VOICE_SUBSCRIPTION, getLocalVoiceSubscription } from "@/lib/voiceSubscription";

export default function VoiceSubscriptionSection() {
  const [settings, setSettings] = useState(DEFAULT_VOICE_SUBSCRIPTION);
  const [billing, setBilling] = useState("yearly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/voice-subscription");
        const data = await res.json();
        if (active && data.settings) {
          setSettings(data.settings);
        }
      } catch {
        if (active) setSettings(getLocalVoiceSubscription());
      } finally {
        if (active) setLoading(false);
      }
    };
    load();

    const handleUpdate = (e) => {
      if (e.detail) setSettings(e.detail);
    };
    window.addEventListener("vk:voice-subscription-change", handleUpdate);
    return () => {
      active = false;
      window.removeEventListener("vk:voice-subscription-change", handleUpdate);
    };
  }, []);

  // If disabled by administrator, do not render on website
  if (!settings.enabled) return null;

  return (
    <section
      id="voice-subscription"
      aria-label="Voice Agent Subscription Plans"
      className="relative overflow-hidden py-16 sm:py-24"
    >
      {/* Decorative ambient background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-10 -z-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-[100px]" />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-amber-500">
            <Mic size={14} className="text-amber-500" />
            <span>Voice Intelligence Plans</span>
          </div>

          <h2 className="mt-4 text-3xl font-black tracking-tight text-text sm:text-4xl lg:text-5xl">
            {settings.headline || "VikaTech Voice Intelligence"}
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-relaxed text-text-muted sm:text-base">
            {settings.subheadline ||
              "Command and automate your connected home with conversational precision. Choose the billing frequency that works for you."}
          </p>

          {/* Billing Frequency Segmented Control */}
          <div className="mt-8 inline-flex items-center rounded-2xl border border-border bg-card/80 p-1.5 shadow-sm backdrop-blur-md">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={`rounded-xl px-4 py-2 text-xs font-black transition-all sm:px-5 sm:py-2.5 ${
                billing === "monthly"
                  ? "bg-accent text-[var(--btn-text)] shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all sm:px-5 sm:py-2.5 ${
                billing === "yearly"
                  ? "bg-accent text-[var(--btn-text)] shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <span>Yearly Billing</span>
              {settings.discountBadge && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-500">
                  {settings.discountBadge}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid (Perfect layout for mobile & desktop) */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
          {/* Monthly Plan Card */}
          <div
            className={`flex flex-col justify-between rounded-3xl border bg-card p-6 shadow-sm transition-all sm:p-8 ${
              billing === "monthly"
                ? "border-amber-500/70 shadow-lg ring-1 ring-amber-500/20"
                : "border-border hover:border-border/90"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-text sm:text-xl">Voice Monthly</h3>
                  <p className="mt-0.5 text-xs font-medium text-text-muted">Pay-as-you-go flexibility</p>
                </div>
                <span className="rounded-full border border-border bg-background px-3 py-1 text-[10px] font-black uppercase text-text-muted">
                  Monthly
                </span>
              </div>

              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-mono text-4xl font-black text-text sm:text-5xl">
                  {settings.monthlyPrice}
                </span>
                <span className="text-xs font-bold text-text-muted">{settings.monthlyPeriod}</span>
              </div>

              <p className="mt-3 text-xs font-medium leading-relaxed text-text-muted">
                Full voice agent access across all installed ESP32 hardware and mobile interfaces. Cancel anytime.
              </p>

              {/* Feature Checklist */}
              <div className="mt-6 space-y-3 border-t border-border/60 pt-6">
                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">What's Included</p>
                {settings.monthlyFeatures.map((feat, index) => (
                  <div key={index} className="flex items-start gap-2.5 text-xs font-semibold text-text">
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-2">
              <a
                href="/login"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-border bg-background px-4 text-xs font-black text-text transition hover:border-accent hover:text-accent active:scale-[0.99]"
              >
                Get Started Monthly
              </a>
            </div>
          </div>

          {/* Yearly Plan Card (Highlighted / Most Popular) */}
          <div
            className={`relative flex flex-col justify-between rounded-3xl border bg-card p-6 shadow-xl transition-all sm:p-8 ${
              billing === "yearly"
                ? "border-amber-500 ring-2 ring-amber-500/40 shadow-amber-500/5"
                : "border-border"
            }`}
          >
            {/* Top Popular Ribbon */}
            <div className="absolute -top-3.5 right-6 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-black shadow-md">
              <Sparkles size={11} />
              <span>Recommended</span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-text sm:text-xl">Voice Annual Pro</h3>
                  <p className="mt-0.5 text-xs font-medium text-text-muted">Maximum savings for continuous home control</p>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-500">
                  Best Value
                </span>
              </div>

              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-mono text-4xl font-black text-text sm:text-5xl">
                  {settings.yearlyPrice}
                </span>
                <span className="text-xs font-bold text-text-muted">{settings.yearlyPeriod}</span>
              </div>

              <p className="mt-3 text-xs font-medium leading-relaxed text-text-muted">
                Includes two months free and high-priority neural processing pipeline for instant response times.
              </p>

              {/* Feature Checklist */}
              <div className="mt-6 space-y-3 border-t border-border/60 pt-6">
                <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Everything in Monthly, plus</p>
                {settings.yearlyFeatures.map((feat, index) => (
                  <div key={index} className="flex items-start gap-2.5 text-xs font-semibold text-text">
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-2">
              <a
                href="/login"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-4 text-xs font-black text-[var(--btn-text)] shadow-md transition hover:brightness-105 active:scale-[0.99]"
              >
                Subscribe Annually ({settings.discountBadge})
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
