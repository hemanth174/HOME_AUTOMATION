import { useMemo, useState } from "react";
import { Check, Cpu } from "lucide-react";
import { daysInMonth, groupByBoard, MONTH_NAMES } from "./alarmUtils";

export function DateTimePicker12h({ parts, onChange, error, confirmed }) {
  const { year, month, day, hour, minute, ampm } = parts;
  const currentYear = new Date().getFullYear();
  const maxDay = month && year && !isNaN(parseInt(year, 10)) && parseInt(year, 10) >= currentYear ? daysInMonth(parseInt(year, 10), parseInt(month, 10)) : 31;
  const border = error ? "border-red-500" : confirmed ? "border-green-500" : "border-border focus:border-accent";
  const select = `px-3 py-2.5 rounded-lg border-[1.5px] bg-input text-text text-sm font-bold outline-none transition-all focus:shadow-[0_0_0_3px_var(--accent-bg)] cursor-pointer ${border}`;
  const change = (key, value, resetDay = false) => onChange({ ...parts, [key]: value, ...(resetDay ? { day: "" } : {}) });
  return <div className="flex flex-col gap-3">
    <div><p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted mb-1.5">Date</p><div className="grid grid-cols-3 gap-2">
      <select value={day} onChange={(e) => change("day", e.target.value)} className={select}><option value="">Day</option>{Array.from({ length: maxDay }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{String(n).padStart(2, "0")}</option>)}</select>
      <select value={month} onChange={(e) => change("month", e.target.value, true)} className={select}><option value="">Month</option>{MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select>
      <select value={year} onChange={(e) => change("year", e.target.value, true)} className={select}><option value="">Year</option>{Array.from({ length: 10 }, (_, i) => currentYear + i).map((n) => <option key={n} value={n}>{n}</option>)}</select>
    </div></div>
    <div><p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted mb-1.5">Time</p><div className="flex items-center gap-2">
      <select value={hour} onChange={(e) => change("hour", e.target.value)} className={`flex-1 ${select}`}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{String(n).padStart(2, "0")}</option>)}</select><span className="text-text-muted font-extrabold text-lg">:</span>
      <select value={minute} onChange={(e) => change("minute", e.target.value)} className={`flex-1 ${select}`}>{Array.from({ length: 60 }, (_, i) => i).map((n) => <option key={n} value={n}>{String(n).padStart(2, "0")}</option>)}</select>
      <select value={ampm} onChange={(e) => change("ampm", e.target.value)} className={select}><option>AM</option><option>PM</option></select>
    </div></div>
  </div>;
}

export function DevicePicker({ devices, selectedDevice, onSelect }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => { const q = search.toLowerCase().trim(); return q ? devices.filter((d) => d.name.toLowerCase().includes(q) || (d.boards?.name || "").toLowerCase().includes(q)) : devices; }, [devices, search]);
  const groups = useMemo(() => groupByBoard(filtered), [filtered]);
  return (
    <div className="flex flex-col gap-2">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search device or board…"
        className="w-full rounded-lg border-[1.5px] border-border bg-input px-3 py-2 text-xs text-text outline-none transition-all focus:border-accent"
      />
      <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border bg-input">
        {Object.keys(groups).length === 0 ? (
          <p className="px-4 py-3 text-xs font-semibold text-text-muted">No devices found.</p>
        ) : (
          Object.entries(groups).map(([board, list]) => (
            <div key={board}>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-input px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-accent">
                <Cpu size={10} className="shrink-0" />
                <span className="min-w-0 truncate">{board}</span>
              </div>
              {list.map((device) => (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => onSelect(device.id)}
                  className={`flex w-full gap-2 border-b border-border px-4 py-2.5 text-left text-xs font-bold last:border-b-0 ${selectedDevice === device.id ? "bg-accent text-[var(--btn-text)]" : "text-text hover:bg-accent-bg/50"}`}
                >
                  {selectedDevice === device.id ? <Check size={15} /> : "  "}
                  {device.name}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
