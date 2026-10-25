import {
  LoaderCircle,
  Power,
  Radio,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

export function StatusBadge({ state, children }) {
  const tone =
    state === "connected"
      ? "border-(--on-border) bg-(--on-bg) text-(--text)"
      : "border-(--border) bg-(--bg-card-alt) text-(--text-muted)";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tone}`}
    >
      {children}
    </span>
  );
}

export function Guidance() {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-(--border) bg-(--bg-card-alt) p-3 sm:grid-cols-3 sm:gap-2 sm:p-4">
      {[
        [
          "1",
          "Join device Wi-Fi",
          "Connect to the HOME-AUTO-LEADER network.",
          Radio,
        ],
        [
          "2",
          "Return to VikaTech",
          "Keep your device connected to that network.",
          ShieldCheck,
        ],
        [
          "3",
          "Check connection",
          "Retry to load your local devices.",
          RefreshCw,
        ],
      ].map(([n, title, text, Icon]) => (
        <div key={n} className="flex min-w-0 items-start gap-3 rounded-xl p-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--bg-card) text-sm font-bold text-(--text)">
            {n}
          </span>
          <Icon size={22} className="mt-1 shrink-0 text-(--text)" />
          <span>
            <b className="block text-xs text-(--text)">{title}</b>
            <small className="mt-1 block text-xs leading-5 text-(--text-muted)">
              {text}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ConnectionSection({
  state,
  localUrl,
  unavailable,
  checking,
  connected,
  onRefresh,
}) {
  const surface =
    state === "connected"
      ? "border-(--on-border) bg-(--on-bg)"
      : "border-(--border) bg-(--bg-card)";

  return (
    <section className={`rounded-[24px] border p-4 shadow-sm sm:p-6 ${surface}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-(--bg-card-alt) text-(--text)">
          {state === "checking" ? (
            <LoaderCircle className="animate-spin" />
          ) : state === "connected" ? (
            <ShieldCheck />
          ) : (
            <WifiOff />
          )}
        </span>
        <div>
          <h2 className="text-lg font-extrabold sm:text-2xl">
            {state === "checking"
              ? "Checking ESP32 connection"
              : state === "connected"
                ? "ESP32 connection ready"
                : "ESP32 is unavailable"}
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-(--text-muted)">
            {state === "checking"
              ? "Searching for your local device network and available devices."
              : state === "connected"
                ? "Local control is ready."
                : "Connect to the HOME-AUTO-LEADER Wi-Fi network to control devices locally."}
          </p>
          {state === "connected" && localUrl && (
            <a
              href={localUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block break-all text-sm font-bold text-(--accent) underline underline-offset-4"
            >
              Open ESP32 at {localUrl}
            </a>
          )}
          <div className="mt-3">
            <StatusBadge state={state}>
              {state === "checking"
                ? "Checking"
                : state === "connected"
                  ? "Connected"
                  : "Not connected"}
            </StatusBadge>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRefresh(true)}
        disabled={checking}
        className="mt-5 flex min-h-12 items-center justify-center gap-2.5 rounded-2xl bg-(--accent) px-5 text-sm font-bold text-(--btn-text) disabled:opacity-60"
      >
        <RefreshCw size={17} className={checking ? "animate-spin" : ""} />
        {checking
          ? "Checking connection..."
          : connected
            ? "Refresh devices"
            : "Check connection"}
      </button>

      {unavailable && (
        <div className="mt-6 border-t border-(--border) pt-5">
          <h3 className="mb-4 text-sm font-extrabold text-(--text)">
            How to connect
          </h3>
          <Guidance />
        </div>
      )}
    </section>
  );
}

