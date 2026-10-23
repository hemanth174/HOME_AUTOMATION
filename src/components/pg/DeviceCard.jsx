"use client";

import { AlertTriangle, User } from "lucide-react";
import { getDeviceKind } from "./deviceKind";
export default function DeviceCard({
  device,
  roomName,
  boardOnline,
  pending,
  onToggle,
  carousel = false,
}) {
  const kind = getDeviceKind(device.name);
  const { Icon } = kind;
  const hasFeedback =
    device.feedback_on !== null && device.feedback_on !== undefined;
  const isLightOn = hasFeedback ? device.feedback_on : device.is_on;
  const isRelayOn = device.is_on;
  const isBurntBulb = hasFeedback && isRelayOn && !device.feedback_on;
  const isManualOverride = hasFeedback && !isRelayOn && device.feedback_on;

  return (
    <article
      className={`relative flex min-h-[104px] min-w-0 flex-col justify-between gap-1.5 rounded-2xl border bg-(--pg-card) p-3.5 transition-all duration-200 ${carousel ? "w-[320px] shrink-0 snap-start snap-always" : "w-full"} max-sm:w-full max-sm:basis-full max-sm:shrink-0 max-sm:snap-start max-sm:snap-always max-sm:min-h-[132px] ${
        isLightOn ? 'border-(--pg-brand-line)' : 'border-(--pg-line)'
      } ${pending ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${kind.tile}`}>
          <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className="flex flex-col items-end gap-1 shrink-0">
          {isBurntBulb && (
            <span
              className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide text-(--pg-error) bg-(--pg-error-faint) border border-(--pg-error-line) px-1.5 py-0.5 rounded-md"
              title="Relay is ON but no AC current detected — bulb may be fused or the breaker tripped."
            >
              <AlertTriangle size={10} />
              Error
            </span>
          )}
          {isManualOverride && (
            <span
              className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide text-(--pg-brand) bg-(--pg-brand-faint) border border-(--pg-brand-soft) px-1.5 py-0.5 rounded-md"
              title="Relay is OFF but AC current detected — the physical wall switch is ON."
            >
              <User size={10} />
              Manual
            </span>
          )}
          {!boardOnline && (
            <span className="text-[9px] font-extrabold uppercase tracking-wide text-(--pg-muted) bg-black/[0.04] border border-(--pg-line) px-1.5 py-0.5 rounded-md">
              Offline
            </span>
          )}
        </span>
      </div>

      <div className="min-w-0">
        <h3
          className="truncate text-sm font-bold text-(--pg-ink)"
          title={device.name}
        >
          {device.name}
        </h3>
        <p className="truncate text-[11px] font-semibold text-(--pg-muted) mt-0.5">
          {roomName} · {kind.label}
        </p>
        <p
          className={`text-[11px] font-extrabold uppercase tracking-[0.06em] mt-1 ${
            isLightOn ? "text-(--pg-success)" : "text-(--pg-muted)"
          }`}
          aria-live="polite"
        >
          {isManualOverride ? "Manual ON" : isLightOn ? "ON" : "OFF"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 mt-0.5">
        <button
          role="switch"
          aria-checked={isRelayOn}
          aria-label={`Turn ${device.name} ${isRelayOn ? 'off' : 'on'}`}
          disabled={!!pending}
          title={pending ? 'Syncing…' : isRelayOn ? 'Turn off' : 'Turn on'}
          onClick={onToggle}
          className={`relative h-7 w-[52px] shrink-0 rounded-full border transition-colors duration-200 cursor-pointer disabled:cursor-wait ${
            isRelayOn
              ? 'bg-(--pg-brand) border-(--pg-brand)'
              : 'bg-(--pg-track) border-(--pg-track) hover:bg-(--pg-track-hover)'
          }`}
        >
          <span
            className={`absolute top-1/2 -translate-y-1/2 h-[22px] w-[22px] rounded-full bg-white shadow transition-all duration-200 ${
              isRelayOn ? 'left-[calc(100%-26px)]' : 'left-[3px]'
            }`}
          />
        </button>
        <span className="text-[11px] font-semibold text-(--pg-muted)">
          {pending ? 'Syncing…' : isRelayOn ? 'Tap to turn off' : 'Tap to turn on'}
        </span>
      </div>
    </article>
  );
}
