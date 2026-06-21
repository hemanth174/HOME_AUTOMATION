'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import { Edit, LucideTrash2 } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysInMonth(year, month) {
  // month is 1-based
  return new Date(year, month, 0).getDate();
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Build ISO string from parts. Returns null if invalid.
 * month is 1-based.
 */
function buildISO(year, month, day, h12, minute, ampm) {
  const y = parseInt(year, 10);
  const mo = parseInt(month, 10);
  const d = parseInt(day, 10);
  const h = parseInt(h12, 10);
  const m = parseInt(minute, 10);

  if (isNaN(y) || isNaN(mo) || isNaN(d) || isNaN(h) || isNaN(m)) return null;
  let h24 = h % 12;
  if (ampm === 'PM') h24 += 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h24)}:${pad(m)}:00`;
}

/** Validate all parts; returns { valid, error } */
function validateParts(year, month, day, h12, minute, ampm) {
  const y = parseInt(year, 10);
  const mo = parseInt(month, 10);
  const d = parseInt(day, 10);
  const h = parseInt(h12, 10);
  const m = parseInt(minute, 10);

  if (!year || !/^\d{4}$/.test(String(year)))
    return { valid: false, error: 'Year must be a 4-digit number (e.g. 2026, 2027).' };
  if (y < new Date().getFullYear() || y > 2099)
    return { valid: false, error: `Year must be ${new Date().getFullYear()} or later (max 2099).` };
  if (mo < 1 || mo > 12)
    return { valid: false, error: 'Please select a valid month.' };
  const maxDay = daysInMonth(y, mo);
  if (d < 1 || d > maxDay)
    return { valid: false, error: `Day must be between 1 and ${maxDay} for ${MONTH_NAMES[mo - 1]} ${y}.` };
  if (h < 1 || h > 12)
    return { valid: false, error: 'Hour must be between 1 and 12.' };
  if (m < 0 || m > 59)
    return { valid: false, error: 'Minute must be between 0 and 59.' };

  const iso = buildISO(y, mo, d, h, m, ampm);
  if (!iso) return { valid: false, error: 'Could not construct a valid date/time.' };
  const dt = new Date(iso);
  if (dt.getTime() <= Date.now() + 60_000)
    return { valid: false, error: 'Alarm must be set at least 1 minute in the future.' };

  return { valid: true, error: '' };
}

function formatAlarmDisplay(isoStr) {
  return new Date(isoStr).toLocaleString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function groupByBoard(devices) {
  const map = {};
  for (const d of devices) {
    const bn = d.boards?.name || 'Unknown Board';
    if (!map[bn]) map[bn] = [];
    map[bn].push(d);
  }
  return map;
}

// ─── Custom 12h Date + Time Picker ────────────────────────────────────────────

function DateTimePicker12h({ parts, onChange, error, confirmed }) {
  const { year, month, day, hour, minute, ampm } = parts;
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear + i);

  // Compute max days for selected month/year
  const maxDay = (month && year && !isNaN(parseInt(year, 10)) && parseInt(year, 10) >= currentYear)
    ? daysInMonth(parseInt(year, 10), parseInt(month, 10))
    : 31;
  const dayOptions = Array.from({ length: maxDay }, (_, i) => i + 1);
  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  const borderCls = error
    ? 'border-red-500'
    : confirmed
      ? 'border-green-500'
      : 'border-border focus:border-accent';

  const selectCls = `px-3 py-2.5 rounded-lg border-[1.5px] bg-input text-text text-sm font-bold outline-none transition-all focus:shadow-[0_0_0_3px_var(--accent-bg)] cursor-pointer ${borderCls}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Date row: Day / Month / Year */}
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted mb-1.5">Date</p>
        <div className="grid grid-cols-3 gap-2">
          {/* Day */}
          <select
            value={day}
            onChange={e => onChange({ ...parts, day: e.target.value })}
            className={selectCls}
          >
            <option value="">Day</option>
            {dayOptions.map(d => (
              <option key={d} value={d}>{String(d).padStart(2, '0')}</option>
            ))}
          </select>
          {/* Month */}
          <select
            value={month}
            onChange={e => onChange({ ...parts, month: e.target.value, day: '' })}
            className={selectCls}
          >
            <option value="">Month</option>
            {MONTH_NAMES.map((mn, idx) => (
              <option key={idx + 1} value={idx + 1}>{mn}</option>
            ))}
          </select>
          {/* Year */}
          <select
            value={year}
            onChange={e => onChange({ ...parts, year: e.target.value, day: '' })}
            className={selectCls}
          >
            <option value="">Year</option>
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Time row: Hour : Minute AM/PM */}
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted mb-1.5">Time</p>
        <div className="flex items-center gap-2">
          {/* Hour */}
          <select
            value={hour}
            onChange={e => onChange({ ...parts, hour: e.target.value })}
            className={`flex-1 ${selectCls}`}
          >
            {hourOptions.map(h => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
            ))}
          </select>
          <span className="text-text-muted font-extrabold text-lg select-none">:</span>
          {/* Minute */}
          <select
            value={minute}
            onChange={e => onChange({ ...parts, minute: e.target.value })}
            className={`flex-1 ${selectCls}`}
          >
            {minuteOptions.map(m => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
          {/* AM/PM */}
          <select
            value={ampm}
            onChange={e => onChange({ ...parts, ampm: e.target.value })}
            className={selectCls}
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── Grouped device picker ─────────────────────────────────────────────────────

function DevicePicker({ devices, selectedDevice, onSelect }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return devices;
    return devices.filter(
      d => d.name.toLowerCase().includes(q) || (d.boards?.name || '').toLowerCase().includes(q)
    );
  }, [devices, search]);
  const groups = useMemo(() => groupByBoard(filtered), [filtered]);

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search device or board…"
        className="w-full px-3 py-2 rounded-lg border-[1.5px] border-border bg-input text-text text-xs outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
      />
      <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border bg-input">
        {Object.keys(groups).length === 0 ? (
          <p className="px-4 py-3 text-xs text-text-muted font-semibold">No devices found.</p>
        ) : (
          Object.entries(groups).map(([boardName, devs]) => (
            <div key={boardName}>
              <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-accent bg-black border-b border-border sticky top-0">
                📋 {boardName}
              </div>
              {devs.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelect(d.id)}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold border-b border-border last:border-b-0 transition-all cursor-pointer ${
                    selectedDevice === d.id
                      ? 'bg-accent text-[#0a0800]'
                      : 'text-text hover:bg-accent-bg/50'
                  }`}
                >
                  {selectedDevice === d.id ? '✓ ' : '  '}{d.name}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
      {selectedDevice && (
        <p className="text-[10px] font-bold text-accent/80">
          Selected: {devices.find(d => d.id === selectedDevice)?.boards?.name} → {devices.find(d => d.id === selectedDevice)?.name}
        </p>
      )}
    </div>
  );
}

// ─── Default picker parts ─────────────────────────────────────────────────────

function defaultParts() {
  const now = new Date(Date.now() + 5 * 60_000); // default: 5 min from now
  let h = now.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    day: String(now.getDate()),
    hour: String(h12),
    minute: String(now.getMinutes()),
    ampm,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AlarmsPage() {
  const [user, setUser] = useState(null);
  const [alarms, setAlarms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Modal drag-to-close
  const [modalDragY, setModalDragY] = useState(0);
  const [modalDragging, setModalDragging] = useState(false);
  const [modalStartY, setModalStartY] = useState(0);
  const handleModalTouchStart = (e) => { setModalStartY(e.touches[0].clientY); setModalDragging(true); };
  const handleModalTouchMove = (e) => {
    if (!modalDragging || e.currentTarget.scrollTop > 0) return;
    const delta = e.touches[0].clientY - modalStartY;
    if (delta > 0) setModalDragY(delta);
  };
  const handleModalTouchEnd = () => {
    setModalDragging(false);
    if (modalDragY > 80) closeModal();
    setModalDragY(0);
  };

  // Form state
  const [selectedDevice, setSelectedDevice] = useState('');
  const [pickerParts, setPickerParts] = useState(defaultParts());
  const [alarmAction, setAlarmAction] = useState(true);
  const [dateError, setDateError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      setUser(user);
    };
    init();
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let active = true;
    const fetchData = async () => {
      const startTime = Date.now();
      const [alarmsRes, devicesRes] = await Promise.all([
        supabase.from('alarms').select('id, trigger_at, action, fired, device_id, devices(name, boards(name))').eq('user_id', user.id).order('trigger_at'),
        supabase.from('devices').select('id, name, boards(name, id)').eq('user_id', user.id).order('relay_index'),
      ]);
      if (!active) return;
      if (alarmsRes.data) setAlarms(alarmsRes.data);
      if (devicesRes.data) {
        setDevices(devicesRes.data);
        if (devicesRes.data.length > 0) setSelectedDevice(devicesRes.data[0].id);
      }
      setTimeout(() => { if (active) setLoading(false); }, Math.max(0, 500 - (Date.now() - startTime)));
    };
    fetchData();
    return () => { active = false; };
  }, [user]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let isFirstConnect = true;

    const channel = supabase
      .channel('alarms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alarms', filter: `user_id=eq.${user.id}` },
        async () => {
          const { data } = await supabase.from('alarms').select('id, trigger_at, action, fired, device_id, devices(name, boards(name))').eq('user_id', user.id).order('trigger_at');
          if (data) setAlarms(data);
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (isFirstConnect) {
            isFirstConnect = false;
          } else {
            console.log('Reconnected to Supabase Realtime. Resyncing alarms...');
            const { data } = await supabase.from('alarms').select('id, trigger_at, action, fired, device_id, devices(name, boards(name))').eq('user_id', user.id).order('trigger_at');
            if (data) setAlarms(data);
          }
        }
      });

    return () => supabase.removeChannel(channel);
  }, [user]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const closeModal = () => {
    setShowModal(false);
    setPickerParts(defaultParts());
    setDateError('');
    setConfirmed(false);
    setAlarmAction(true);
    setEditingAlarm(null);
    if (devices.length > 0) setSelectedDevice(devices[0].id);
  };

  const openEditModal = (alarm) => {
    setEditingAlarm(alarm);
    setSelectedDevice(alarm.device_id);
    setAlarmAction(alarm.action);
    const dt = new Date(alarm.trigger_at);
    let h = dt.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    setPickerParts({
      year: String(dt.getFullYear()),
      month: String(dt.getMonth() + 1),
      day: String(dt.getDate()),
      hour: String(h12),
      minute: String(dt.getMinutes()),
      ampm,
    });
    setConfirmed(true);
    setDateError('');
    setShowModal(true);
  };

  const handlePartsChange = (newParts) => {
    setPickerParts(newParts);
    setConfirmed(false);
    // Live-validate whenever user changes anything
    const { year, month, day, hour, minute, ampm } = newParts;
    if (year && month && day) {
      const { error } = validateParts(year, month, day, hour, minute, ampm);
      setDateError(error);
    } else {
      setDateError('');
    }
  };

  const handleConfirmDateTime = () => {
    const { year, month, day, hour, minute, ampm } = pickerParts;
    const { valid, error } = validateParts(year, month, day, hour, minute, ampm);
    if (!valid) { setDateError(error); return; }
    setDateError('');
    setConfirmed(true);
  };

  const getISO = () => {
    const { year, month, day, hour, minute, ampm } = pickerParts;
    return buildISO(year, month, day, hour, minute, ampm);
  };

  const addAlarm = async (e) => {
    e.preventDefault();
    if (!selectedDevice) { setToast('Please select a device'); return; }
    if (!confirmed) { setToast('Please press "Confirm" to confirm the date & time'); return; }

    const { year, month, day, hour, minute, ampm } = pickerParts;
    const { valid, error } = validateParts(year, month, day, hour, minute, ampm);
    if (!valid) { setDateError(error); return; }

    const isoStr = getISO();
    if (!isoStr) { setToast('Invalid date/time'); return; }
    const triggerISO = new Date(isoStr).toISOString();

    // Duplicate / conflict check (alarm vs alarm)
    const conflicts = alarms.filter(a => {
      if (a.device_id !== selectedDevice) return false;
      const aT = new Date(a.trigger_at), nT = new Date(triggerISO);
      return aT.getFullYear() === nT.getFullYear() && aT.getMonth() === nT.getMonth() &&
        aT.getDate() === nT.getDate() && aT.getHours() === nT.getHours() && aT.getMinutes() === nT.getMinutes();
    });
    if (conflicts.length > 0) {
      const dup = conflicts.find(a => a.action === alarmAction);
      const contra = conflicts.find(a => a.action !== alarmAction);
      if (dup) { setToast('Duplicate: this device already has an identical alarm at this time.'); return; }
      if (contra) { setToast(`Conflict: an alarm already sets this device to Turn ${contra.action ? 'ON' : 'OFF'} at this time. Delete it first.`); return; }
    }

    // Cross-feature: alarm vs schedule
    const { data: scs } = await supabase.from('schedules').select('id, time, days, action').eq('user_id', user.id).eq('device_id', selectedDevice).eq('enabled', true);
    if (scs) {
      const aDate = new Date(triggerISO);
      for (const sc of scs) {
        if (!sc.days.includes(aDate.getDay())) continue;
        const [scH, scM] = sc.time.split(':').map(Number);
        if (scH === aDate.getHours() && scM === aDate.getMinutes()) {
          if (sc.action !== alarmAction) { setToast(`Cross-conflict: a schedule already sets this device to Turn ${sc.action ? 'ON' : 'OFF'} at this day/time.`); return; }
          setToast('Duplicate: a schedule already matches this device/time/action.'); return;
        }
      }
    }

    if (editingAlarm) {
      const { error: updateError } = await supabase.from('alarms').update({
        device_id: selectedDevice, action: alarmAction, trigger_at: triggerISO, fired: false
      }).eq('id', editingAlarm.id);
      if (updateError) { setToast(updateError.message); return; }
      setToast('Alarm updated');
    } else {
      const { error: insertError } = await supabase.from('alarms').insert({
        user_id: user.id, device_id: selectedDevice, action: alarmAction, trigger_at: triggerISO, fired: false
      });
      if (insertError) { setToast(insertError.message); return; }
      setToast('Alarm created');
    }
    closeModal();
  };

  const deleteAlarm = async (id) => {
    await supabase.from('alarms').delete().eq('id', id);
    setAlarms(prev => prev.filter(a => a.id !== id));
    setToast('Alarm deleted');
  };

  const deleteAllAlarms = async () => {
    await supabase.from('alarms').delete().eq('user_id', user.id);
    setAlarms([]);
    setShowDeleteAllModal(false);
    setToast('All alarms deleted');
  };

  const isPast = (isoStr) => new Date(isoStr) < new Date();

  // Build preview string from picker parts
  const previewISO = useMemo(() => getISO(), [pickerParts]);
  const previewDisplay = useMemo(() => {
    if (!previewISO) return null;
    try { return formatAlarmDisplay(previewISO); } catch { return null; }
  }, [previewISO]);

  if (loading) return <Loader message="Loading alarms..." />;

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] select-none">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Alarms</h2>
          <div className="flex gap-2">
            {alarms.length > 0 && (
              <button
                className="inline-flex min-h-[30px] items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-extrabold text-red-500 transition-all hover:bg-red-500 hover:text-white cursor-pointer"
                onClick={() => setShowDeleteAllModal(true)}
              >
                Delete All
              </button>
            )}
            <button
              className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[#0a0800] transition-all cursor-pointer hover:bg-accent-hover shadow-gold-glow"
              onClick={() => setShowModal(true)}
            >
              Add Alarm
            </button>
          </div>
        </div>

        {alarms.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-[18px] border border-dashed border-border bg-white/[0.03] px-5 py-10 text-center text-sm font-semibold text-text-muted animate-scale-in">
            No alarms yet. Tap Add to create one.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {alarms.map((alarm) => {
              const past = isPast(alarm.trigger_at);
              const status = alarm.fired ? 'Fired' : past ? 'Expired' : 'Upcoming';
              const statusCls = alarm.fired
                ? 'text-green-500 bg-green-500/10'
                : past ? 'text-text-muted bg-white/5'
                : 'text-accent bg-accent-bg';
              return (
                <div
                  key={alarm.id}
                  className={`relative overflow-hidden rounded-[18px] border border-border bg-card p-[18px] shadow-lg transition-all duration-200 hover:-translate-y-px hover:border-accent/40 hover:shadow-2xl ${alarm.fired || past ? 'opacity-55' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3 max-md:flex-col max-md:items-start w-full">
                    <div>
                      <div className="text-base font-extrabold text-text leading-tight">{formatAlarmDisplay(alarm.trigger_at)}</div>
                      <div className="text-xs font-bold text-text-muted mt-1">
                        {alarm.devices?.boards?.name || 'Board'} → {alarm.devices?.name || 'Device'}
                      </div>
                      <div className="text-xs font-black text-accent mt-1">
                        Turn {alarm.action ? 'ON' : 'OFF'}
                      </div>
                    </div>
                    <span className={`shrink-0 text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-md ${statusCls}`}>
                      {status}
                    </span>
                  </div>
                  <div className="mt-3.5 flex gap-2 justify-end">
                    <button
                      className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-1 text-xs font-extrabold text-text transition-all cursor-pointer hover:bg-card-alt"
                      onClick={() => openEditModal(alarm)}
                    >
                      <Edit />
                    </button>
                    <button
                      className="inline-flex min-h-[30px] items-center justify-center gap-2  px-4 py-1 text-xs font-extrabold text-red-500 transition-all cursor-pointer hover:bg-red-500 hover:text-white"
                      onClick={() => deleteAlarm(alarm.id)}
                    >
                      <LucideTrash2 />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Alarm Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0" onClick={closeModal}>
          <div
            onTouchStart={handleModalTouchStart}
            onTouchMove={handleModalTouchMove}
            onTouchEnd={handleModalTouchEnd}
            style={{ transform: `translateY(${modalDragY}px)`, transition: modalDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16,1,0.3,1)' }}
            className="max-h-[88vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl animate-fade-up max-md:w-full max-md:max-h-[92vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-10 max-md:animate-slide-up max-md:shadow-none flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="hidden max-md:block w-12 h-1 bg-border rounded-full mx-auto mb-5 shrink-0" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-text">
                {editingAlarm ? 'Edit Alarm' : 'New Alarm'}
              </h2>
              {editingAlarm && (
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md bg-accent-bg text-accent">
                  Editing
                </span>
              )}
            </div>
            <form onSubmit={addAlarm} className="flex flex-col gap-4">

              {/* Device — grouped by board with search */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Device</label>
                <DevicePicker devices={devices} selectedDevice={selectedDevice} onSelect={setSelectedDevice} />
              </div>

              {/* Date & Time — custom 12h picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">
                  Trigger Date & Time <span className="text-[10px] font-bold text-text-muted/60">(future only)</span>
                </label>

                <DateTimePicker12h
                  parts={pickerParts}
                  onChange={handlePartsChange}
                  error={dateError}
                  confirmed={confirmed}
                />

                {/* Live preview */}
                {previewDisplay && !dateError && (
                  <p className="text-[11px] font-bold text-text-muted/70 mt-0.5">
                    Preview: {previewDisplay}
                  </p>
                )}

                {dateError && <p className="text-[11px] font-bold text-red-500">⚠ {dateError}</p>}
                {confirmed && !dateError && previewDisplay && (
                  <p className="text-[11px] font-bold text-green-500">✓ {previewDisplay}</p>
                )}

                {/* Confirm button */}
                <button
                  type="button"
                  onClick={handleConfirmDateTime}
                  className={`self-end px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer border ${
                    confirmed
                      ? 'bg-green-500/20 border-green-500/40 text-green-500'
                      : 'bg-accent-bg border-accent/40 text-accent hover:bg-accent hover:text-[#0a0800]'
                  }`}
                >
                  {confirmed ? '✓ Confirmed' : 'Confirm Date & Time'}
                </button>

                <p className="text-[10px] text-text-muted/60">
                  Year must be 4-digit future year (e.g. 2026). Cannot set alarms in the past.
                </p>
              </div>

              {/* Action */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Action</label>
                <select
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  value={alarmAction}
                  onChange={e => setAlarmAction(e.target.value === 'true')}
                >
                  <option value="true">Turn ON</option>
                  <option value="false">Turn OFF</option>
                </select>
              </div>

              <div className="mt-4 flex justify-end gap-2.5">
                <button type="button" onClick={closeModal} className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!dateError || !confirmed}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editingAlarm ? 'Save Changes' : 'Create Alarm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete All Confirmation Modal ────────────────────────────────────── */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowDeleteAllModal(false)}>
          <div className="bg-card border border-border rounded-[18px] p-6 w-[min(100%-40px,360px)] shadow-2xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-text">Delete All Alarms?</h3>
            <p className="text-xs text-text-muted font-semibold leading-relaxed">
              This will permanently delete all <strong className="text-text">{alarms.length}</strong> alarm{alarms.length !== 1 ? 's' : ''}. This action cannot be undone.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button onClick={() => setShowDeleteAllModal(false)} className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-text hover:bg-card-alt cursor-pointer transition-all">
                Cancel
              </button>
              <button onClick={deleteAllAlarms} className="inline-flex min-h-[34px] items-center justify-center rounded-lg bg-red-500 px-4 text-xs font-extrabold text-white hover:bg-red-600 cursor-pointer transition-all">
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
