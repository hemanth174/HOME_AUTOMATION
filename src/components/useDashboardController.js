"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import useDashboardData from "@/hooks/useDashboardData";
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
    controlDevice: dispatchDevice,
    controlAll: dispatchAll,
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
    [dashboardViewSwitcherEnabled, setDashboardViewSwitcherEnabled] =
      useState(false),
    [pending, setPending] = useState({});
  const [collapseCookieReady, setCollapseCookieReady] = useState(null);
  const [todayLogs, setTodayLogs] = useState([]),
    [dailyRows, setDailyRows] = useState([]);
  const carouselRef = useRef(null);
  const commandTimesRef = useRef(new Map());
  const inFlightRef = useRef(new Set());
  const groupCommandAtRef = useRef(0);
  const viewCookie = user?.id && `vt_device_view_${user.id}`,
    roomCookie = user?.id && `vt_selected_room_${user.id}`,
    collapseCookie = user?.id && `vt_collapsed_rooms_${user.id}`;
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
    if (!user) return;
    let active = true;
    supabase
      .from("user_settings")
      .select("dashboard_view_switcher_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const enabled = data?.dashboard_view_switcher_enabled === true;
        setDashboardViewSwitcherEnabled(enabled);
        // When the switcher is off, the dashboard keeps its normal carousel
        // view instead of getting stuck on a previously saved "list" choice.
        if (!enabled) setDeviceView("carousel");
      });
    return () => {
      active = false;
    };
  }, [user]);
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
  useEffect(() => {
    if (!collapseCookie) return;
    let saved = [];
    try {
      const parsed = JSON.parse(readCookie(collapseCookie) || "[]");
      if (Array.isArray(parsed)) saved = parsed.filter((id) => typeof id === "string");
    } catch {}
    setExpandedBoards(Object.fromEntries(saved.map((id) => [id, false])));
    setCollapseCookieReady(collapseCookie);
  }, [collapseCookie, setExpandedBoards]);
  useEffect(() => {
    if (!collapseCookie || collapseCookieReady !== collapseCookie) return;
    const collapsedIds = Object.entries(expandedBoards || {})
      .filter(([, expanded]) => expanded === false)
      .map(([id]) => id);
    writeCookie(collapseCookie, JSON.stringify(collapsedIds));
  }, [collapseCookie, collapseCookieReady, expandedBoards]);
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
  const reserveCommand = useCallback((deviceIds, group = false) => {
    const ids = [...new Set(deviceIds.map(String))];
    const now = Date.now();
    const storageKey = (id) => `vikatech_control_cooldown_${user?.id || "guest"}_${id}`;
    const groupStorageKey = `vikatech_group_control_cooldown_${user?.id || "guest"}`;
    let lastGroupCommand = groupCommandAtRef.current;
    try { lastGroupCommand = Math.max(lastGroupCommand, Number(localStorage.getItem(groupStorageKey)) || 0); } catch {}
    if (group && now - lastGroupCommand < 2000) {
      throw new Error("Please wait a moment before another group command.");
    }
    if (ids.some((id) => {
      let previous = commandTimesRef.current.get(id) || 0;
      try { previous = Math.max(previous, Number(localStorage.getItem(storageKey(id))) || 0); } catch {}
      return inFlightRef.current.has(id) || now - previous < 1500;
    })) {
      throw new Error("Please wait for the current device command to finish.");
    }
    if (group) {
      groupCommandAtRef.current = now;
      try { localStorage.setItem(groupStorageKey, String(now)); } catch {}
    }
    ids.forEach((id) => {
      inFlightRef.current.add(id);
      commandTimesRef.current.set(id, now);
      try { localStorage.setItem(storageKey(id), String(now)); } catch {}
    });
    setPending((current) => {
      const next = { ...current };
      ids.forEach((id) => { next[id] = true; });
      return next;
    });
    return { ids, startedAt: now };
  }, [user?.id]);
  const releaseCommand = useCallback(async ({ ids, startedAt }) => {
    const remaining = 450 - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    ids.forEach((id) => inFlightRef.current.delete(id));
    setPending((current) => {
      const next = { ...current };
      ids.forEach((id) => { delete next[id]; });
      return next;
    });
  }, []);
  const controlDevice = useCallback(async (device, desired, source) => {
    const reservation = reserveCommand([device.id]);
    try {
      const result = await dispatchDevice(device, desired, source);
      if (!result.success) throw new Error(`Could not reach ${device.name}. Please retry.`);
      return result;
    } finally {
      await releaseCommand(reservation);
    }
  }, [dispatchDevice, reserveCommand, releaseCommand]);
  const controlAll = useCallback(async (action, source) => {
    const reservation = reserveCommand(devices.map((device) => device.id), true);
    try {
      const result = await dispatchAll(action, source);
      if (!result.success) throw new Error("Could not reach the devices. Please retry.");
      return result;
    } finally {
      await releaseCommand(reservation);
    }
  }, [devices, dispatchAll, reserveCommand, releaseCommand]);
  const toggleDevice = useCallback(
    async (device) => {
      if (!device) return;
      try {
        await controlDevice(device, !device.is_on, "Manual Dashboard Switch");
      } catch (error) {
        showToast(error?.message || "Device update failed. Please retry.");
      }
    },
    [controlDevice, showToast],
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
      if (!Array.isArray(actions) || !actions.length) {
        showToast(`Preset ${preset.name} has no saved device actions.`);
        return { success: false, succeeded: 0 };
      }
      const targets = actions.map((action) => ({
        action,
        device: devices.find((device) => String(device.id) === String(action.device_id)),
      })).filter(({ device }) => device);
      if (!targets.length) {
        showToast(`Preset ${preset.name} has no available devices.`);
        return { success: false, succeeded: 0 };
      }
      let reservation;
      let succeeded = 0;
      try {
        reservation = reserveCommand(targets.map(({ device }) => device.id), true);
        for (const { action, device } of targets) {
          const result = await dispatchDevice(
            device,
            deactivate ? !action.is_on : action.is_on,
            `Preset: ${preset.name}`,
          );
          if (!result.success) throw new Error(`Could not reach ${device.name}. Please retry.`);
          succeeded += 1;
        }
        showToast(`${deactivate ? "Deactivated" : "Activated"}: ${preset.name}`);
        return { success: true, succeeded };
      } catch (error) {
        showToast(error?.message || `Could not apply ${preset.name}.`);
        return { success: false, succeeded };
      } finally {
        if (reservation) await releaseCommand(reservation);
      }
    },
    [devices, dispatchDevice, reserveCommand, releaseCommand, showToast],
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
  const turnAllDevicesOn = useCallback(async () => {
    if (!devices.length) return showToast("No devices available to turn ON. Please add a board first.");
    try {
      await controlAll("on", "Global Dashboard");
      showToast("All devices turned ON");
    } catch (error) { showToast(error.message); }
  }, [devices, controlAll, showToast]);
  const turnAllDevicesOff = useCallback(async () => {
    if (!devices.length) return showToast("No devices available to turn OFF. Please add a board first.");
    try {
      await controlAll("off", "Global Dashboard");
      showToast("All devices turned OFF");
    } catch (error) { showToast(error.message); }
  }, [devices, controlAll, showToast]);
  const boardControl = useCallback(
    async (id, name, on) => {
      const list = getDevicesForBoard(id);
      if (!list.length) return showToast(`No devices found on ${name}`);
      let reservation;
      try {
        reservation = reserveCommand(list.map((device) => device.id), true);
        const results = await Promise.all(list.map((device) =>
          dispatchDevice(device, on, `Board All ${on ? "ON" : "OFF"}: ${name}`),
        ));
        if (results.some((result) => !result.success)) throw new Error(`Could not reach every device on ${name}.`);
        showToast(`All devices on ${name} turned ${on ? "ON" : "OFF"}`);
      } catch (error) {
        showToast(error?.message || `Could not control ${name}.`);
      } finally {
        if (reservation) await releaseCommand(reservation);
      }
    },
    [getDevicesForBoard, dispatchDevice, reserveCommand, releaseCommand, showToast],
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
    if (deviceView !== "carousel" || !selectedRoomExpanded || loading)
      return undefined;
    const carousel = carouselRef.current;
    if (!carousel) return undefined;
    const frame = requestAnimationFrame(() => {
      carousel.scrollLeft = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [
    deviceView,
    loading,
    selectedBoard?.id,
    selectedDevices.length,
    selectedRoomExpanded,
  ]);
  const activeCount = devices.filter((d) => d.is_on).length,
    onlineBoards = boards.filter((board) => isBoardOnline(board));
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
    if (onlineBoards.length === 0) {
      return [
        { text: "No room controllers online", tone: "error" },
        { text: " — live device state is unavailable." },
      ];
    }
    const deviceLabel = devices.length === 1 ? "device" : "devices";
    const roomLabel = boards.length === 1 ? "room" : "rooms";
    return [
      { text: String(activeCount), tone: "accent" },
      { text: " of " },
      { text: String(devices.length), tone: "accent" },
      { text: ` ${deviceLabel} set to on \u2192 ` },
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
    dashboardViewSwitcherEnabled,
    pending,
    controlDevice,
    controlAll,
    toggleDevice,
    todayLogs,
    dailyRows,
    activeCount,
    onlineBoards,
    statusMessage,
    systemOk:
      (isClientOnline || isLocalConnected) &&
      boards.length > 0 &&
      onlineBoards.length === boards.length,
    systemMessage:
      onlineBoards.length === boards.length && boards.length > 0
        ? "Recent board heartbeat"
        : `${boards.length - onlineBoards.length} of ${boards.length} rooms offline`,
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
  };
}
