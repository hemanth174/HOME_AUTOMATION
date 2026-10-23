"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cpu,
  LoaderCircle,
  Moon,
  Sun,
  Power,
  Radio,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import {
  discoverLocalNode,
  fetchLocalDevices,
  setLocalDeviceState,
  triggerLocalAll,
} from "@/lib/localApi";
import useLocalConnection, {
  setLocalProbingEnabled,
} from "@/hooks/useLocalConnection";

const LOCAL_DEVICES_CACHE = "home_auto_cached_local_devices";
const CLOUD_DEVICES_CACHE = "home_auto_cached_devices";
const CLOUD_BOARDS_CACHE = "home_auto_cached_boards";
const LOCAL_DEVICE_REFRESH_INTERVAL = 15000;

function StatusBadge({ children, state }) {
  const styles = {
    checking: "bg-[#F0EEE9] text-[#858780]",
    connected: "bg-white/75 text-[#39845A]",
    unavailable: "bg-white/75 text-[#D94B4B]",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${styles[state]}`}
    >
      {children}
    </span>
  );
}

function ConnectionGuidance() {
  const steps = [
    {
      number: "1",
      title: "Join device Wi-Fi",
      description: "Connect to the HOME-AUTO-LEADER network.",
      icon: Radio,
    },
    {
      number: "2",
      title: "Return to VikaTech",
      description: "Keep your device connected to that network.",
      icon: ShieldCheck,
    },
    {
      number: "3",
      title: "Check connection",
      description: "Retry to load your local devices.",
      icon: RefreshCw,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#F3DCD4] bg-white/45 p-3 sm:grid-cols-3 sm:gap-2 sm:p-4">
      {steps.map(({ number, title, description, icon: Icon }, index) => (
        <div
          key={number}
          className="relative flex min-w-0 items-start gap-3 rounded-xl p-2 sm:p-1.5"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F0E1D4] text-sm font-bold text-[#8D4C20]">
            {number}
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#F3DCD4] bg-white text-[#26382C]">
            <Icon size={17} aria-hidden="true" suppressHydrationWarning />
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="block text-xs font-bold text-[#26382C]">
              {title}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#69736D]">
              {description}
            </span>
          </span>
          {index < steps.length - 1 && (
            <span
              className="absolute -right-2 top-4 hidden text-[#C28A62] sm:block"
              aria-hidden="true"
            >
              ›
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function HardwareIllustration() {
  return (
    <div
      className="relative flex min-h-[150px] items-center justify-center overflow-hidden sm:min-h-[170px]"
      aria-hidden="true"
    >
      <div className="absolute h-36 w-36 rounded-full bg-[#F3D9CA]/55 sm:h-44 sm:w-44" />
      <div className="absolute h-28 w-28 rounded-full border border-dashed border-[#C98C66]/50 sm:h-36 sm:w-36" />
      <div className="absolute left-[15%] top-[18%] flex h-12 w-12 items-center justify-center rounded-full bg-[#D94B4B] text-white shadow-md sm:left-[10%] sm:h-14 sm:w-14">
        <Radio size={25} suppressHydrationWarning />
      </div>
      <div className="relative flex h-24 w-36 items-center justify-center rounded-2xl border border-white/80 bg-gradient-to-br from-[#F8F8F5] to-[#D8DAD4] shadow-[0_18px_30px_rgba(87,70,53,0.18)] sm:h-28 sm:w-44">
        <div className="absolute inset-x-3 top-3 h-1 rounded-full bg-white/90" />
        <Cpu
          size={46}
          strokeWidth={1.5}
          className="text-[#26382C] sm:h-14 sm:w-14"
          suppressHydrationWarning
        />
        <span className="absolute bottom-3 left-4 h-2 w-2 rounded-full bg-[#39845A]" />
        <span className="absolute bottom-3 left-8 h-2 w-2 rounded-full bg-[#A86F3D]" />
        <span className="absolute bottom-3 right-4 h-2 w-2 rounded-full bg-[#858780]" />
      </div>
    </div>
  );
}

export default function LocalControlPage() {
  const { isLocalConnected, localUrl, checkConnection, isProbing } =
    useLocalConnection();
  const [pageTheme, setPageTheme] = useState("dark");
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [localPageConnected, setLocalPageConnected] = useState(false);
  const [busy, setBusy] = useState({});
  const [commandErrors, setCommandErrors] = useState({});
  const [bulkBusy, setBulkBusy] = useState(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const loadInFlight = useRef(false);
  const hasDeviceSnapshot = useRef(false);


  // Read and follow VikaTech's shared theme (html[data-theme]) so this
  // page stays synchronized with the global Navbar ThemeToggle.
  useEffect(() => {
    const syncTheme = () => {
      const current = document.documentElement.getAttribute("data-theme");
      setPageTheme(current === "light" ? "light" : "dark");
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const togglePageTheme = () => {
    const next = pageTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setPageTheme(next);
  };

  // The ESP32 reports relay indexes and mesh node IDs. Reuse metadata cached
  // during the last online dashboard visit to show familiar room/device names
  // even when Supabase itself cannot be reached.
  const enrichLocalDevices = useCallback((localDevices) => {
    let cachedBoards = [];
    let cachedDevices = [];
    try {
      cachedBoards = JSON.parse(localStorage.getItem(CLOUD_BOARDS_CACHE) || "[]");
      cachedDevices = JSON.parse(localStorage.getItem(CLOUD_DEVICES_CACHE) || "[]");
    } catch {
      cachedBoards = [];
      cachedDevices = [];
    }

    return localDevices.map((device) => {
      const board = cachedBoards.find((item) =>
        item.board_identifier === device.node_id ||
        (!device.node_id && cachedBoards.length === 1)
      );
      const cloudDevice = cachedDevices.find((item) =>
        Number(item.relay_index) === Number(device.relay_index) &&
        (board ? item.board_id === board.id : false)
      );
      return {
        ...device,
        name: cloudDevice?.name || device.name || `Device ${Number(device.relay_index) + 1}`,
        roomName: board?.name || device.node_id || "Local controller",
      };
    });
  }, []);

  const saveDeviceSnapshot = useCallback((localDevices) => {
    const enriched = enrichLocalDevices(localDevices);
    setDevices(enriched);
    hasDeviceSnapshot.current = true;
    try {
      localStorage.setItem(LOCAL_DEVICES_CACHE, JSON.stringify(enriched));
    } catch {
      // Browser storage may be full or disabled; live controls still work.
    }
    return enriched;
  }, [enrichLocalDevices]);

  const loadDevices = useCallback(async (rediscover = false) => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    if (!hasDeviceSnapshot.current) setLoading(true);
    setError(null);
    let failureType = "connection";

    try {
      if (rediscover) await discoverLocalNode(2500);
      setLocalPageConnected(true);

      let nextDevices;
      try {
        nextDevices = await fetchLocalDevices(2500);
      } catch {
        failureType = "devices";
        throw new Error("device-list");
      }
      saveDeviceSnapshot(nextDevices);
    } catch {
      if (!rediscover) {
        try {
          await discoverLocalNode(2500);
          setLocalPageConnected(true);
          let nextDevices;
          try {
            nextDevices = await fetchLocalDevices(2500);
          } catch {
            failureType = "devices";
            throw new Error("device-list");
          }
          saveDeviceSnapshot(nextDevices);
        } catch (retryError) {
          failureType =
            retryError.message === "device-list" ? "devices" : "connection";
        }
      }

      if (failureType === "devices") {
        if (!hasDeviceSnapshot.current) {
          setError({
            type: "devices",
            message:
              "The ESP32 responded, but the device list could not be retrieved.",
          });
        }
      } else {
        setLocalPageConnected(false);
        if (!hasDeviceSnapshot.current) {
          setError({
            type: "connection",
            message:
              "Connect to HOME-AUTO-LEADER and allow local network access.",
          });
        }
      }
    } finally {
      loadInFlight.current = false;
      setLoading(false);
    }
  }, [saveDeviceSnapshot]);

  useEffect(() => {
    setLocalProbingEnabled(true);
    try {
      const cached = JSON.parse(
        localStorage.getItem(LOCAL_DEVICES_CACHE) || "[]",
      );
      if (Array.isArray(cached) && cached.length) {
        setDevices(enrichLocalDevices(cached));
        hasDeviceSnapshot.current = true;
        setLoading(false);
      }
    } catch {
      // Invalid cache is ignored; the live request remains authoritative.
    }

    loadDevices(true);

    // Poll the ESP32 only while this page is visible. Use a relaxed interval
    // instead of a one-second loop, and refresh immediately when the user
    // returns to the tab. This traffic stays on the local network.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadDevices(false);
    }, LOCAL_DEVICE_REFRESH_INTERVAL);

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadDevices(false);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      setLocalProbingEnabled(false);
    };
  }, [loadDevices, enrichLocalDevices]);

  const toggle = async (device) => {
    const key = `${device.node_id || "local"}-${device.relay_index}`;
    const nextState = !device.is_on;
    setBusy((current) => ({ ...current, [key]: true }));
    setCommandErrors((current) => ({ ...current, [key]: "" }));
    setDevices((current) =>
      current.map((item) =>
        item.id === device.id ? { ...item, is_on: nextState } : item,
      ),
    );

    try {
      await setLocalDeviceState(device.relay_index, nextState, device.node_id);
    } catch {
      let actualDevice = null;
      try {
        const latestDevices = await fetchLocalDevices(2000);
        actualDevice = latestDevices.find(
          (item) =>
            item.relay_index === device.relay_index &&
            item.node_id === device.node_id,
        );
        if (actualDevice) {
          setDevices(latestDevices);
          hasDeviceSnapshot.current = true;
          localStorage.setItem(LOCAL_DEVICES_CACHE, JSON.stringify(latestDevices));
          if (actualDevice.is_on === nextState) return;
        }
      } catch {
        // The response may have been lost after the relay changed. Keep the
        // optimistic value only until a later successful device refresh.
      }

      setDevices((current) =>
        current.map((item) =>
          item.id === device.id
            ? { ...item, is_on: actualDevice ? actualDevice.is_on : !nextState }
            : item,
        ),
      );
      setCommandErrors((current) => ({
        ...current,
        [key]:
          "Could not update this device. Check the local connection and try again.",
      }));
      await checkConnection();
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  };

  const toggleAllDevices = async (action) => {
    if (!connected || !devices.length || bulkBusy) return;
    setBulkBusy(action);
    setBulkMessage("");
    try {
      const result = await triggerLocalAll(action);
      // Re-read actual relay states instead of treating HTTP submission as
      // proof every board acted on the command.
      const refreshed = await fetchLocalDevices(5000);
      const enriched = saveDeviceSnapshot(refreshed);
      const targetState = action === "on";
      const failed = enriched.filter((device) => Boolean(device.is_on) !== targetState);
      if (failed.length) {
        setBulkMessage(`Partial result: ${failed.length} of ${enriched.length} devices have not confirmed ${targetState ? "ON" : "OFF"}.`);
      } else if (result?.success === false) {
        setBulkMessage("The controller reported that the command did not complete.");
      } else {
        setBulkMessage(`Confirmed: all ${enriched.length} devices are ${targetState ? "ON" : "OFF"}.`);
      }
    } catch {
      setBulkMessage("Could not confirm the bulk command. Check the local network and refresh device states.");
      try {
        saveDeviceSnapshot(await fetchLocalDevices(2500));
      } catch {
        // Keep the latest visible snapshot and its explicit error.
      }
    } finally {
      setBulkBusy(null);
    }
  };

  const checking = loading || (isProbing && !isLocalConnected);
  const hasDeviceError = error?.type === "devices";
  const unavailable =
    error?.type === "connection" ||
    (!checking && !localPageConnected && !isLocalConnected);
  const connected = !unavailable && (localPageConnected || isLocalConnected);
  const statusState = checking
    ? "checking"
    : connected
      ? "connected"
      : "unavailable";

  return (
    <main className={`local-control-page min-h-screen bg-[#F5F3EF] font-sans text-[#26382C] ${pageTheme === "dark" ? "page-theme-dark" : "page-theme-light"}`}>
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-[5.25rem] sm:px-6 sm:pt-[5.75rem] lg:px-8 lg:pb-10 lg:pt-[6rem] xl:px-10">
        <header className="mb-6 flex items-start justify-between gap-4 sm:mb-7">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#A86F3D]">
              VikaTech · Local network
            </p>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.045em] text-[#173D2D] sm:text-4xl">
              Local Control
            </h1>
            <p className="mt-2 text-sm text-[#69736D] sm:text-base">
              Direct ESP32 device control
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={togglePageTheme}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#E8E5DF] bg-white px-3 text-sm font-semibold text-[#26382C] shadow-sm transition hover:border-[#C98C66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A86F3D] sm:px-4"
              aria-label={pageTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={pageTheme === "dark"}
              title={pageTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {pageTheme === "dark" ? (
                <Sun size={17} suppressHydrationWarning />
              ) : (
                <Moon size={17} suppressHydrationWarning />
              )}
              <span className="hidden sm:inline">{pageTheme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
            <button
              type="button"
              onClick={() => loadDevices(true)}
              disabled={checking}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#E8E5DF] bg-white px-3 text-sm font-semibold text-[#26382C] shadow-sm transition hover:border-[#C98C66] hover:bg-[#FFFCF8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A86F3D] disabled:cursor-wait disabled:opacity-50 sm:px-4"
              aria-label="Refresh local connection and devices"
            >
              <RefreshCw
                size={17}
                className={checking ? "animate-spin" : ""}
                suppressHydrationWarning
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </header>

        <section
          aria-labelledby="connection-title"
          className={`overflow-hidden rounded-[24px] border p-4 shadow-[0_8px_28px_rgba(38,56,44,0.045)] sm:p-6 lg:p-7 ${
            statusState === "checking"
              ? "border-[#E8E5DF] bg-white"
              : statusState === "connected"
                ? "border-[#C9DDCC] bg-[#F0F6EF]"
                : "border-[#F7D0CB] bg-[#FFF5F3]"
          }`}
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center lg:gap-8">
            <div className="min-w-0">
              <div className="flex items-start gap-3 sm:gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:h-16 sm:w-16 ${
                    statusState === "connected"
                      ? "bg-[#DDEEE0] text-[#39845A]"
                      : statusState === "checking"
                        ? "bg-[#F0E1D4] text-[#A86F3D]"
                        : "bg-[#FCE4E2] text-[#D62828]"
                  }`}
                >
                  {statusState === "checking" ? (
                    <LoaderCircle className="animate-spin" size={25} suppressHydrationWarning />
                  ) : statusState === "connected" ? (
                    <ShieldCheck size={27} suppressHydrationWarning />
                  ) : (
                    <WifiOff size={27} suppressHydrationWarning />
                  )}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2
                    id="connection-title"
                    className={`text-lg font-extrabold tracking-[-0.025em] sm:text-2xl ${
                      statusState === "connected"
                        ? "text-[#287247]"
                        : statusState === "checking"
                          ? "text-[#8D5B30]"
                          : "text-[#8E211D]"
                    }`}
                  >
                    {statusState === "checking"
                      ? "Checking ESP32 connection"
                      : statusState === "connected"
                        ? "ESP32 connection ready"
                        : "ESP32 is unavailable"}
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-[#69736D] sm:text-base">
                    {statusState === "checking"
                      ? "Searching for your local device network and available devices."
                      : statusState === "connected"
                        ? `Local control is ready${localUrl ? ` at ${localUrl}` : ""}.`
                        : "Connect to the HOME-AUTO-LEADER Wi-Fi network to control devices locally."}
                  </p>
                  <div className="mt-3">
                    <StatusBadge state={statusState}>
                      {statusState === "checking"
                        ? "Checking"
                        : statusState === "connected"
                          ? "Connected"
                          : "Not connected"}
                    </StatusBadge>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => loadDevices(true)}
                disabled={checking}
                className={`mt-5 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A86F3D] disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-[240px] ${
                  statusState === "connected"
                    ? "border border-[#B9D8C1] bg-white text-[#287247] hover:bg-[#F8FCF8]"
                    : "bg-[#A86F3D] text-white shadow-sm hover:bg-[#8D5B30]"
                }`}
              >
                <RefreshCw
                  size={17}
                  className={checking ? "animate-spin" : ""}
                  suppressHydrationWarning
                />
                {checking
                  ? "Checking connection..."
                  : statusState === "connected"
                    ? "Refresh devices"
                    : "Check connection"}
              </button>
            </div>

            <div className="hidden lg:block">
              <HardwareIllustration />
              <p className="text-center text-xs font-semibold text-[#69736D]">
                Private local control
              </p>
              <p className="mt-1 text-center text-xs leading-5 text-[#858780]">
                Commands stay on your local network.
              </p>
            </div>
          </div>

          {unavailable && (
            <div className="mt-6 border-t border-[#F1D8D1] pt-5 sm:mt-7 sm:pt-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-[#6F2822] sm:text-base">
                  How to connect
                </h3>
                <Radio
                  size={17}
                  className="shrink-0 text-[#A86F3D]"
                  aria-hidden="true"
                  suppressHydrationWarning
                />
              </div>
              <ConnectionGuidance />
            </div>
          )}
        </section>

        <section
          aria-labelledby="local-devices-title"
          className="mt-6 rounded-[24px] border border-[#E8E5DF] bg-white p-4 shadow-[0_8px_28px_rgba(38,56,44,0.04)] sm:mt-7 sm:p-6 lg:p-7"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="local-devices-title"
                className="text-xl font-extrabold tracking-[-0.035em] text-[#173D2D] sm:text-2xl"
              >
                Local devices
              </h2>
              <p className="mt-1 text-sm leading-5 text-[#69736D] sm:text-base">
                Devices available on your local ESP32 network
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#F0EEE9] px-3 py-1.5 text-[11px] font-bold text-[#69736D] sm:text-xs">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
              {devices.length} {devices.length === 1 ? "device" : "devices"}
            </span>
          </div>

          {loading && (
            <div className="mt-6 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-[#E8E5DF] bg-[#FCFBF9] p-6 text-center">
              <LoaderCircle
                className="mb-3 animate-spin text-[#A86F3D]"
                size={28}
                aria-hidden="true"
                suppressHydrationWarning
              />
              <p className="text-sm font-semibold text-[#26382C]">
                Finding your local devices…
              </p>
              <p className="mt-1 text-xs text-[#858780]">
                This may take a moment.
              </p>
            </div>
          )}

          {!loading && !devices.length && hasDeviceError && (
            <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-[#F3D6D1] bg-[#FFFAF9] px-5 py-8 text-center sm:min-h-72 sm:px-8">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FCEDEC] text-[#858780] sm:hidden">
                <WifiOff size={30} aria-hidden="true" suppressHydrationWarning />
              </span>
              <img
                src="/images/vikatech-local-network.png"
                alt=""
                aria-hidden="true"
                className="mb-2 hidden h-[112px] w-[220px] object-contain sm:block"
              />
              <h3 className="mt-4 text-base font-extrabold text-[#26382C] sm:text-lg">
                Your device list couldn't be loaded
              </h3>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#69736D]">
                The ESP32 responded, but VikaTech could not retrieve its device
                list. Make sure you are connected to the HOME-AUTO-LEADER Wi-Fi
                network, then try again.
              </p>
              <button
                type="button"
                onClick={() => loadDevices(false)}
                disabled={checking}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E4C4B9] bg-white px-5 text-sm font-bold text-[#8D4C20] transition hover:bg-[#FFF5F0] disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={checking ? "animate-spin" : ""}
                  suppressHydrationWarning
                />
                Try again
              </button>
            </div>
          )}

          {!loading && !devices.length && !error && connected && (
            <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[#DADFD7] bg-[#FCFBF9] px-5 py-8 text-center sm:min-h-72">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EAF1E8] text-[#536D5B] sm:hidden">
                <WifiOff size={34} aria-hidden="true" suppressHydrationWarning />
              </span>
              <img
                src="/images/vikatech-local-network.png"
                alt=""
                aria-hidden="true"
                className="mb-2 hidden h-[132px] w-[260px] object-contain sm:block"
              />
              <h3 className="mt-5 text-base font-extrabold text-[#173D2D] sm:text-lg">
                Your local device list will appear here
              </h3>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#69736D]">
                Once connected, available devices will appear here so you can
                control them directly from VikaTech.
              </p>
            </div>
          )}

          {devices.length > 0 && (
            <div className="mt-5 rounded-2xl border border-[#E8E5DF] bg-[#FCFBF9] p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-[#26382C]">Control every connected device</p>
                  <p className="mt-1 text-xs leading-5 text-[#69736D]">Commands go directly to the local ESP32 mesh; internet is not required.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button
                    type="button"
                    onClick={() => toggleAllDevices("on")}
                    disabled={!connected || Boolean(bulkBusy) || loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#39845A] px-4 text-xs font-extrabold text-white transition hover:bg-[#287247] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkBusy === "on" ? <LoaderCircle size={15} className="animate-spin" /> : <Power size={15} />}
                    All ON
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAllDevices("off")}
                    disabled={!connected || Boolean(bulkBusy) || loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#DADFD7] bg-white px-4 text-xs font-extrabold text-[#26382C] transition hover:border-[#C98C66] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkBusy === "off" ? <LoaderCircle size={15} className="animate-spin" /> : <Power size={15} />}
                    All OFF
                  </button>
                </div>
              </div>
              {bulkMessage && (
                <p className={`mt-3 text-xs font-semibold leading-5 ${bulkMessage.startsWith("Confirmed:") ? "text-[#287247]" : "text-[#D94B4B]"}`} role="status" aria-live="polite">
                  {bulkMessage}
                </p>
              )}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {devices.map((device) => {
              const key = `${device.node_id || "local"}-${device.relay_index}`;
              const on = Boolean(device.is_on);
              const deviceLabel = device.node_id || "ESP32";
              return (
                <article
                  key={device.id}
                  className={`rounded-2xl border p-4 transition sm:p-5 ${
                    on
                      ? "border-[#C9DDCC] bg-[#F7FBF6]"
                      : "border-[#E8E5DF] bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          on
                            ? "bg-[#E0EFE1] text-[#39845A]"
                            : "bg-[#F0EEE9] text-[#69736D]"
                        }`}
                      >
                        <Power size={19} aria-hidden="true" suppressHydrationWarning />
                      </span>
                      <div className="min-w-0">
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-[#A86F3D]" title={device.roomName || deviceLabel}>
                            {device.roomName || deviceLabel}
                          </p>
                          <p className="truncate text-sm font-extrabold text-[#26382C]" title={device.name || deviceLabel}>
                            {device.name || deviceLabel}
                          </p>
                          <p className="mt-1 text-xs text-[#858780]">
                            Relay {Number(device.relay_index) + 1}
                          </p>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                        on
                          ? "bg-[#E0EFE1] text-[#287247]"
                          : "bg-[#F0EEE9] text-[#69736D]"
                      }`}
                    >
                      {on ? "On" : "Off"}
                    </span>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#E8E5DF] pt-4">
                    <span className="text-xs font-medium text-[#69736D]">
                      Device power
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`Turn ${deviceLabel} relay ${device.relay_index + 1} ${on ? "off" : "on"}`}
                      onClick={() => toggle(device)}
                      disabled={busy[key] || !connected}
                      className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A86F3D] disabled:cursor-not-allowed disabled:opacity-60 ${
                        on ? "bg-[#39845A]" : "bg-[#D5D3CD]"
                      }`}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                  </div>
                  {busy[key] && (
                    <p className="mt-3 text-xs font-semibold text-[#A86F3D]">
                      Updating device…
                    </p>
                  )}
                  {!busy[key] && commandErrors[key] && (
                    <p className="mt-3 text-xs font-semibold leading-5 text-[#D94B4B]">
                      {commandErrors[key]}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <style jsx global>{`
        /* Page-scoped dark palette. The theme follows html[data-theme] set by VikaTech. */
        html[data-theme="dark"] .local-control-page {
          background: #0b120d !important;
          color: #edf5ee !important;
          color-scheme: dark;
        }
        html[data-theme="dark"] .local-control-page section[aria-labelledby="local-devices-title"],
        html[data-theme="dark"] .local-control-page article,
        html[data-theme="dark"] .local-control-page .bg-white,
        html[data-theme="dark"] .local-control-page [class*="bg-white"] {
          background-color: #142018 !important;
        }
        html[data-theme="dark"] .local-control-page [class*="bg-[#F5F3EF]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#FCFBF9]"] {
          background-color: #0b120d !important;
        }
        html[data-theme="dark"] .local-control-page [class*="bg-[#FFF5F3]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#FFFAF9]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#FCE4E2]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#FCEDEC]"] {
          background-color: #2b1918 !important;
        }
        html[data-theme="dark"] .local-control-page [class*="bg-[#F0EEE9]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#EAF1E8]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#DDEEE0]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#E0EFE1]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#F7FBF6]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#F0F6EF]"] {
          background-color: #172b1d !important;
        }
        html[data-theme="dark"] .local-control-page [class*="bg-[#F3D9CA]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#F3DCD4]"],
        html[data-theme="dark"] .local-control-page [class*="bg-[#F0E1D4]"] {
          background-color: #35271f !important;
        }
        html[data-theme="dark"] .local-control-page [class*="text-[#26382C]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#173D2D]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#6F2822]"] {
          color: #edf5ee !important;
        }
        html[data-theme="dark"] .local-control-page [class*="text-[#69736D]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#858780]"] {
          color: #aab8ae !important;
        }
        html[data-theme="dark"] .local-control-page [class*="text-[#39845A]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#287247]"] {
          color: #91d6a4 !important;
        }
        html[data-theme="dark"] .local-control-page [class*="text-[#A86F3D]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#8D5B30]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#8D4C20]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#C28A62]"] {
          color: #e6b27c !important;
        }
        html[data-theme="dark"] .local-control-page [class*="text-[#8E211D]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#D62828]"],
        html[data-theme="dark"] .local-control-page [class*="text-[#D94B4B]"] {
          color: #ff8e87 !important;
        }
        html[data-theme="dark"] .local-control-page [class*="border-[#E8E5DF]"],
        html[data-theme="dark"] .local-control-page [class*="border-[#DADFD7]"],
        html[data-theme="dark"] .local-control-page [class*="border-[#E4C4B9]"],
        html[data-theme="dark"] .local-control-page [class*="border-white/80"] {
          border-color: #2b3b30 !important;
        }
        html[data-theme="dark"] .local-control-page [class*="border-[#C9DDCC]"],
        html[data-theme="dark"] .local-control-page [class*="border-[#B9D8C1]"] {
          border-color: #31563b !important;
        }
        html[data-theme="dark"] .local-control-page [class*="border-[#F7D0CB]"],
        html[data-theme="dark"] .local-control-page [class*="border-[#F3D6D1]"],
        html[data-theme="dark"] .local-control-page [class*="border-[#F3DCD4]"],
        html[data-theme="dark"] .local-control-page [class*="border-[#F1D8D1]"] {
          border-color: #55302d !important;
        }
        html[data-theme="dark"] .local-control-page [class*="from-[#F8F8F5]"] {
          background-image: linear-gradient(135deg, #243128, #17231b) !important;
        }
        html[data-theme="dark"] .local-control-page [class*="to-[#D8DAD4]"] {
          --tw-gradient-to: #17231b var(--tw-gradient-to-position) !important;
        }
        html[data-theme="dark"] .local-control-page button:focus-visible {
          outline-color: #e6b27c !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .local-control-page *, .local-control-page *::before, .local-control-page *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
