"use client";
import { DAY_FULL, DAY_NAMES, formatDays, formatTime } from "./scheduleUtils";
import { DevicePicker, TimePicker12h } from "./SchedulePickers";

export default function ScheduleFormModal({ state }) {
  const {
    showModal,
    closeModal,
    editingSchedule,
    selectedDevices,
    scheduleDays,
    scheduleTime,
    scheduleAction,
    timeError,
    timeConfirmed,
    devices,
    toggleDeviceSelection,
    handleTimeChange,
    confirmTime,
    toggleDay,
    addSchedule,
    setScheduleAction,
  } = state;

  if (!showModal) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0"
      onClick={closeModal}
    >
      <div
        className="max-h-[88vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl animate-fade-up max-md:w-full max-md:max-h-[92vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:pb-10"
        onClick={(event) => event.stopPropagation()}
      >
        <div data-sheet-handle="1" className="hidden max-md:block w-12 h-1 cursor-grab touch-none bg-border rounded-full mx-auto -mt-1 mb-4 shrink-0 active:cursor-grabbing" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-text">
            {editingSchedule ? "Edit Schedule" : "New Schedule"}
          </h2>
          <div className="text-right">
            {selectedDevices.length > 0 && (
              <p className="text-[10px] font-bold text-accent/80">
                Selected: {selectedDevices.length} device
                {selectedDevices.length !== 1 ? "s" : ""}
              </p>
            )}
            {scheduleDays.length > 0 && (
              <p className="text-[11px] font-bold text-accent">
                <span className="rounded border p-0.5">
                  {formatDays(scheduleDays)}
                </span>
              </p>
            )}
          </div>
        </div>

        <form onSubmit={addSchedule} className="flex flex-col gap-4">
          <label className="text-xs font-extrabold tracking-wide text-text-muted">
            Device
          </label>
          <DevicePicker
            devices={devices}
            selectedDevices={selectedDevices}
            onSelect={toggleDeviceSelection}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">
              Time
            </label>
            <TimePicker12h value={scheduleTime} onChange={handleTimeChange} />
            {timeError && (
              <p className="text-[11px] font-bold text-red-500">
                Error: {timeError}
              </p>
            )}
            {timeConfirmed && !timeError && (
              <p className="text-[11px] font-bold text-green-500">
                Time set to {formatTime(scheduleTime)}
              </p>
            )}
            <button
              type="button"
              onClick={confirmTime}
              className="self-end rounded-lg border border-accent/40 bg-accent-bg px-4 py-1.5 text-xs font-extrabold text-accent cursor-pointer"
            >
              {timeConfirmed ? "Confirmed" : "Confirm Time"}
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">
              Repeat Days
            </label>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((name, idx) => (
                <button
                  key={name}
                  type="button"
                  title={DAY_FULL[idx]}
                  onClick={() => toggleDay(idx)}
                  className={`grid h-[38px] w-[38px] place-items-center rounded-full border text-xs font-extrabold cursor-pointer ${
                    scheduleDays.includes(idx)
                      ? "border-accent bg-accent text-(--btn-text)"
                      : "border-border bg-input text-text-muted"
                  }`}
                >
                  {name[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold tracking-wide text-text-muted">
              Action
            </label>
            <select
              value={scheduleAction}
              onChange={(event) =>
                setScheduleAction?.(event.target.value === "true")
              }
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-text"
            >
              <option value="true">Turn ON</option>
              <option value="false">Turn OFF</option>
            </select>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              data-sheet-close="1"
              onClick={closeModal}
              className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-4 text-xs font-semibold text-text cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(timeError) || !timeConfirmed || !scheduleDays.length}
              className="inline-flex min-h-[36px] items-center rounded-lg bg-accent px-5 text-xs font-extrabold text-(--btn-text) cursor-pointer disabled:opacity-40"
            >
              {editingSchedule ? "Save Changes" : "Create Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
