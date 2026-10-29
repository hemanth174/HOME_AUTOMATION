"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import useDashboardData from "@/hooks/useDashboardData";
import {
  getDeviceWattage,
  getDeviceRunHoursToday,
} from "@/app/analytics/helpers";
import { isBoardOnline } from "./pg/deviceKind";

const readCookie = (name) => {
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
};
const writeCookie = (name, value) => {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
};

export default function useDashboardController() {
  const data = useDashboardData();
  const {
    user,
    loading,
    boards,
    devices,
    presets,
    setPresets,
    expandedBoards,
    setExpandedBoards,
    controlDevice,
    controlAll,
    isClientOnline,
    isLocalConnected,
  } = data;
  const [toast, setToast] = useState(""),
    [showAddBoardModal, setShowAddBoardModal] = useState(false),
    [boardIdentifier, setBoardIdentifier] = useState(""),
    [boardName, setBoardName] = useState("");
  const [showEditBoardModal, setShowEditBoardModal] = useState(false),
    [editingBoardObj, setEditingBoardObj] = useState(null),
    [selectedBoardId, setSelectedBoardId] = useState(null),
    [deviceView, setDeviceView] = useState("carousel"),
    [pending, setPending] = useState({});
  const [todayLogs, setTodayLogs] = useState([]),
    [dailyRows, setDailyRows] = useState([]);
  const carouselRef = useRef(null);
  const deviceScrollTimer = useRef(null);
  const viewCookie = user?.id && `vt_device_view_${user.id}`,
    roomCookie = user?.id && `vt_selected_room_${user.id}`;
  const deviceIndexCookie =
    user?.id && selectedBoardId
      ? `vt_device_index_${user.id}_${selectedBoardId}`
      : null;
  const showToast = useCallback((message) => setToast(message), []);
  const getDevicesForBoard = useCallback(
    (id) => devices.filter((device) => device.board_id === id),
    [devices],
  );
  useEffect(() => {
    if (viewCookie) {
      const saved = readCookie(viewCookie);
      if (saved === "list" || saved === "carousel") setDeviceView(saved);
    }
  }, [viewCookie]);
  const changeDeviceView = useCallback(
    (view) => {
      setDeviceView(view);
      if (viewCookie) writeCookie(viewCookie, view);
    },
    [viewCookie],
  );
  useEffect(() => {
    if (!boards.length) return setSelectedBoardId(null);
    const saved = roomCookie && readCookie(roomCookie);
    setSelectedBoardId((current) =>
      current && boards.some((b) => b.id === current)
        ? current
        : saved && boards.some((b) => String(b.id) === saved)
          ? saved
          : boards[0].id,
    );
  }, [boards, roomCookie]);
  const selectBoard = useCallback(
    (id) => {
      setSelectedBoardId(id);
      if (roomCookie) writeCookie(roomCookie, id);
    },
    [roomCookie],
  );
  const toggleRoomCollapsed = useCallback(
    (id) => {
      const expanded = expandedBoards?.[id] ?? true;
      setExpandedBoards((prev) => ({ ...(prev || {}), [id]: !expanded }));
    },
    [expandedBoards, setExpandedBoards],
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    const fetchHistory = async () => {
      const [logs, daily] = await Promise.all([
        supabase
          .from("activity_logs")
          .select(
            "id, created_at, action, device_name, triggered_by, device_id",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("daily_analytics")
          .select("date, total_kwh")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .limit(31),
      ]);
      if (active) {
        if (logs.data) setTodayLogs(logs.data);
        if (daily.data) setDailyRows(daily.data);
      }
    };
    fetchHistory();
    const timer = setInterval(fetchHistory, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user]);
  useEffect(() => {
    setPending((current) => {
      const next = { ...current };
      Object.keys(next).forEach((id) => {
        const device = devices.find((d) => String(d.id) === id);
        if (device?.is_on === next[id]) delete next[id];
      });
      return next;
    });
  }, [devices]);
  useEffect(() => {
    if (!Object.keys(pending).length) return;
    const timer = setTimeout(() => setPending({}), 6000);
    return () => clearTimeout(timer);
  }, [pending]);
  const toggleDevice = useCallback(
    async (device) => {
      if (!device || pending[device.id]) return;
      const desired = !device.is_on;
      setPending((p) => ({ ...p, [device.id]: desired }));
      try {
        await controlDevice(device, desired, "Manual Dashboard Switch");
      } catch (error) {
        showToast(error?.message || "Device update failed. Please retry.");
        setPending((p) => {
          const next = { ...p };
          delete next[device.id];
          return next;
        });
      }
    },
    [pending, controlDevice, showToast],
  );
  const applyPreset = useCallback(
    async (preset, deactivate = false) => {
      let actions = preset.actions;
      if (typeof actions === "string")
        try {
          actions = JSON.parse(actions);
        } catch {
          actions = [];
        }
      if (!Array.isArray(actions) || !actions.length)
        return showToast(`Preset ${preset.name} has no saved device actions.`);
      for (const action of actions) {
        const device = devices.find((d) => d.id === action.device_id);
        if (device)
          await controlDevice(
            device,
            deactivate ? !action.is_on : action.is_on,
            `Preset: ${preset.name}`,
          );
      }
      showToast(`${deactivate ? "Deactivated" : "Activated"}: ${preset.name}`);
    },
    [devices, controlDevice, showToast],
  );
  const isPresetActive = useCallback(
    (preset) => {
      let actions = preset.actions;
      if (typeof actions === "string")
        try {
          actions = JSON.parse(actions);
        } catch {
          actions = [];
        }
      return (
        !!actions?.length &&
        actions.every(
          (a) => devices.find((d) => d.id === a.device_id)?.is_on === a.is_on,
        )
      );
    },
    [devices],
  );
  const deletePreset = useCallback(
    async (id) => {
      await supabase.from("presets").delete().eq("id", id);
      setPresets((all) => all.filter((p) => p.id !== id));
      showToast("Preset deleted");
    },
    [setPresets, showToast],
  );
  const turnAllDevicesOn = useCallback(
    () =>
      devices.length
        ? controlAll("on", "Global Dashboard").then(() =>
            showToast("All devices turned ON"),
          )
        : showToast(
            "No devices available to turn ON. Please add a board first.",
          ),
    [devices, controlAll, showToast],
  );
  const turnAllDevicesOff = useCallback(
    () =>
      devices.length
        ? controlAll("off", "Global Dashboard").then(() =>
            showToast("All devices turned OFF"),
          )
        : showToast(
            "No devices available to turn OFF. Please add a board first.",
          ),
    [devices, controlAll, showToast],
  );
  const boardControl = useCallback(
    async (id, name, on) => {
      const list = getDevicesForBoard(id);
      if (!list.length) return showToast(`No devices found on ${name}`);
      await Promise.all(
        list.map((d) =>
          controlDevice(d, on, `Board All ${on ? "ON" : "OFF"}: ${name}`),
        ),
      );
      showToast(`All devices on ${name} turned ${on ? "ON" : "OFF"}`);
    },
    [getDevicesForBoard, controlDevice, showToast],
  );
  const addBoard = useCallback(
    async (e) => {
      e.preventDefault();
      if (!user) return;
      if (!boardIdentifier.trim())
        return showToast("Board identifier is required");
      const { data: board, error } = await supabase
        .from("boards")
        .insert({
          user_id: user.id,
          board_identifier: boardIdentifier.trim(),
          name: boardName.trim() || "New Board",
        })
        .select("id")
        .single();
      if (error) return showToast(error.message);
      const { error: devicesError } = await supabase
        .from("devices")
        .insert(
          Array.from({ length: 4 }, (_, relay_index) => ({
            user_id: user.id,
            board_id: board.id,
            relay_index,
            name: `Device ${relay_index + 1}`,
            is_on: false,
          })),
        );
      if (devicesError) return showToast(devicesError.message);
      setShowAddBoardModal(false);
      setBoardIdentifier("");
      setBoardName("");
      showToast("Board added with 4 devices");
    },
    [user, boardIdentifier, boardName, showToast],
  );
  const saveFullBoardEdit = useCallback(
    async (id, name, identifier, names) => {
      const { error } = await supabase
        .from("boards")
        .update({ name, board_identifier: identifier })
        .eq("id", id);
      if (error) return showToast(error.message);
      for (const device of getDevicesForBoard(id))
        if (names[device.relay_index] !== device.name)
          await supabase
            .from("devices")
            .update({ name: names[device.relay_index] })
            .eq("id", device.id);
      setShowEditBoardModal(false);
      showToast("Board updated successfully");
    },
    [getDevicesForBoard, showToast],
  );
  const selectedBoard =
      boards.find((b) => b.id === selectedBoardId) || boards[0] || null,
    selectedDevices = selectedBoard ? getDevicesForBoard(selectedBoard.id) : [];
  const selectedRoomExpanded = selectedBoard
    ? expandedBoards?.[selectedBoard.id] !== false
    : true;
  useEffect(() => {
    if (
      !deviceIndexCookie ||
      deviceView !== "carousel" ||
      !selectedRoomExpanded ||
      loading
    )
      return undefined;
    const carousel = carouselRef.current;
    if (!carousel) return undefined;
    const saved = Number(readCookie(deviceIndexCookie));
    if (!Number.isInteger(saved) || saved < 0) return undefined;
    const frame = requestAnimationFrame(() => {
      const cards = carousel.querySelectorAll("article");
      const card = cards[saved];
      if (!card) return;
      const left =
        card.getBoundingClientRect().left -
        carousel.getBoundingClientRect().left +
        carousel.scrollLeft;
      carousel.scrollLeft = left;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    deviceIndexCookie,
    deviceView,
    loading,
    selectedDevices.length,
    selectedRoomExpanded,
  ]);
  const saveDeviceIndex = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel || !deviceIndexCookie) return;
    if (deviceScrollTimer.current) clearTimeout(deviceScrollTimer.current);
    deviceScrollTimer.current = setTimeout(() => {
      const cards = Array.from(carousel.querySelectorAll("article"));
      if (!cards.length) return;
      const carouselRect = carousel.getBoundingClientRect();
      const center = carouselRect.left + carouselRect.width / 2;
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      writeCookie(deviceIndexCookie, String(nearestIndex));
    }, 120);
  }, [deviceIndexCookie]);
  useEffect(
    () => () => {
      if (deviceScrollTimer.current) clearTimeout(deviceScrollTimer.current);
    },
    [],
  );
  const activeCount = devices.filter((d) => d.is_on).length,
    onlineBoards = boards.filter(isBoardOnline),
    liveWatts = Math.round(
      devices.reduce(
        (sum, d) => sum + (d.is_on ? getDeviceWattage(d.name) : 0),
        0,
      ),
    ),
    energyKwhToday = devices.reduce(
      (sum, d) =>
        sum +
        (getDeviceWattage(d.name) * getDeviceRunHoursToday(d, todayLogs)) /
          1000,
      0,
    );
  const statusMessage = useMemo(() => {
    if (!isClientOnline && !isLocalConnected) {
      return [
        { text: "You are " },
        { text: "offline", tone: "error" },
        { text: " — showing the last synced state." },
      ];
    }
    if (!boards.length) {
      return [
        { text: "Add your " },
        { text: "first room controller", tone: "accent" },
        { text: " to get started." },
      ];
    }
    const deviceLabel = devices.length === 1 ? "device" : "devices";
    const roomLabel = boards.length === 1 ? "room" : "rooms";
    return [
      { text: String(activeCount), tone: "accent" },
      { text: " of " },
      { text: String(devices.length), tone: "accent" },
      { text: ` ${deviceLabel} on \u2192 ` },
      { text: String(onlineBoards.length), tone: "accent" },
      { text: " of " },
      { text: String(boards.length), tone: "accent" },
      { text: ` ${roomLabel} online` },
    ];
  }, [
    isClientOnline,
    isLocalConnected,
    boards.length,
    activeCount,
    devices.length,
    onlineBoards.length,
  ]);
  const deviceRoom = useCallback(
    (log) => {
      const device = devices.find(
        (d) => String(d.id) === String(log.device_id),
      );
      return boards.find((b) => b.id === device?.board_id)?.name || null;
    },
    [devices, boards],
  );
  return {
    ...data,
    toast,
    showToast,
    showAddBoardModal,
    setShowAddBoardModal,
    boardIdentifier,
    setBoardIdentifier,
    boardName,
    setBoardName,
    showEditBoardModal,
    setShowEditBoardModal,
    editingBoardObj,
    setEditingBoardObj,
    selectedBoard,
    selectedDevices,
    deviceView,
    changeDeviceView,
    pending,
    toggleDevice,
    todayLogs,
    dailyRows,
    activeCount,
    onlineBoards,
    liveWatts,
    energyKwhToday,
    statusMessage,
    systemOk:
      isClientOnline &&
      boards.length > 0 &&
      onlineBoards.length === boards.length,
    systemMessage:
      onlineBoards.length === boards.length
        ? "All rooms responding"
        : `${boards.length - onlineBoards.length} rooms offline`,
    hasPresets: presets.length > 0,
    hasEnergyHistory: dailyRows.some((r) => Number(r.total_kwh || 0) > 0),
    selectBoard,
    toggleRoomCollapsed,
    getDevicesForBoard,
    turnAllDevicesOn,
    turnAllDevicesOff,
    boardControl,
    isPresetActive,
    applyPreset,
    deletePreset,
    addBoard,
    saveFullBoardEdit,
    deviceRoom,
    carouselRef,
    saveDeviceIndex,
  };
}
