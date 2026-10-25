"use client";
import {
  CalendarDays,
  Edit,
  LucidePower,
  LucidePowerOff,
  Trash2,
} from "lucide-react";
import CardVoiceButton from "@/components/CardVoiceButton";
import { formatDays, formatNextRun, formatTime } from "./scheduleUtils";

export default function ScheduleList({ state, onCommand, onDelete }) {
  const {
    schedules,
    setShowModal,
    toggleSchedule,
    openEditModal,
    deleteSchedule,
  } = state;

  if (!schedules.length) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-border bg-card p-10 text-center">
        <CalendarDays size={28} className="text-accent" />
        <h3 className="text-base font-extrabold text-text">
          No Schedules Created
        </h3>
        <p className="text-xs font-semibold text-text-muted">
          Schedules allow devices to automatically switch ON/OFF on specific
          days of the week at a set time.
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-xl bg-accent px-5 py-2 text-xs font-extrabold text-(--btn-text) cursor-pointer"
        >
          Add Your First Schedule
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {schedules.map((schedule) => (
        <div
          key={schedule.id}
          className={`relative rounded-[18px] border border-border bg-card p-[18px] ${
            !schedule.enabled ? "opacity-55" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-extrabold text-text">
                {formatTime(schedule.time)}
              </div>
              <div className="text-xs font-bold text-text-muted">
                {schedule.devices?.boards?.name || "Board"} ·{" "}
                {schedule.devices?.name || "Device"}
              </div>
              <div className="mt-1 text-xs font-black text-accent">
                Turn {schedule.action ? "ON" : "OFF"}
              </div>
              <div className="mt-1 text-xs font-semibold text-text-muted">
                Days: {formatDays(schedule.days)}
              </div>
              {schedule.enabled &&
                formatNextRun(schedule.days, schedule.time) && (
                  <div className="mt-1.5 text-[10px] font-extrabold text-accent">
                    Next run: {formatNextRun(schedule.days, schedule.time)}
                  </div>
                )}
            </div>

            <div className="flex items-center gap-2">
              <CardVoiceButton
                onCommand={(text) => onCommand(schedule, text)}
              />
              <button
                onClick={() => toggleSchedule(schedule)}
                title="Toggle schedule"
                className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border text-text cursor-pointer"
              >
                {schedule.enabled ? (
                  <LucidePower size={16} />
                ) : (
                  <LucidePowerOff size={16} />
                )}
              </button>
              <button
                onClick={() => openEditModal(schedule)}
                title="Edit Schedule"
                className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border text-text cursor-pointer"
              >
                <Edit size={16} />
              </button>
              <button
                onClick={() =>
                  onDelete ? onDelete(schedule) : deleteSchedule(schedule.id)
                }
                title="Delete Schedule"
                className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-red-500 text-red-500 cursor-pointer"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
