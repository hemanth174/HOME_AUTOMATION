"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import VoiceControl from "@/components/VoiceControl";
import Toast from "@/components/Toast";
import Loader from "@/components/Loader";
import BoardCard from "@/components/BoardCard";
import AddBoardModal from "@/components/AddBoardModal";
import EditBoardModal from "@/components/EditBoardModal";
import QuickPresets from "@/components/QuickPresets";
import useDashboardData from "@/hooks/useDashboardData";
import { Cpu, Plus, Power, PowerOff, ShieldCheck } from "lucide-react";
import { isAdminEmail } from "@/lib/admin";

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
    isLocalConnected,
  } = useDashboardData();

  const [toast, setToast] = useState("");
  const [showAddBoardModal, setShowAddBoardModal] = useState(false);
  const [boardIdentifier, setBoardIdentifier] = useState("");
  const [boardName, setBoardName] = useState("");

  // Edit Board Modal State
  const [showEditBoardModal, setShowEditBoardModal] = useState(false);
  const [editingBoardObj, setEditingBoardObj] = useState(null);

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

  const toggleBoard = useCallback((boardId) => {
    setExpandedBoards((prev) => ({ ...prev, [boardId]: !prev[boardId] }));
  }, []);

  const toggleDevice = useCallback(
    async (device) => {
      if (!device) return;
      await controlDevice(device, !device.is_on, "Manual Dashboard Switch");
    },
    [controlDevice],
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
        } catch (e) {
          actions = [];
        }
      }
      for (const action of actions || []) {
        const targetState = deactivate ? !action.is_on : action.is_on;
        const device = devices.find((d) => d.id === action.device_id);
        if (device) {
          await controlDevice(device, targetState, `Preset: ${preset.name}`);
        }
      }
      showToast(`${deactivate ? "Deactivated" : "Activated"}: ${preset.name}`);
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

  const getFeedbackStatus = useCallback((device) => {
    if (device.feedback_on === null || device.feedback_on === undefined) {
      return {
        text: device.is_on ? "ON" : "OFF",
        className: device.is_on ? "match" : "",
        manualOn: false,
      };
    }

    if (device.feedback_on === true) {
      return { text: "Manual ON", className: "manual", manualOn: true };
    }

    return {
      text: device.is_on ? "ON" : "OFF",
      className: device.is_on ? "match" : "",
      manualOn: false,
    };
  }, []);

  if (loading) {
    return <Loader message="Loading VikaTech Dashboard..." />;
  }

  return (
    <>
      <div className="dashboard-container animate-fade-up">
        <QuickPresets
          presets={presets}
          isPresetActive={isPresetActive}
          applyPreset={applyPreset}
          deletePreset={deletePreset}
        />

        <div className="flex min-[480px]:flex-row justify-between min-[480px]:items-center gap-3 mb-5 ml-1 select-none boards-section-selector">
          <h2 className="text-lg font-extrabold text-text tracking-tight whitespace-nowrap">
            Boards & Devices
          </h2>
          <div className="flex items-center gap-2  max-[480px]:justify-">
            <div className="flex gap-2 min-[481px]:gap-3">
              <button
                onClick={turnAllDevicesOn}
                aria-label="Turn all devices on"
                title="Turn all devices on"
                className="inline-flex min-h-[32px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-1 text-xs font-extrabold text-text transition-all duration-250 cursor-pointer hover:bg-card-alt hover:border-accent/40 whitespace-nowrap max-[480px]:w-9 max-[480px]:px-0"
              >
                <Power size={14} aria-hidden="true" />
                <span className="max-[480px]:hidden">All On</span>
              </button>
              <button
                onClick={turnAllDevicesOff}
                aria-label="Turn all devices off"
                title="Turn all devices off"
                className="inline-flex min-h-[32px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-1 text-xs font-extrabold text-text transition-all duration-250 cursor-pointer hover:bg-card-alt hover:border-accent/40 whitespace-nowrap max-[480px]:w-9 max-[480px]:px-0"
              >
                <PowerOff size={14} aria-hidden="true" />
                <span className="max-[480px]:hidden">All Off</span>
              </button>
            </div>
           <div className="flex gap-3">
             {isAdminEmail(user?.email) && (
              <Link
                href="/admin"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open VikaTech admin console"
                title="Open VikaTech admin console"
                className="inline-flex min-h-[32px] items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-bg px-3.5 py-1 text-xs font-extrabold text-accent transition-all hover:border-accent whitespace-nowrap max-[480px]:w-9 max-[480px]:px-0"
              >
                <ShieldCheck size={14} aria-hidden="true" />
                <span className="max-[480px]:hidden">Admin</span>
              </Link>
            )}
            <button
              onClick={() => setShowAddBoardModal(true)}
              aria-label="Add a board"
              title="Add a board"
              className="inline-flex min-h-[32px] items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-1 text-xs font-extrabold text-[var(--btn-text)] transition-all duration-250 cursor-pointer hover:bg-accent-hover shadow-gold-glow whitespace-nowrap max-[480px]:w-9 max-[480px]:px-0"
            >
              <Plus size={14} aria-hidden="true" />
              <span className="max-[480px]:hidden">Add Board</span>
            </button>
           </div>
          </div>
        </div>

        {boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-border border-dashed bg-card p-10 text-center animate-scale-in max-w-lg mx-auto select-none gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow">
              <Cpu size={24} className="stroke-[2.5px]" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-extrabold text-text tracking-tight">
                No Boards Registered Yet
              </h3>
              <p className="text-xs text-text-muted font-semibold leading-relaxed px-4">
                To start controlling your appliances, add your first ESP32
                Board. You will be able to configure up to 4 relay switches per
                board.
              </p>
            </div>
            <button
              onClick={() => setShowAddBoardModal(true)}
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-accent px-5 text-xs font-extrabold text-[var(--btn-text)] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer mt-1"
            >
              Add Your First Board
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                boardDevices={getDevicesForBoard(board.id)}
                expandedBoards={expandedBoards}
                toggleBoard={toggleBoard}
                turnBoardDevicesOn={turnBoardDevicesOn}
                turnBoardDevicesOff={turnBoardDevicesOff}
                getFeedbackStatus={getFeedbackStatus}
                toggleDevice={toggleDevice}
                openFullEditBoard={openFullEditBoard}
              />
            ))}
          </div>
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
        onToast={showToast}
      />
      <Toast message={toast} onClose={() => setToast("")} />
    </>
  );
}
