"use client";
import { useMemo, useState } from "react";
import { Check, Cpu } from "lucide-react";
import { groupByBoard } from "./scheduleUtils";

export function TimePicker12h({ value, onChange }) {
  const [rawH, rawM] = value ? value.split(":").map(Number) : [8, 0];
  const ampm = rawH >= 12 ? "PM" : "AM";
  const h12 = rawH % 12 || 12;
  const mm = String(rawM).padStart(2, "0");
  const emit = (hour, minute, period) => {
    let h24 = parseInt(hour, 10) % 12;
    if (period === "PM") h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  };
  const selectClass =
    "flex-1 px-3 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm font-bold outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)] cursor-pointer";

  return (
    <div className="flex items-center gap-2">
      <select
        value={h12}
        onChange={(event) => emit(event.target.value, mm, ampm)}
        className={selectClass}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
          <option key={hour}>{String(hour).padStart(2, "0")}</option>
        ))}
      </select>
      <span className="select-none text-lg font-extrabold text-text-muted">:</span>
      <select
        value={rawM}
        onChange={(event) => emit(h12, event.target.value, ampm)}
        className={selectClass}
      >
        {Array.from({ length: 60 }, (_, minute) => (
          <option key={minute} value={minute}>
            {String(minute).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        value={ampm}
        onChange={(event) => emit(h12, mm, event.target.value)}
        className="cursor-pointer rounded-lg border-[1.5px] border-border bg-input px-3 py-2.5 text-sm font-extrabold text-text outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
      >
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  );
}

export function DevicePicker({ devices, selectedDevices, onSelect }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return query
      ? devices.filter(
          (device) =>
            device.name.toLowerCase().includes(query) ||
            (device.boards?.name || "").toLowerCase().includes(query),
        )
      : devices;
  }, [devices, search]);
  const groups = useMemo(() => groupByBoard(filtered), [filtered]);

  return (
    <div className="flex flex-col gap-2">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search device or board..."
        className="w-full rounded-lg border-[1.5px] border-border bg-input px-3 py-2 text-xs text-text outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
      />
      <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border bg-input">
        {Object.keys(groups).length === 0 ? (
          <p className="px-4 py-3 text-xs font-semibold text-text-muted">
            No devices found.
          </p>
        ) : (
          Object.entries(groups).map(([board, boardDevices]) => {
            const all = boardDevices.every((device) =>
              selectedDevices.includes(device.id),
            );
            return (
              <div key={board}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-input px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-text dark:bg-[#09090b]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Cpu size={12} aria-hidden="true" />
                    <span className="truncate">{board}</span>
                  </span>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[9px] tracking-normal text-text-muted">
                    <input
                      type="checkbox"
                      checked={all}
                      onChange={() =>
                        onSelect(boardDevices.map((device) => device.id), !all)
                      }
                      className="accent-[var(--accent)]"
                    />
                    All
                  </label>
                </div>
                {boardDevices.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => onSelect(device.id)}
                    className="flex w-full cursor-pointer gap-3 border-b border-border px-4 py-2.5 text-left text-xs font-bold text-text transition-all last:border-b-0 hover:bg-accent-bg"
                  >
                    <span className="inline-flex min-w-4 items-center">
                      {selectedDevices.includes(device.id) && (
                        <Check size={13} strokeWidth={3} />
                      )}
                    </span>
                    {device.name}
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
