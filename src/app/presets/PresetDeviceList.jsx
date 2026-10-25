'use client';

import { useMemo, useState } from 'react';
import { Cpu } from 'lucide-react';

function groupByBoard(devices) {
  return devices.reduce((groups, device) => {
    const boardName = device.boards?.name || 'Unknown Board';
    (groups[boardName] ||= []).push(device);
    return groups;
  }, {});
}

export default function PresetDeviceList({ devices, presetActions, onToggleDevice, onToggleAction }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return query ? devices.filter((device) => device.name.toLowerCase().includes(query) || (device.boards?.name || '').toLowerCase().includes(query)) : devices;
  }, [devices, search]);
  const groups = useMemo(() => groupByBoard(filtered), [filtered]);
  const allSelected = filtered.length > 0 && filtered.every((device) => presetActions[device.id]?.included);
  const toggleAll = () => filtered.forEach((device) => {
    if (Boolean(presetActions[device.id]?.included) !== !allSelected) onToggleDevice(device.id);
  });

  return (
    <div className="flex flex-col gap-2">
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search device or board…" className="w-full px-3 py-2 rounded-lg border-[1.5px] border-border bg-input text-text text-xs outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]" />
      <div className="overflow-hidden rounded-lg border border-border bg-input">
        <div className="max-h-[32vh] overflow-y-auto">
          {Object.keys(groups).length === 0 ? <p className="px-4 py-3 text-xs text-text-muted font-semibold">No devices found.</p> : Object.entries(groups).map(([boardName, boardDevices]) => (
            <div key={boardName}>
              <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border dark:bg-[#09090b] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest"><Cpu size={12} strokeWidth={2.5} aria-hidden="true" className="text-white dark:text-black" /><p className="text-white dark:text-black">{boardName}</p></div>
              <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-bold text-text-muted"><input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!filtered.length} className="accent-accent cursor-pointer" />Select all</label>
              {boardDevices.map((device) => <div key={device.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0 gap-3">
                <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"><input type="checkbox" className="accent-accent cursor-pointer shrink-0" checked={presetActions[device.id]?.included || false} onChange={() => onToggleDevice(device.id)} /><span className="text-xs font-bold text-text truncate">{device.name}</span></label>
                {presetActions[device.id]?.included && <button type="button" className={`shrink-0 min-h-[26px] min-w-[46px] inline-flex items-center justify-center rounded px-2.5 py-1 text-[10px] font-black cursor-pointer transition-all duration-200 ${presetActions[device.id]?.is_on ? 'bg-accent text-[var(--btn-text)] shadow-gold-glow' : 'border border-border bg-card text-text'}`} onClick={() => onToggleAction(device.id)}>{presetActions[device.id]?.is_on ? 'ON' : 'OFF'}</button>}
              </div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