export function DevicesSection({ manager }) {
  const {
    devices,
    loading,
    error,
    checking,
    connected,
    busy,
    commandErrors,
    bulkBusy,
    bulkMessage,
    toggle,
    toggleAll,
    loadDevices,
  } = manager;

  return (
    <section className="mt-6 rounded-[24px] border border-(--border) bg-(--bg-card) p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-(--text) sm:text-2xl">
            Local devices
          </h2>
          <p className="mt-1 text-sm text-(--text-muted)">
            Devices available on your local ESP32 network
          </p>
        </div>
        <span className="rounded-full bg-(--bg-card-alt) px-3 py-1.5 text-xs font-bold text-(--text-muted)">
          {devices.length} {devices.length === 1 ? "device" : "devices"}
        </span>
      </div>

      {loading && (
        <div className="mt-6 flex min-h-40 items-center justify-center">
          <LoaderCircle className="animate-spin text-(--text-muted)" />
        </div>
      )}
      {!loading && !devices.length && error?.type === "devices" && (
        <EmptyState error onRetry={() => loadDevices(false)} />
      )}
      {!loading && !devices.length && !error && connected && <EmptyState />}

      {devices.length > 0 && (
        <div className="mt-5 rounded-2xl border border-(--border) bg-(--bg-card-alt) p-3">
          <div className="flex justify-between gap-2">
            <b className="text-sm">Control every connected device</b>
            <div className="flex gap-2">
              <button
                onClick={() => toggleAll("on")}
                disabled={!connected || bulkBusy}
                className="rounded-xl bg-(--accent) px-4 py-2 text-xs font-extrabold text-(--btn-text)"
              >
                All ON
              </button>
              <button
                onClick={() => toggleAll("off")}
                disabled={!connected || bulkBusy}
                className="rounded-xl border border-(--border) px-4 py-2 text-xs font-extrabold text-(--text)"
              >
                All OFF
              </button>
            </div>
          </div>
          {bulkMessage && (
            <p className="mt-3 text-xs font-semibold">{bulkMessage}</p>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            busy={busy}
            error={commandErrors}
            connected={connected}
            onToggle={toggle}
          />
        ))}
      </div>
    </section>
  );
}

function EmptyState({ error, onRetry }) {
  return (
    <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-(--border) px-5 py-8 text-center">
      <WifiOff size={30} className="text-(--text-muted)" />
      <h3 className="mt-4 text-base font-extrabold text-(--text)">
        {error
          ? "Your device list couldn't be loaded"
          : "Your local device list will appear here"}
      </h3>
      <p className="mt-2 max-w-lg text-sm leading-6 text-(--text-muted)">
        {error
          ? "The ESP32 responded, but VikaTech could not retrieve its device list."
          : "Once connected, available devices will appear here so you can control them directly from VikaTech."}
      </p>
      {error && (
        <button
          onClick={onRetry}
          className="mt-5 rounded-xl border border-(--border) px-5 py-2 text-sm font-bold text-(--text)"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function DeviceCard({ device, busy, error, connected, onToggle }) {
  const key = `${device.node_id || "local"}-${device.relay_index}`;
  const on = Boolean(device.is_on);

  return (
    <article
      className={`rounded-2xl border p-4 ${
        on
          ? "border-(--on-border) bg-(--on-bg)"
          : "border-(--border) bg-(--bg-card)"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-(--bg-card-alt) text-(--text)">
            <Power size={19} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase text-(--text-muted)">
              {device.roomName || device.node_id || "ESP32"}
            </p>
            <p className="text-sm font-extrabold text-(--text)">
              {device.name}
            </p>
            <p className="mt-1 text-xs text-(--text-muted)">
              Relay {Number(device.relay_index) + 1}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-(--bg-card-alt) px-2.5 py-1 text-[10px] font-extrabold uppercase text-(--text)">
          {on ? "On" : "Off"}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-(--border) pt-4">
        <span className="text-xs font-semibold text-(--text-muted)">
          {busy[key] ? "Syncing..." : on ? "Tap to turn off" : "Tap to turn on"}
        </span>
        <button
          role="switch"
          aria-checked={on}
          onClick={() => onToggle(device)}
          disabled={busy[key] || !connected}
          className={`relative h-7 w-[52px] rounded-full ${
            on ? "bg-(--toggle-on)" : "bg-(--toggle-track)"
          }`}
        >
          <span
            className={`absolute top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-(--bg-card) shadow ${
              on ? "left-[calc(100%-26px)]" : "left-[3px]"
            }`}
          />
        </button>
      </div>

      {!busy[key] && error[key] && (
        <p className="mt-3 text-xs font-semibold text-(--text)">
          {error[key]}
        </p>
      )}
    </article>
  );
}
