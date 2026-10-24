"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import VoiceControl from "@/components/VoiceControl";
import Toast from "@/components/Toast";
import Loader from "@/components/Loader";
import AddBoardModal from "@/components/AddBoardModal";
import EditBoardModal from "@/components/EditBoardModal";
import QuickPresets from "@/components/QuickPresets";
import useDashboardData from "@/hooks/useDashboardData";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  List,
  LayoutGrid,
  Plus,
  Power,
  PowerOff,
  Pencil,
} from "lucide-react";
import { isAdminEmail } from "@/lib/admin";
import RoomList from "@/components/pg/RoomList";
import DeviceCard from "@/components/pg/DeviceCard";
import OverviewCards from "@/components/pg/OverviewCards";
import EnergyPanel from "@/components/pg/EnergyPanel";
import ActivityFeed from "@/components/pg/ActivityFeed";
import {
  getDeviceWattage,
  getDeviceRunHoursToday,
} from "@/app/analytics/helpers";
import { isBoardOnline } from "@/components/pg/deviceKind";

// Collapsed rooms persist in a cookie: { [boardId]: true } = collapsed.
// Only collapsed rooms are stored; expanding deletes the key.
const ROOM_COOKIE = "vt_rooms_collapsed";
function readCollapsedRooms() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)vt_rooms_collapsed=([^;]*)/);
    return m ? JSON.parse(decodeURIComponent(m[1])) : {};
  } catch {
    return {};
  }
}
function writeCollapsedRooms(map) {
  try {
    document.cookie = `${ROOM_COOKIE}=${encodeURIComponent(JSON.stringify(map))}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
}
function readCookieValue(name) {
  try {
    const match = document.cookie.match(
      new RegExp(
        `(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}=([^;]*)`,
      ),
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
function writeCookieValue(name, value) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
}

export default function Dashboard() {
  const {
    user,
    setUser,
    boards,
    setBoards,
    devices,
    setDevices,
    presets,
    setPresets,
    expandedBoards,
    setExpandedBoards,
    loading,
    setLoading,
    controlDevice,
    controlAll,
    isClientOnline,
    isLocalConnected,
  } = useDashboardData();

  const [toast, setToast] = useState("");
  const [showAddBoardModal, setShowAddBoardModal] = useState(false);
  const [boardIdentifier, setBoardIdentifier] = useState("");
  const [boardName, setBoardName] = useState("");

  // Edit Board Modal State
  const [showEditBoardModal, setShowEditBoardModal] = useState(false);
  const [editingBoardObj, setEditingBoardObj] = useState(null);

  // PG layout state: rooms are boards (no room table exists in the backend).
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [deviceView, setDeviceView] = useState("carousel");
  // Pending device writes: { [deviceId]: desiredState }. Cleared when the
  // realtime echo reflects the state, or by a safety timeout.
  const [pending, setPending] = useState({});
  const deviceCarouselRef = useRef(null);
  const restoredCarouselRef = useRef("");

  const deviceViewCookie = user?.id ? `vt_device_view_${user.id}` : null;
  const carouselCookie = useCallback(
    (boardId) =>
      user?.id && boardId ? `vt_device_carousel_${user.id}_${boardId}` : null,
    [user?.id],
  );

  useEffect(() => {
    if (!deviceViewCookie) return;
    const savedView = readCookieValue(deviceViewCookie);
    if (savedView === "list" || savedView === "carousel")
      setDeviceView(savedView);
  }, [deviceViewCookie]);

  const changeDeviceView = useCallback(
    (view) => {
      setDeviceView(view);
      if (deviceViewCookie) writeCookieValue(deviceViewCookie, view);
    },
    [deviceViewCookie],
  );

  const scrollDeviceCarousel = useCallback((direction) => {
    const carousel = deviceCarouselRef.current;
    if (!carousel) return;
    const firstCard = carousel.querySelector("article");
    const gap = 12;
    const distance = firstCard
      ? firstCard.getBoundingClientRect().width + gap
      : carousel.clientWidth;
    carousel.scrollBy({ left: direction * distance, behavior: "smooth" });
  }, []);

  const rememberCarouselIndex = useCallback(
    (event) => {
      const carousel = event.currentTarget;
      const cookie = carouselCookie(selectedBoardId);
      if (!cookie || deviceView !== "carousel") return;
      const firstCard = carousel.querySelector("article");
      const step = firstCard
        ? firstCard.getBoundingClientRect().width + 12
        : carousel.clientWidth;
      const index = step
        ? Math.max(0, Math.round(carousel.scrollLeft / step))
        : 0;
      writeCookieValue(cookie, index);
    },
    [carouselCookie, selectedBoardId, deviceView],
  );

  // Real history for energy estimates + activity feed.
  const [todayLogs, setTodayLogs] = useState([]);
  const [dailyRows, setDailyRows] = useState([]);

  // Driver.js guided tour for first-time users
  useEffect(() => {
    if (typeof window !== "undefined") {
      const onboarded = localStorage.getItem("home_automation_onboarded");
      if (!onboarded) {
        const timer = setTimeout(() => {
          import("driver.js").then(({ driver }) => {
            import("driver.js/dist/driver.css");

            const steps = [
              {
                popover: {
                  title: "Welcome to VikaTech!",
                  description:
                    "Let us take you on a quick interactive tour to navigate your home dashboard.",
                  side: "center",
                  align: "start",
                },
              },
            ];

            if (document.querySelector(".quick-presets-section")) {
              steps.push({
                element: ".quick-presets-section",
                popover: {
                  title: "Quick Presets",
                  description:
                    'Toggle groups of devices instantly (like activating "All ON" or custom preset combos).',
                  side: "bottom",
                  align: "start",
                },
              });
            }

            if (document.querySelector(".boards-section-selector")) {
              steps.push({
                element: ".boards-section-selector",
                popover: {
                  title: "Boards & Devices",
                  description:
                    "Manage and monitor all connected ESP32 boards and device relays in real-time.",
                  side: "top",
                  align: "start",
                },
              });
            }

            if (document.querySelector(".board-card-selector")) {
              steps.push({
                element: ".board-card-selector",
                popover: {
                  title: "XOR Dual-Control Logic",
                  description:
                    "Separate visual states! Clicking the toggle switch commands the relay (is_on). The lightbulb icon displays actual AC current feedback (reality).",
                  side: "top",
                  align: "start",
                },
              });
            }

            if (document.querySelector("#voice-control-mic-btn")) {
              steps.push({
                element: "#voice-control-mic-btn",
                popover: {
                  title: "Hands-Free Voice Assistant",
                  description:
                    'Tap this mic and speak instructions like "turn on Light 1" or "deactivate Party Mode". Try saying commands directly!',
                  side: "left",
                  align: "start",
                },
              });
            }

            const driverObj = driver({
              showProgress: true,
              theme: "dark",
              steps: steps,
              onDestroyed: () => {
                localStorage.setItem("home_automation_onboarded", "true");
              },
            });

            driverObj.drive();
          });
        }, 1200);

        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Modal drag-to-close gesture state for mobile
  const [modalDragY, setModalDragY] = useState(0);
  const [modalDragging, setModalDragging] = useState(false);
  const [modalStartY, setModalStartY] = useState(0);

  const showToast = useCallback((msg) => {
    setToast(msg);
  }, []);

  const handleModalTouchStart = useCallback((e) => {
    setModalStartY(e.touches[0].clientY);
    setModalDragging(true);
  }, []);

  const handleModalTouchMove = useCallback(
    (e) => {
      if (!modalDragging) return;
      if (e.currentTarget.scrollTop > 0) return;
      const deltaY = e.touches[0].clientY - modalStartY;
      if (deltaY > 0) {
        setModalDragY(deltaY);
      }
    },
    [modalDragging, modalStartY],
  );

  const handleModalTouchEnd = useCallback(() => {
    setModalDragging(false);
    if (modalDragY > 80) {
      setShowAddBoardModal(false);
    }
    setModalDragY(0);
  }, [modalDragY]);

  // Default room selection follows the board list.
  useEffect(() => {
    if (boards.length === 0) {
      setSelectedBoardId(null);
      return;
    }
    setSelectedBoardId((prev) =>
      prev && boards.some((b) => b.id === prev) ? prev : boards[0].id,
    );
  }, [boards]);

  // Re-apply collapsed rooms saved in the cookie on every boards change.
  // This also restores the preference after a full page reload.
  useEffect(() => {
    if (boards.length === 0) return;
    const saved = readCollapsedRooms();
    const ids = Object.keys(saved).filter((id) =>
      boards.some((b) => String(b.id) === String(id)),
    );
    if (ids.length === 0) return;
    setExpandedBoards((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      ids.forEach((id) => {
        // Cookie keys are strings; restore the board's native id type.
        const board = boards.find((b) => String(b.id) === String(id));
        const key = board ? board.id : id;
        if (next[key] !== false) {
          next[key] = false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [boards, setExpandedBoards]);

  const toggleRoomCollapsed = useCallback(
    (boardId) => {
      const currentlyExpanded = expandedBoards?.[boardId] ?? true;
      const nextVal = !currentlyExpanded;
      setExpandedBoards((prev) => ({ ...(prev || {}), [boardId]: nextVal }));
      try {
        const saved = readCollapsedRooms();
        if (nextVal) delete saved[boardId];
        else saved[boardId] = true;
        writeCollapsedRooms(saved);
      } catch {}
    },
    [expandedBoards, setExpandedBoards],
  );

  // Fetch today's activity logs (energy estimates + feed) and stored
  // daily energy rollups. Real rows only; empty = unavailable states.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const fetchHistory = async () => {
      try {
        const [logsRes, dailyRes] = await Promise.all([
          supabase
            .from("activity_logs")
            .select(
              "id, created_at, action, device_name, triggered_by, device_id",
            )
            .eq("user_id", user.id)
            .gte("created_at", startOfToday.toISOString())
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("daily_analytics")
            .select("date, total_kwh")
            .eq("user_id", user.id)
            .order("date", { ascending: false })
            .limit(31),
        ]);
        if (!active) return;
        if (logsRes.data) setTodayLogs(logsRes.data);
        if (dailyRes.data) setDailyRows(dailyRes.data);
      } catch (err) {
        console.warn("Dashboard history fetch failed:", err);
      }
    };

    fetchHistory();
    const timer = setInterval(fetchHistory, 60000);
    const prependActivity = (log) => setTodayLogs((previous) => {
      const duplicate = previous.some((item) => {
        if (item.id && log.id) return item.id === log.id;
        return item.device_id === log.device_id &&
          item.action === log.action &&
          Math.abs(new Date(item.created_at).getTime() - new Date(log.created_at).getTime()) < 5000;
      });
      return duplicate ? previous : [log, ...previous].slice(0, 200);
    });
    const channel = supabase
      .channel(`dashboard-activity-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `user_id=eq.${user.id}` },
        ({ new: log }) => prependActivity(log),
      )
      .subscribe();
    const handleLocalActivity = (event) => {
      if (event.detail?.user_id === user.id) {
        prependActivity(event.detail);
      }
    };
    window.addEventListener("dashboard-activity-created", handleLocalActivity);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("dashboard-activity-created", handleLocalActivity);
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Clear pending flags once the realtime echo reflects the desired state.
  useEffect(() => {
    setPending((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const id of ids) {
        const d = devices.find((x) => String(x.id) === String(id));
        if (d && d.is_on === next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [devices]);

  // Safety: never leave a control disabled longer than 6s.
  useEffect(() => {
    if (Object.keys(pending).length === 0) return;
    const timer = setTimeout(() => setPending({}), 6000);
    return () => clearTimeout(timer);
  }, [pending]);

  const toggleDevice = useCallback(
    async (device) => {
      if (!device || pending[device.id]) return;
      const desired = !device.is_on;
      setPending((prev) => ({ ...prev, [device.id]: desired }));
      try {
        await controlDevice(device, desired, "Manual Dashboard Switch");
      } catch (err) {
        showToast(err?.message || "Device update failed. Please retry.");
        setPending((prev) => {
          const next = { ...prev };
          delete next[device.id];
          return next;
        });
      }
    },
    [controlDevice, pending, showToast],
  );

  const isPresetActive = useCallback(
    (preset) => {
      let actions = preset.actions;
      if (typeof actions === "string") {
        try {
          actions = JSON.parse(actions);
        } catch (e) {
          actions = [];
        }
      }
      if (!actions?.length) return false;
      return actions.every((action) => {
        const device = devices.find((d) => d.id === action.device_id);
        return device && device.is_on === action.is_on;
      });
    },
    [devices],
  );

  const applyPreset = useCallback(
    async (preset, deactivate = false) => {
      let actions = preset.actions;
      if (typeof actions === "string") {
        try {
          actions = JSON.parse(actions);
        } catch {
          actions = [];
        }
      }
      if (!Array.isArray(actions) || actions.length === 0) {
        showToast(`Preset ${preset.name} has no saved device actions.`);
        return { success: false, succeeded: 0, failed: 0 };
      }

      let succeeded = 0;
      let failed = 0;
      for (const action of actions) {
        const targetState = deactivate ? !action.is_on : action.is_on;
        const device = devices.find((item) => item.id === action.device_id);
        if (!device) {
          failed++;
          continue;
        }
        const result = await controlDevice(device, targetState, `Preset: ${preset.name}`);
        if (result?.success) succeeded++;
        else failed++;
      }

      const outcome = { success: failed === 0, succeeded, failed };
      if (failed === 0) {
        showToast(`${deactivate ? "Deactivated" : "Activated"}: ${preset.name}`);
      } else if (succeeded > 0) {
        showToast(`Preset ${preset.name} was only partly applied. Check device states.`);
      } else {
        showToast(`Could not apply preset ${preset.name}. Please try again.`);
      }
      return outcome;
    },
    [devices, controlDevice, showToast],
  );

  const deletePreset = useCallback(
    async (presetId) => {
      await supabase.from("presets").delete().eq("id", presetId);
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      showToast("Preset deleted");
    },
    [showToast, setPresets],
  );

  const turnAllDevicesOn = useCallback(async () => {
    if (devices.length === 0) {
      showToast("No devices available to turn ON. Please add a board first.");
      return;
    }
    await controlAll("on", "Global Dashboard");
    showToast("All devices turned ON");
  }, [devices, controlAll, showToast]);

  const turnAllDevicesOff = useCallback(async () => {
    if (devices.length === 0) {
      showToast("No devices available to turn OFF. Please add a board first.");
      return;
    }
    await controlAll("off", "Global Dashboard");
    showToast("All devices turned OFF");
  }, [devices, controlAll, showToast]);

  const getDevicesForBoard = useCallback(
    (boardId) => {
      return devices.filter((d) => d.board_id === boardId);
    },
    [devices],
  );

  const turnBoardDevicesOn = useCallback(
    async (boardId, boardName) => {
      const boardDevices = getDevicesForBoard(boardId);
      if (boardDevices.length === 0) {
        showToast(`No devices found on ${boardName}`);
        return;
      }
      await Promise.all(
        boardDevices.map((d) =>
          controlDevice(d, true, `Board All ON: ${boardName}`),
        ),
      );
      showToast(`All devices on ${boardName} turned ON`);
    },
    [getDevicesForBoard, controlDevice, showToast],
  );

  const turnBoardDevicesOff = useCallback(
    async (boardId, boardName) => {
      const boardDevices = getDevicesForBoard(boardId);
      if (boardDevices.length === 0) {
        showToast(`No devices found on ${boardName}`);
        return;
      }
      await Promise.all(
        boardDevices.map((d) =>
          controlDevice(d, false, `Board All OFF: ${boardName}`),
        ),
      );
      showToast(`All devices on ${boardName} turned OFF`);
    },
    [getDevicesForBoard, controlDevice, showToast],
  );

  const addBoard = useCallback(
    async (e) => {
      e.preventDefault();
      if (!user) return;
      if (!boardIdentifier.trim()) {
        showToast("Board identifier is required");
        return;
      }

      const { data: board, error: boardError } = await supabase
        .from("boards")
        .insert({
          user_id: user.id,
          board_identifier: boardIdentifier.trim(),
          name: boardName.trim() || "New Board",
        })
        .select("id")
        .single();

      if (boardError) {
        showToast(boardError.message);
        return;
      }

      const deviceInserts = [];
      for (let i = 0; i < 4; i++) {
        deviceInserts.push({
          user_id: user.id,
          board_id: board.id,
          relay_index: i,
          name: `Device ${i + 1}`,
          is_on: false,
        });
      }
      const { error: devicesError } = await supabase
        .from("devices")
        .insert(deviceInserts);
      if (devicesError) {
        showToast(devicesError.message);
        return;
      }

      setShowAddBoardModal(false);
      setBoardIdentifier("");
      setBoardName("");
      showToast("Board added with 4 devices");
    },
    [user, boardIdentifier, boardName, showToast],
  );

  const openFullEditBoard = useCallback((board) => {
    setEditingBoardObj(board);
    setShowEditBoardModal(true);
  }, []);

  const saveFullBoardEdit = useCallback(
    async (boardId, newName, newIdentifier, newDeviceNames) => {
      if (!user) return;

      // Update board
      const { error: boardError } = await supabase
        .from("boards")
        .update({ name: newName, board_identifier: newIdentifier })
        .eq("id", boardId);
      if (boardError) {
        showToast(boardError.message);
        return;
      }

      // Update devices
      const devicesToUpdate = getDevicesForBoard(boardId);
      for (const d of devicesToUpdate) {
        if (d.relay_index >= 0 && d.relay_index <= 3) {
          const newDevName = newDeviceNames[d.relay_index];
          if (newDevName !== d.name) {
            await supabase
              .from("devices")
              .update({ name: newDevName })
              .eq("id", d.id);
          }
        }
      }

      showToast("Board updated successfully");
      setShowEditBoardModal(false);
    },
    [user, getDevicesForBoard, showToast],
  );

  // ---- Derived PG view-model (all values from live state / real rows) ----
  // Fall back to the first board: between a boards update (e.g. realtime
  // delete) and the selection effect below, the selected id may match
  // nothing for one frame — never render with a null room.
  const selectedBoard =
    boards.find((b) => b.id === selectedBoardId) || boards[0] || null;
  const selectedDevices = selectedBoard
    ? getDevicesForBoard(selectedBoard.id)
    : [];

  useEffect(() => {
    const cookie = carouselCookie(selectedBoard?.id);
    const restoreKey = cookie ? `${cookie}:${deviceView}` : "";
    if (
      deviceView !== "carousel" ||
      !selectedBoard?.id ||
      selectedDevices.length === 0
    )
      return;
    if (restoredCarouselRef.current === restoreKey) return;

    const savedIndex = Number(readCookieValue(cookie));
    if (!Number.isFinite(savedIndex) || savedIndex < 1) {
      restoredCarouselRef.current = restoreKey;
      return;
    }

    const frame = requestAnimationFrame(() => {
      const carousel = deviceCarouselRef.current;
      const firstCard = carousel?.querySelector("article");
      if (!carousel || !firstCard) return;
      const step = firstCard.getBoundingClientRect().width + 12;
      const maxIndex = Math.max(0, selectedDevices.length - 1);
      carousel.scrollTo({
        left: Math.min(savedIndex, maxIndex) * step,
        behavior: "auto",
      });
      restoredCarouselRef.current = restoreKey;
    });
    return () => cancelAnimationFrame(frame);
  }, [carouselCookie, deviceView, selectedBoard?.id, selectedDevices.length]);

  const activeCount = devices.filter((d) => d.is_on).length;
  const onlineBoards = boards.filter((b) => isBoardOnline(b));
  const liveWatts = Math.round(
    devices.reduce(
      (sum, d) => sum + (d.is_on ? getDeviceWattage(d.name) : 0),
      0,
    ),
  );
  const energyKwhToday = devices.reduce(
    (sum, d) =>
      sum +
      (getDeviceWattage(d.name) * getDeviceRunHoursToday(d, todayLogs)) / 1000,
    0,
  );
  const energyAvailable = devices.length > 0;
  // Sections appear by themselves once the user has data.
  const hasPresets = (presets || []).length > 0;
  const hasEnergyHistory = (dailyRows || []).some(
    (r) => Number(r.total_kwh || 0) > 0,
  );

  const statusMessage = useMemo(() => {
    if (!isClientOnline && !isLocalConnected)
      return "You are offline — showing the last synced state.";
    if (boards.length === 0)
      return "Add your first room controller to get started.";
    const parts = [];
    parts.push(
      activeCount === 0
        ? "All devices are off"
        : `${activeCount} of ${devices.length} device${devices.length === 1 ? "" : "s"} on`,
    );
    parts.push(
      onlineBoards.length === boards.length
        ? "all rooms online"
        : `${onlineBoards.length} of ${boards.length} rooms online`,
    );
    if (isLocalConnected) parts.push("local mesh linked");
    return parts.join(" · ") + ".";
  }, [
    isClientOnline,
    isLocalConnected,
    boards.length,
    activeCount,
    devices.length,
    onlineBoards.length,
  ]);

  const systemOk =
    isClientOnline &&
    boards.length > 0 &&
    onlineBoards.length === boards.length;
  const systemMessage = useMemo(() => {
    if (!isClientOnline && !isLocalConnected) return "Offline — local only";
    if (boards.length === 0) return "No rooms yet";
    if (onlineBoards.length === boards.length) return "All rooms responding";
    return `${boards.length - onlineBoards.length} room${boards.length - onlineBoards.length === 1 ? "" : "s"} offline`;
  }, [isClientOnline, isLocalConnected, boards.length, onlineBoards.length]);

  const deviceRoom = useCallback(
    (log) => {
      const device = devices.find(
        (d) => String(d.id) === String(log.device_id),
      );
      if (!device) return null;
      const board = boards.find((b) => b.id === device.board_id);
      return board ? board.name : null;
    },
    [devices, boards],
  );

  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "there";

  const bulkBtn = (label, Icon, onClick) => {
    return (
      <button
        onClick={onClick}
        title={label}
        aria-label={label}
        className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-xl border border-(--pg-line) bg-(--pg-card) px-3.5 text-xs font-extrabold text-(--pg-ink) transition-all cursor-pointer whitespace-nowrap hover:border-(--pg-brand-line) hover:text-(--pg-brand)"
      >
        <Icon size={14} aria-hidden="true" />
        <span className="max-sm:hidden">{label}</span>
      </button>
    );
  };

  if (loading) {
    return <Loader message="Loading VikaTech Dashboard..." />;
  }

  return (
    <>
      <div className="dashboard-container animate-fade-up">
        <OverviewCards
          userName={userName}
          statusMessage={statusMessage}
          totalDevices={devices.length}
          activeDevices={activeCount}
          energyKwhToday={energyKwhToday}
          energyAvailable={energyAvailable}
          liveWatts={liveWatts}
          systemOk={systemOk}
          systemMessage={systemMessage}
        />

        {boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-(--pg-line) bg-(--pg-card) p-10 text-center animate-scale-in max-w-lg mx-auto select-none gap-4">
            <div className="w-12 h-12 rounded-2xl bg-(--pg-brand-faint) flex items-center justify-center text-(--pg-brand) border border-(--pg-brand-soft)">
              <Cpu size={24} className="stroke-[2.5px]" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-extrabold text-(--pg-ink) tracking-tight">
                No Rooms Registered Yet
              </h3>
              <p className="text-xs text-(--pg-muted) font-medium leading-relaxed px-4">
                To start controlling your PG, add your first room controller
                (ESP32 board). You will be able to configure up to 4 devices per
                room.
              </p>
            </div>
            <button
              onClick={() => setShowAddBoardModal(true)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-(--pg-brand) px-5 text-xs font-extrabold text-(--pg-onbrand) transition-all hover:bg-(--pg-brand-hover) cursor-pointer mt-1"
            >
              Add Your First Room
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
              {/* RIGHT on desktop: selected room devices (wide). Mobile order unchanged. */}
              <section
                aria-label="Rooms and devices"
                className="boards-section-selector min-w-0 rounded-2xl border border-(--pg-line) bg-(--pg-card) p-3 sm:p-5 lg:order-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
                  <div className="min-w-0 flex-1">
                    <h2
                      className="text-lg font-extrabold text-(--pg-ink) tracking-tight truncate"
                      title={
                        selectedBoard ? selectedBoard.name : "Rooms & Devices"
                      }
                    >
                      {selectedBoard ? selectedBoard.name : "Rooms & Devices"}
                    </h2>
                    <p className="text-xs font-semibold text-(--pg-muted) mt-1">
                      {selectedDevices.length} device
                     
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                      {expandedBoards[selectedBoard.id] !== false ? (
                    <div
                      className="flex items-center rounded-xl border border-(--pg-line) bg-(--pg-card) p-0.5"
                      aria-label="Device view options"
                    >
                      <button
                        type="button"
                        onClick={() => changeDeviceView("list")}
                        aria-label="List view"
                        aria-pressed={deviceView === "list"}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${deviceView === "list" ? "bg-(--pg-deep) text-(--pg-tile-ico)" : "text-(--pg-muted) hover:text-(--pg-ink)"}`}
                      >
                      <List size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => changeDeviceView("carousel")}
                        aria-label="Carousel view"
                        aria-pressed={deviceView === "carousel"}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all cursor-pointer ${deviceView === "carousel" ? "bg-(--pg-deep) text-(--pg-tile-ico)" : "text-(--pg-muted) hover:text-(--pg-ink)"}`}
                      >
                        <LayoutGrid size={14} aria-hidden="true" />
                      </button>
                    </div>
                    ) : null}
                    {bulkBtn("Room On", Power, () =>
                      turnBoardDevicesOn(selectedBoard.id, selectedBoard.name),
                    )}
                    {bulkBtn("Room Off", PowerOff, () =>
                      turnBoardDevicesOff(selectedBoard.id, selectedBoard.name),
                    )}
                    <button
                      onClick={() =>
                        selectedBoard && openFullEditBoard(selectedBoard)
                      }
                      title="Rename room & devices"
                      aria-label="Rename room and devices"
                      className="inline-flex min-h-[36px] w-9 items-center justify-center rounded-xl border border-(--pg-line) bg-(--pg-card) text-(--pg-muted) hover:border-(--pg-brand-line) hover:text-(--pg-brand) transition-all cursor-pointer"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => toggleRoomCollapsed(selectedBoard.id)}
                      title={
                        expandedBoards[selectedBoard.id] === false
                          ? "Expand room"
                          : "Collapse room"
                      }
                      aria-label={
                        expandedBoards[selectedBoard.id] === false
                          ? "Expand room"
                          : "Collapse room"
                      }
                      aria-expanded={expandedBoards[selectedBoard.id] !== false}
                      className="inline-flex min-h-[36px] w-9 items-center justify-center rounded-xl border border-(--pg-line) bg-(--pg-card) text-(--pg-muted) hover:border-(--pg-brand-line) hover:text-(--pg-brand) transition-all cursor-pointer"
                    >
                      <ChevronDown
                        size={15}
                        className={`transition-transform duration-300 ${expandedBoards[selectedBoard.id] === false ? "-rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                </div>

                {expandedBoards[selectedBoard.id] !== false && (
                  <>
                    {selectedDevices.length === 0 ? (
                      <p className="py-8 text-center text-(--pg-muted) text-xs font-semibold">
                        No devices in this room.
                      </p>
                    ) : (
                      <div
                        id="device-carousel"
                        ref={deviceCarouselRef}
                        onScroll={rememberCarouselIndex}
                        scrollEventThrottle="100"
                         className={`board-card-selector ${deviceView === "carousel" ? "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth overscroll-x-contain pb-1" : "grid sm:grid-cols-2 gap-2.5"}`}
                        aria-label="Local devices carousel"
                      >
                        {selectedDevices.map((device) => (
                          <DeviceCard
                            key={device.id}
                            device={device}
                            roomName={selectedBoard.name}
                            boardOnline={isBoardOnline(selectedBoard)}
                            pending={pending[device.id] !== undefined}
                            onToggle={() => toggleDevice(device)}
                            carousel={deviceView === "carousel"}
                          />
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-4 border-t border-(--pg-line)">
                      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-(--pg-muted) mr-1">
                        Property
                      </span>
                      {bulkBtn("All On", Power, turnAllDevicesOn)}
                      {bulkBtn("All Off", PowerOff, turnAllDevicesOff)}
                      {deviceView === "carousel" && (
                        <div className="ml-auto flex items-center gap-1.5 sm:hidden">
                          <button
                            type="button"
                            onClick={() => scrollDeviceCarousel(-1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--pg-line) bg-(--pg-card) text-(--pg-muted) transition hover:border-(--pg-brand-line) hover:text-(--pg-brand) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-brand)"
                            aria-label="Previous device"
                            aria-controls="device-carousel"
                          >
                            <ChevronLeft size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => scrollDeviceCarousel(1)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-(--pg-line) bg-(--pg-card) text-(--pg-muted) transition hover:border-(--pg-brand-line) hover:text-(--pg-brand) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-brand)"
                            aria-label="Next device"
                            aria-controls="device-carousel"
                          >
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>

              {/* LEFT on desktop: rooms list (narrow). Mobile order unchanged. */}
              <div className="lg:order-1 lg:sticky lg:top-20 min-w-0 rounded-2xl border border-(--pg-line) bg-(--pg-card) p-2.5 sm:p-3">
                <RoomList
                  boards={boards}
                  devices={devices}
                  selectedId={selectedBoard?.id}
                  onSelect={setSelectedBoardId}
                />
                <button
                  onClick={() => setShowAddBoardModal(true)}
                  className="mt-2 w-full inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed border-(--pg-line) text-xs font-extrabold text-(--pg-brand) hover:border-(--pg-brand-line) hover:bg-(--pg-brand)/[0.06] transition-all cursor-pointer"
                >
                  <Plus size={14} aria-hidden="true" />
                  Add Room
                </button>
              </div>
            </div>

            {(hasPresets || hasEnergyHistory) && (
              <div className="grid gap-4 lg:grid-cols-2 mt-4 items-start">
                {hasPresets && (
                  <div className="min-w-0 rounded-2xl border border-(--pg-line) bg-(--pg-card) p-4 sm:p-5">
                    <QuickPresets
                      presets={presets}
                      isPresetActive={isPresetActive}
                      applyPreset={applyPreset}
                      deletePreset={deletePreset}
                    />
                  </div>
                )}
                {hasEnergyHistory && (
                  <div className="min-w-0">
                    <EnergyPanel dailyRows={dailyRows} />
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <ActivityFeed logs={todayLogs} deviceRoom={deviceRoom} />
            </div>
          </>
        )}
      </div>

      <AddBoardModal
        showAddBoardModal={showAddBoardModal}
        setShowAddBoardModal={setShowAddBoardModal}
        boardIdentifier={boardIdentifier}
        setBoardIdentifier={setBoardIdentifier}
        boardName={boardName}
        setBoardName={setBoardName}
        addBoard={addBoard}
        modalDragY={modalDragY}
        modalDragging={modalDragging}
        handleModalTouchStart={handleModalTouchStart}
        handleModalTouchMove={handleModalTouchMove}
        handleModalTouchEnd={handleModalTouchEnd}
      />

      <EditBoardModal
        showEditBoardModal={showEditBoardModal}
        setShowEditBoardModal={setShowEditBoardModal}
        editingBoardObj={editingBoardObj}
        editingBoardDevices={
          editingBoardObj ? getDevicesForBoard(editingBoardObj.id) : []
        }
        saveFullBoardEdit={saveFullBoardEdit}
        modalDragY={modalDragY}
        modalDragging={modalDragging}
        handleModalTouchStart={handleModalTouchStart}
        handleModalTouchMove={handleModalTouchMove}
        handleModalTouchEnd={handleModalTouchEnd}
      />

      <VoiceControl
        devices={devices}
        boards={boards}
        presets={presets}
        applyPreset={applyPreset}
        controlDevice={controlDevice}
        controlAll={controlAll}
        onToast={showToast}
      />
      <Toast message={toast} onClose={() => setToast("")} />
    </>
  );
}
