import { AlarmClock, Edit, LucideTrash2 } from "lucide-react";
import CardVoiceButton from "@/components/CardVoiceButton";
import { formatAlarmDisplay } from "./alarmUtils";

export default function AlarmList({ alarms, onAdd, onEdit, onDelete, onVoice }) {
  if (!alarms.length) {
    return (
      <div className="flex max-w-lg mx-auto flex-col items-center justify-center gap-4 rounded-[24px] border border-border border-dashed bg-card p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-bg text-accent">
          <AlarmClock size={24} />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-text">No Alarms Set</h3>
          <p className="px-4 text-xs font-semibold leading-relaxed text-text-muted">
            Alarms trigger device actions at a specific one-time date and time in the future.
          </p>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex min-h-[36px] items-center rounded-xl bg-accent px-5 text-xs font-extrabold text-[var(--btn-text)]"
        >
          Set New Alarm
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {alarms.map((alarm) => {
        const past = new Date(alarm.trigger_at) < new Date();
        const muted = alarm.fired || past;
        const status = alarm.fired ? "Fired" : past ? "Expired" : "Upcoming";

        return (
          <div
            key={alarm.id}
            className={`relative overflow-hidden rounded-[18px] border border-border p-[18px] shadow-lg ${muted ? "bg-card-alt" : "bg-card"}`}
          >
            <div className={muted ? "opacity-55" : ""}>
              <div className="flex items-start justify-between gap-3 max-md:flex-col">
                <div>
                  <div className="text-base font-extrabold text-text">
                    {formatAlarmDisplay(alarm.trigger_at)}
                  </div>
                  <div className="mt-1 text-xs font-bold text-text-muted">
                    {alarm.devices?.boards?.name || "Board"} {"\u2192"} {alarm.devices?.name || "Device"}
                  </div>
                  <div className="mt-1 text-xs font-black text-accent">
                    Turn {alarm.action ? "ON" : "OFF"}
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-accent-bg px-2.5 py-0.5 text-xs font-extrabold uppercase text-accent">
                  {status}
                </span>
              </div>
            </div>

            <div className="mt-3.5 flex justify-end gap-2">
              <CardVoiceButton onCommand={(text) => onVoice(alarm, text)} />
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border p-0 leading-none text-text-muted transition-colors hover:border-accent hover:text-accent"
                onClick={() => onEdit(alarm)}
                title="Edit Alarm"
              >
                <Edit size={16} />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 p-0 leading-none text-red-500 transition-colors hover:bg-red-500 hover:text-white"
                onClick={() => onDelete(alarm.id)}
                title="Delete Alarm"
              >
                <LucideTrash2 size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
