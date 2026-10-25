"use client";
import { useState } from "react";
import Toast from "@/components/Toast";
import Loader from "@/components/Loader";
import ConfirmModal from "@/components/ConfirmModal";
import VoiceControl from "@/components/VoiceControl";
import useAlarmManager from "./useAlarmManager";
import AlarmList from "./AlarmList";
import { AlarmModal, DeleteAllModal } from "./AlarmModals";

export default function AlarmsPage() {
  const manager = useAlarmManager();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    await manager.deleteAlarm(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
  };

  if (manager.loading) return <Loader message="Loading alarms..." />;

  return (
    <>
      <div className="dashboard-container animate-fade-up select-none">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Alarms</h2>
          <div className="flex gap-2">
            {manager.alarms.length > 0 && (
              <button
                className="inline-flex min-h-[30px] items-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-extrabold text-red-500"
                onClick={() => manager.setShowDeleteAllModal(true)}
              >
                Delete All
              </button>
            )}
            <button
              className="inline-flex min-h-[30px] items-center rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[var(--btn-text)]"
              onClick={() => manager.setShowModal(true)}
            >
              Add Alarm
            </button>
          </div>
        </div>
        <AlarmList
          alarms={manager.alarms}
          onAdd={() => manager.setShowModal(true)}
          onEdit={manager.openEditModal}
          onDelete={(id) =>
            setPendingDelete(manager.alarms.find((alarm) => alarm.id === id) || { id })
          }
          onVoice={manager.handleAlarmCardCommand}
        />
      </div>
      <AlarmModal manager={manager} />
      <DeleteAllModal
        alarms={manager.alarms}
        show={manager.showDeleteAllModal}
        onClose={() => manager.setShowDeleteAllModal(false)}
        onDelete={manager.deleteAllAlarms}
      />
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete this alarm?"
        description={`The alarm for ${pendingDelete?.devices?.name || "this device"} will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete Alarm"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
      <VoiceControl onToast={manager.setToast} />
      <Toast message={manager.toast} onClose={() => manager.setToast("")} />
    </>
  );
}
