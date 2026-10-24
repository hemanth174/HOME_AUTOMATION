"use client";


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
  const isRelayOn = device.is_on;
  const isLightOn = isRelayOn;

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
          {!boardOnline && (
            <span className="text-[9px] font-extrabold uppercase tracking-wide text-(--pg-muted) bg-black/[0.04] border border-(--pg-line) px-1.5 py-0.5 rounded-md">
              Offline
            </span>
          )}
          {!hasFeedback && (
            <span
              className="text-[9px] font-extrabold uppercase tracking-wide text-(--pg-muted) bg-black/[0.04] border border-(--pg-line) px-1.5 py-0.5 rounded-md"
              title="This controller has not reported its GPIO switch-input state yet."
            >
              Input N/A
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
          {hasFeedback
            ? `Relay ${isRelayOn ? "ON" : "OFF"} · Switch input ${device.feedback_on ? "ON" : "OFF"}`
            : isRelayOn
              ? "Relay ON · switch input unavailable"
              : "Relay OFF · switch input unavailable"}
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
              ? 'bg-(--pg-control-on) border-(--pg-control-on) hover:bg-(--pg-control-on-hover)'
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
