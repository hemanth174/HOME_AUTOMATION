"use client";

import { Cpu, Zap, Activity, HeartPulse } from "lucide-react";
import { useEffect, useState } from "react";
import { getGreeting } from "./deviceKind";

/**
 * Personalized greeting + four summary cards. Every value comes from live
 * state or the established log-based estimate — energy shows an explicit
 * unavailable state when there is nothing to estimate from.
 */
export default function OverviewCards({
  userName,
  statusMessage,
  totalDevices,
  activeDevices,
  energyKwhToday,
  energyAvailable,
  liveWatts,
  systemOk,
  systemMessage,
}) {
  const [currentTime, setCurrentTime] = useState(null);
  const firstName = String(userName || "there").split(" ")[0];
  const greeting = currentTime ? getGreeting(currentTime) : "Hello";
  const statusParts = Array.isArray(statusMessage)
    ? statusMessage
    : [{ text: statusMessage }];

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime();
    const timer = setInterval(updateTime, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const cards = [
    {
      label: "Total Devices",
      value: String(totalDevices),
      sub: "Across all rooms",
      Icon: Cpu,
      accent: false,
    },
    {
      label: "Active Devices",
      value: String(activeDevices),
      sub: activeDevices === 1 ? "Device is on" : "Devices are on",
      Icon: Zap,
      accent: activeDevices > 0,
    },
    {
      label: "Energy Usage",
      value: energyAvailable
        ? `${energyKwhToday.toFixed(2)} kWh`
        : "Unavailable",
      sub: energyAvailable
        ? `Today (est.) · ${liveWatts} W live`
        : "No meter or usage data yet",
      Icon: Activity,
      accent: false,
    },
    {
      label: "System Status",
      value: systemOk ? "Normal" : "Attention",
      sub: systemMessage,
      Icon: HeartPulse,
      ok: systemOk,
    },
  ];

  return (
    <section aria-label="Overview" className="mb-7">
      <h1
        className="text-xl sm:text-2xl font-extrabold tracking-tight text-text truncate pl-2"
        title={`${greeting}, ${firstName}`}
      >
        {greeting}, {firstName}
      </h1>
      <p className="text-[13px] font-medium text-text-muted mt-1 mb-4 pl-2">
        {statusParts.map((part, index) => (
          <span
            key={`${part.text}-${index}`}
            className={
              part.tone === "accent"
                ? "rounded-md bg-(--pg-brand-faint) px-1 font-extrabold text-(--pg-brand)"
                : part.tone === "error"
                  ? "rounded-md bg-(--pg-error-faint) px-1 font-extrabold text-(--pg-error)"
                  : undefined
            }
          >
            {part.text}
          </span>
        ))}
      </p>
      <div className="hidden sm:grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        {cards.map(({ label, value, sub, Icon, accent, ok }) => (
          <div
            key={label}
            className={`rounded-2xl border bg-(--pg-card) p-4 transition-colors min-w-0 ${
              label === "System Status" && ok === false
                ? "border-(--pg-error-line)"
                : "border-(--pg-line)"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="ov-label text-[11px] font-extrabold uppercase tracking-[0.08em]">
                {label}
              </span>
              <span
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  accent
                    ? "bg-(--pg-brand) text-(--pg-onbrand)"
                    : label === "System Status" && ok === false
                      ? "bg-(--pg-error-faint) text-(--pg-error)"
                      : "bg-(--pg-faint) text-(--pg-brand)"
                }`}
              >
                <Icon size={15} strokeWidth={2.5} aria-hidden="true" />
              </span>
            </div>
            <p
              className={`text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight mt-2 ${
                label === "System Status"
                  ? ok === false
                    ? "text-(--pg-error)"
                    : "text-(--pg-success)"
                  : "text-(--pg-ink)"
              }`}
            >
              {value}
            </p>
            <p
              className="ov-sub text-[11px] font-semibold mt-1 truncate"
              title={sub}
            >
              {sub}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
