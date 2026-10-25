"use client";
import { RefreshCw } from "lucide-react";
import useLocalControl from "./useLocalControl";
import { ConnectionSection, DevicesSection } from "./LocalSections";
import LocalStyles from "./LocalStyles";

export default function LocalControlPage() {
  const manager = useLocalControl();
  const state = manager.checking
    ? "checking"
    : manager.connected
      ? "connected"
      : "unavailable";

  return (
    <main className="local-control-page min-h-screen bg-(--bg) font-sans text-(--text)">
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-[5.25rem] sm:px-6 sm:pt-[5.75rem] lg:px-8 lg:pb-10 lg:pt-[6rem] xl:px-10">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-(--text-muted)">
              VikaTech · Local network
            </p>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.045em] text-(--text) sm:text-4xl">
              Local Control
            </h1>
            <p className="mt-2 text-sm text-(--text-muted) sm:text-base">
              Direct ESP32 device control
            </p>
          </div>
          <button
            type="button"
            onClick={() => manager.loadDevices(true)}
            disabled={manager.checking}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-(--border) bg-(--bg-card) px-3 text-sm font-semibold text-(--text)"
          >
            <RefreshCw
              size={17}
              className={manager.checking ? "animate-spin" : ""}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </header>
        <ConnectionSection
          state={state}
          localUrl={manager.localUrl}
          unavailable={manager.unavailable}
          checking={manager.checking}
          connected={manager.connected}
          onRefresh={manager.loadDevices}
        />
        <DevicesSection manager={manager} />
      </div>
      <LocalStyles />
    </main>
  );
}
