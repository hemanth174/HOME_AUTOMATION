"use client";

import { useEffect, useState } from "react";
import { getGreeting } from "./deviceKind";

export default function OverviewCards({
  userName,
  statusMessage,
  totalDevices,
  activeDevices,
  boardConnected,
  estimatedLoadWatts,
  estimatedEnergyTodayKwh,
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
    const timer = setInterval(updateTime, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section aria-label="Overview" className="mb-5 border-b border-(--pg-line) pb-5">
      <div className="flex min-w-0 flex-col gap-4 px-1 py-1 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 lg:max-w-[42%]">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-(--pg-ink) sm:text-2xl" title={`${greeting}, ${firstName}`}>
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-xs font-medium leading-relaxed text-(--pg-muted) sm:text-[13px]">
            {statusParts.map((part, index) => (
              <span
                key={`${part.text}-${index}`}
                className={part.tone === "accent"
                  ? "rounded-md bg-(--pg-brand-faint) px-1 font-extrabold text-(--pg-brand)"
                  : part.tone === "error"
                    ? "rounded-md bg-(--pg-error-faint) px-1 font-extrabold text-(--pg-error)"
                    : undefined}
              >
                {part.text}
              </span>
            ))}
          </p>
        </div>

        <div className="hidden min-w-0 flex-wrap items-center gap-x-4 gap-y-3 border-t border-(--pg-line) pt-3 sm:flex lg:flex-nowrap lg:border-t-0 lg:border-l lg:py-0 lg:pl-4 xl:gap-x-6 xl:pl-6">
          <div className="min-w-[90px]">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-(--pg-muted)">Set to on</p>
            <p className="mt-0.5 text-xl font-extrabold tabular-nums text-(--pg-ink)">{boardConnected ? activeDevices : "—"}<span className="mx-1 text-sm text-(--pg-muted)">/</span>{totalDevices}</p>
            {!boardConnected && <p className="text-[10px] font-semibold text-(--pg-muted)">No live board link</p>}
          </div>
          <div className="min-w-[115px]">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-(--pg-muted)">Estimated load</p>
            <p className="mt-0.5 text-xl font-extrabold tabular-nums text-(--pg-ink)">
              {estimatedLoadWatts === null ? "—" : estimatedLoadWatts}
              {estimatedLoadWatts !== null && <span className="ml-1 text-xs text-(--pg-muted)">W est.</span>}
            </p>
            <p className="text-[10px] font-semibold text-(--pg-muted)">
              {estimatedLoadWatts === null ? "Waiting for board" : "From relay settings · no meter"}
            </p>
          </div>
          <div className="min-w-[115px]">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-(--pg-muted)">Energy today</p>
            <p className="mt-0.5 text-xl font-extrabold tabular-nums text-(--pg-ink)">
              {estimatedEnergyTodayKwh === null ? "—" : estimatedEnergyTodayKwh.toFixed(4)}
              {estimatedEnergyTodayKwh !== null && <span className="ml-1 text-xs text-(--pg-muted)">kWh est.</span>}
            </p>
            <p className="text-[10px] font-semibold text-(--pg-muted)">From logged relay time</p>
          </div>
          <div className="min-w-[130px]">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-(--pg-muted)">Board link</p>
            <p className={`mt-1 flex items-center gap-1.5 text-sm font-extrabold ${systemOk ? "text-(--pg-success)" : "text-(--pg-error)"}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${systemOk ? "bg-(--pg-success)" : "bg-(--pg-error)"}`} aria-hidden="true" />
              {systemOk ? "Online" : "Offline"}
            </p>
            <p className="max-w-[170px] truncate text-[10px] font-semibold text-(--pg-muted)" title={systemMessage}>{systemMessage}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
