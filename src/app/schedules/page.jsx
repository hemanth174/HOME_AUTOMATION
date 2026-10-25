"use client";
import { useState } from "react";
import Loader from "@/components/Loader";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import VoiceControl from "@/components/VoiceControl";
import { speak } from "@/utils/voice";
import useSchedules from "./useSchedules";
import ScheduleList from "./ScheduleList";
import ScheduleFormModal from "./ScheduleFormModal";

export default function SchedulesPage() {
  const state = useSchedules();
  const {
    loading,
    schedules,
    toast,
    setToast,
    showDeleteAllModal,
    setShowDeleteAllModal,
    deleteAllSchedules,
    deleteSchedule,
    toggleSchedule,
  } = state;
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleCommand = async (schedule, transcript) => {
    const text = transcript.toLowerCase().trim();
    const name = schedule.devices?.name || "device";
    if (["delete", "remove", "trash", "cancel"].some((word) => text.includes(word))) {
      if (await deleteSchedule(schedule.id)) speak(`Schedule for ${name} deleted`);
      return;
    }
    if (["disable", "turn off", "deactivate", "deactive"].some((word) => text.includes(word))) {
      if (schedule.enabled) {
        if (await toggleSchedule(schedule)) speak(`Schedule for ${name} disabled`);
      } else {
        setToast(`Schedule for ${name} is already disabled`);
        speak(`Schedule for ${name} is already disabled`);
      }
      return;
    }
    if (["enable", "turn on", "activate"].some((word) => text.includes(word))) {
      if (!schedule.enabled) {
        if (await toggleSchedule(schedule)) speak(`Schedule for ${name} enabled`);
      } else {
        setToast(`Schedule for ${name} is already enabled`);
        speak(`Schedule for ${name} is already enabled`);
      }
      return;
    }
    setToast(`Command not recognized: "${transcript}". Try "disable", "enable", or "delete".`);
    speak("Command not recognized");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    await deleteSchedule(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
  };

  if (loading) return <Loader message="Loading schedules..." />;

  return (
    <>
      <div className="dashboard-container animate-fade-up select-none">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-text">Schedules</h2>
          <div className="flex shrink-0 gap-2">
            {schedules.length > 0 && (
              <button
                onClick={() => setShowDeleteAllModal(true)}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-extrabold text-red-500 cursor-pointer"
              >
                Delete All
              </button>
            )}
            <button
              onClick={() => state.setShowModal(true)}
              className="whitespace-nowrap rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-(--btn-text) cursor-pointer"
            >
              Add Schedule
            </button>
          </div>
        </div>
        <ScheduleList state={state} onCommand={handleCommand} onDelete={setPendingDelete} />
      </div>

      <ScheduleFormModal state={state} />

      {showDeleteAllModal && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 max-md:items-end max-md:p-0"
          onClick={() => setShowDeleteAllModal(false)}
        >
          <div
            className="bg-card border border-border rounded-[18px] p-6 w-[min(100%-40px,360px)] max-md:w-full max-md:rounded-b-none max-md:rounded-t-[24px] max-md:pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div data-sheet-handle="1" className="hidden max-md:block w-12 h-1 cursor-grab touch-none bg-border rounded-full mx-auto -mt-1 mb-3 shrink-0 active:cursor-grabbing" />
            <h3 className="text-base font-extrabold text-text">Delete All Schedules?</h3>
            <p className="text-xs text-text-muted my-4">
              This will permanently delete all <strong>{schedules.length}</strong> schedules. This
              action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                data-sheet-close="1"
                onClick={() => setShowDeleteAllModal(false)}
                className="px-4 py-2 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={deleteAllSchedules}
                className="rounded-lg bg-red-500 px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete this schedule?"
        description={`The schedule for ${pendingDelete?.devices?.name || "this device"} will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete Schedule"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <VoiceControl onToast={setToast} />
      <Toast message={toast} onClose={() => setToast("")} />
    </>
  );
}
