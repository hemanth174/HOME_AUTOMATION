'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import { Edit, Trash2, LucidePower, LucidePowerOff, CalendarDays } from 'lucide-react';
import VoiceControl from '@/components/VoiceControl';
import CardVoiceButton from '@/components/CardVoiceButton';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatDays(daysArr) {
  if (!daysArr || daysArr.length === 0) return 'No days selected';
  if (daysArr.length === 7) return 'Every day';
  const isWeekday = [1,2,3,4,5].every(d => daysArr.includes(d)) && daysArr.length === 5;
  const isWeekend = [0,6].every(d => daysArr.includes(d)) && daysArr.length === 2;
  if (isWeekday) return 'Weekdays (Mon – Fri)';
  if (isWeekend) return 'Weekends (Sat & Sun)';
  return daysArr.map(d => DAY_NAMES[d]).join(', ');
}

/** Next upcoming date for a schedule given its days + time (local) */
function getNextOccurrence(daysArr, timeStr) {
  if (!daysArr || daysArr.length === 0) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(h, m, 0, 0);
    if (!daysArr.includes(candidate.getDay())) continue;
    if (candidate > now) return candidate;
  }
  return null;
}

function formatNextRun(daysArr, timeStr) {
  const next = getNextOccurrence(daysArr, timeStr);
  if (!next) return null;
  return next.toLocaleString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function validateTime(h24) {
  if (!h24) return { valid: false, error: 'Please select a time.' };
  const [hStr, mStr] = h24.split(':');
  const h = parseInt(hStr, 10), m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59)
    return { valid: false, error: 'Invalid time. Please pick a valid hour and minute.' };
  return { valid: true, error: '' };
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

// ─── 12-Hour Custom Time Picker ───────────────────────────────────────────────

/**
 * Renders three selects: Hour (1–12), Minute (00–59), AM/PM.
 * Calls onChange(h24string) where h24string is "HH:MM" (24h for internal use).
 */
function TimePicker12h({ value, onChange }) {
  // Parse the current 24h "HH:MM" value into 12h parts
  const [rawH, rawM] = value ? value.split(':').map(Number) : [8, 0];
  const ampm = rawH >= 12 ? 'PM' : 'AM';
  const h12 = rawH % 12 === 0 ? 12 : rawH % 12;
  const mm = String(rawM).padStart(2, '0');

  const emit = (newH12, newMm, newAmpm) => {
    let h24 = parseInt(newH12, 10) % 12;
    if (newAmpm === 'PM') h24 += 12;
    onChange(`${String(h24).padStart(2, '0')}:${String(newMm).padStart(2, '0')}`);
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="flex items-center gap-2">
      {/* Hour */}
      <select
        value={h12}
        onChange={e => emit(e.target.value, mm, ampm)}
        className="flex-1 px-3 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm font-bold outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)] cursor-pointer"
      >
        {hours.map(h => (
          <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
        ))}
      </select>
      <span className="text-text-muted font-extrabold text-lg select-none">:</span>
      {/* Minute */}
      <select
        value={rawM}
        onChange={e => emit(h12, e.target.value, ampm)}
        className="flex-1 px-3 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm font-bold outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)] cursor-pointer"
      >
        {minutes.map(m => (
          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
        ))}
      </select>
      {/* AM/PM */}
      <select
        value={ampm}
        onChange={e => emit(h12, mm, e.target.value)}
        className="px-3 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm font-extrabold outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)] cursor-pointer"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

// ─── Grouped device picker ────────────────────────────────────────────────────

function DevicePicker({ devices, selectedDevices, onSelect }) {
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
          Object.entries(groups).map(([boardName, devs]) => {
            const allSelected = devs.every(d => selectedDevices.includes(d.id));
            return (
            <div key={boardName}>
              <div 
                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-accent bg-black border-b border-border sticky top-0 cursor-pointer hover:bg-black/80 flex justify-between items-center transition-all select-none"
                onClick={() => onSelect(devs.map(d => d.id), !allSelected)}
                title={allSelected ? "Deselect All in Board" : "Select All in Board"}
              >
                <span>📋 {boardName}</span>
                <span className="text-[9px] opacity-70 hover:opacity-100">{allSelected ? 'Deselect All' : 'Select All'}</span>
              </div>
              {devs.map(d => {
                const isSelected = selectedDevices.includes(d.id);
                return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelect(d.id)}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold border-b border-border last:border-b-0 transition-all cursor-pointer ${
                    isSelected ? 'bg-accent text-[#0a0800]' : 'text-text hover:bg-accent-bg/50'
                  }`}
                >
                  {isSelected ? '✓ ' : '  '}{d.name}
                </button>
                );
              })}
            </div>
            );
          })
        )}
      </div>
      {selectedDevices.length > 0 && (
        <p className="text-[10px] font-bold text-accent/80">
          Selected: {selectedDevices.length} device{selectedDevices.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
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

  // Form state — scheduleTime stored as "HH:MM" (24h) internally
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleDays, setScheduleDays] = useState([]);
  const [scheduleAction, setScheduleAction] = useState(true);
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [timeError, setTimeError] = useState('');
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Speak utility using premium/male voices
  const speak = useCallback((textToSpeak) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    let voices = window.speechSynthesis.getVoices();
    const findBestVoice = () => {
      const englishVoices = voices.filter(v => v.lang.startsWith('en'));
      if (englishVoices.length === 0) return voices[0];
      const premiumVoice = englishVoices.find(v =>
        v.name.toLowerCase().includes('natural') ||
        v.name.toLowerCase().includes('online') ||
        v.name.toLowerCase().includes('google') ||
        v.name.toLowerCase().includes('premium')
      );
      if (premiumVoice) return premiumVoice;
      const enhancedVoice = englishVoices.find(v => v.name.toLowerCase().includes('enhanced'));
      if (enhancedVoice) return enhancedVoice;
      return englishVoices[0];
    };
    const selectedVoice = findBestVoice();
    if (selectedVoice) utterance.voice = selectedVoice;
    const voiceName = selectedVoice ? selectedVoice.name.toLowerCase() : '';
    const isMale = ['male', 'david', 'daniel', 'google uk english male'].some(k => voiceName.includes(k));
    if (isMale) {
      utterance.pitch = 0.9;
      utterance.rate = 0.95;
    } else {
      utterance.pitch = 0.75;
      utterance.rate = 0.90;
    }
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleScheduleCardCommand = async (schedule, transcript) => {
    const text = transcript.toLowerCase().trim();
    const devName = schedule.devices?.name || 'device';

    if (text.includes('delete') || text.includes('remove') || text.includes('trash') || text.includes('cancel')) {
      await deleteSchedule(schedule.id);
      speak(`Schedule for ${devName} deleted`);
    } else if (text.includes('disable') || text.includes('turn off') || text.includes('deactivate') || text.includes('deactive')) {
      if (schedule.enabled) {
        await toggleSchedule(schedule);
        speak(`Schedule for ${devName} disabled`);
      } else {
        setToast(`Schedule for ${devName} is already disabled`);
        speak(`Schedule for ${devName} is already disabled`);
      }
    } else if (text.includes('enable') || text.includes('turn on') || text.includes('activate')) {
      if (!schedule.enabled) {
        await toggleSchedule(schedule);
        speak(`Schedule for ${devName} enabled`);
      } else {
        setToast(`Schedule for ${devName} is already enabled`);
        speak(`Schedule for ${devName} is already enabled`);
      }
    } else {
      setToast(`Command not recognized: "${transcript}". Try "disable", "enable", or "delete".`);
      speak(`Command not recognized`);
    }
  };

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
      const [schedulesRes, devicesRes] = await Promise.all([
        supabase.from('schedules').select('id, time, enabled, days, action, device_id, devices(name, boards(name))').eq('user_id', user.id).order('time'),
        supabase.from('devices').select('id, name, boards(name, id)').eq('user_id', user.id).order('relay_index'),
      ]);
      if (!active) return;
      if (schedulesRes.data) setSchedules(schedulesRes.data);
      if (devicesRes.data) {
        setDevices(devicesRes.data);
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
      .channel('schedules-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `user_id=eq.${user.id}` },
        async () => {
          const { data } = await supabase.from('schedules').select('id, time, enabled, days, action, device_id, devices(name, boards(name))').eq('user_id', user.id).order('time');
          if (data) setSchedules(data);
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (isFirstConnect) {
            isFirstConnect = false;
          } else {
            console.log('Reconnected to Supabase Realtime. Resyncing schedules...');
            const { data } = await supabase.from('schedules').select('id, time, enabled, days, action, device_id, devices(name, boards(name))').eq('user_id', user.id).order('time');
            if (data) setSchedules(data);
          }
        }
      });

    return () => supabase.removeChannel(channel);
  }, [user]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const closeModal = () => {
    setShowModal(false);
    setScheduleDays([]);
    setScheduleTime('08:00');
    setScheduleAction(true);
    setTimeConfirmed(false);
    setTimeError('');
    setEditingSchedule(null);
    setSelectedDevices([]);
  };

  const openEditModal = (schedule) => {
    setEditingSchedule(schedule);
    setSelectedDevices([schedule.device_id]);
    setScheduleTime(schedule.time.substring(0, 5)); // "HH:MM:SS" -> "HH:MM"
    setScheduleDays(schedule.days);
    setScheduleAction(schedule.action);
    setTimeConfirmed(true);
    setTimeError('');
    setShowModal(true);
  };

  const handleTimeChange = (val) => {
    setScheduleTime(val);
    setTimeConfirmed(false);
    setTimeError(validateTime(val).error);
  };

  const handleConfirmTime = () => {
    const { valid, error } = validateTime(scheduleTime);
    if (!valid) { setTimeError(error); return; }
    setTimeError('');
    setTimeConfirmed(true);
  };

  const toggleDay = (day) => {
    setScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleDeviceSelection = (idOrIds, forceState) => {
    if (Array.isArray(idOrIds)) {
      if (forceState) {
        setSelectedDevices(prev => [...new Set([...prev, ...idOrIds])]);
      } else {
        setSelectedDevices(prev => prev.filter(d => !idOrIds.includes(d)));
      }
    } else {
      setSelectedDevices(prev => prev.includes(idOrIds) ? prev.filter(d => d !== idOrIds) : [...prev, idOrIds]);
    }
  };

  const addSchedule = async (e) => {
    e.preventDefault();
    if (selectedDevices.length === 0) { setToast('Please select at least one device'); return; }
    if (scheduleDays.length === 0) { setToast('Please select at least one day'); return; }
    if (!timeConfirmed) { setToast('Please press "Confirm" to confirm the time'); return; }
    const { valid, error } = validateTime(scheduleTime);
    if (!valid) { setTimeError(error); return; }

    const [newH, newM] = scheduleTime.split(':').map(Number);
    const sortedDays = [...scheduleDays].sort();

    // Check conflicts for each selected device
    for (const deviceId of selectedDevices) {
      const sameDayConflicts = schedules.filter(sc => {
        if (sc.device_id !== deviceId) return false;
        if (editingSchedule && sc.id === editingSchedule.id) return false; // ignore self
        const [scH, scM] = sc.time.split(':').map(Number);
        if (scH !== newH || scM !== newM) return false;
        return sortedDays.some(d => sc.days.includes(d));
      });
      if (sameDayConflicts.length > 0) {
        const dup = sameDayConflicts.find(sc => sc.action === scheduleAction);
        const contra = sameDayConflicts.find(sc => sc.action !== scheduleAction);
        const devName = devices.find(d => d.id === deviceId)?.name || 'A device';
        if (dup) {
          const overlap = sortedDays.filter(d => dup.days.includes(d)).map(d => DAY_NAMES[d]).join(', ');
          setToast(`Duplicate: ${devName} already has a schedule to Turn ${dup.action ? 'ON' : 'OFF'} at ${formatTime(scheduleTime)} on ${overlap}.`); return;
        }
        if (contra) {
          const overlap = sortedDays.filter(d => contra.days.includes(d)).map(d => DAY_NAMES[d]).join(', ');
          setToast(`Conflict: ${devName} already has a schedule to Turn ${contra.action ? 'ON' : 'OFF'} at ${formatTime(scheduleTime)} on ${overlap}. Delete it first.`); return;
        }
      }
    }

    // Cross-feature: schedule vs alarm
    for (const deviceId of selectedDevices) {
      const { data: alarmConflicts } = await supabase.from('alarms').select('id, trigger_at, action').eq('user_id', user.id).eq('device_id', deviceId).eq('fired', false);
      if (alarmConflicts) {
        for (const alarm of alarmConflicts) {
          const ad = new Date(alarm.trigger_at);
          if (!sortedDays.includes(ad.getDay())) continue;
          if (ad.getHours() !== newH || ad.getMinutes() !== newM) continue;
          const devName = devices.find(d => d.id === deviceId)?.name || 'A device';
          if (alarm.action !== scheduleAction) {
            setToast(`Cross-conflict: ${devName} has an alarm on ${DAY_NAMES[ad.getDay()]} at ${formatTime(scheduleTime)} that sets it to Turn ${alarm.action ? 'ON' : 'OFF'}.`); return;
          }
          setToast(`Duplicate: ${devName} already has an alarm at this exact time/day.`); return;
        }
      }
    }

    const rows = selectedDevices.map(deviceId => ({
      user_id: user.id,
      device_id: deviceId,
      action: scheduleAction,
      time: scheduleTime,
      days: sortedDays,
      enabled: true,
    }));

    if (editingSchedule) {
      if (selectedDevices.length === 1 && selectedDevices[0] === editingSchedule.device_id) {
         const { error: updateError } = await supabase.from('schedules').update(rows[0]).eq('id', editingSchedule.id);
         if (updateError) { setToast(updateError.message); return; }
      } else {
         await supabase.from('schedules').delete().eq('id', editingSchedule.id);
         const { error: insertError } = await supabase.from('schedules').insert(rows);
         if (insertError) { setToast(insertError.message); return; }
      }
      setToast('Schedule updated');
    } else {
      const { error: insertError } = await supabase.from('schedules').insert(rows);
      if (insertError) { setToast(insertError.message); return; }
      setToast(`Created ${rows.length} schedule${rows.length > 1 ? 's' : ''}`);
    }
    closeModal();
  };

  const toggleSchedule = async (schedule) => {
    await supabase.from('schedules').update({ enabled: !schedule.enabled }).eq('id', schedule.id);
  };

  const deleteSchedule = async (id) => {
    await supabase.from('schedules').delete().eq('id', id);
    setSchedules(prev => prev.filter(s => s.id !== id));
    setToast('Schedule deleted');
  };

  const deleteAllSchedules = async () => {
    await supabase.from('schedules').delete().eq('user_id', user.id);
    setSchedules([]);
    setShowDeleteAllModal(false);
    setToast('All schedules deleted');
  };

  if (loading) return <Loader message="Loading schedules..." />;

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] select-none">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Schedules</h2>
          <div className="flex gap-2">
            {schedules.length > 0 && (
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
              Add Schedule
            </button>
          </div>
        </div>

        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-border border-dashed bg-card p-10 text-center animate-scale-in max-w-lg mx-auto select-none gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow">
              <CalendarDays size={24} className="stroke-[2.5px]" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-extrabold text-text tracking-tight">No Schedules Created</h3>
              <p className="text-xs text-text-muted font-semibold leading-relaxed px-4">
                Schedules allow devices to automatically switch ON/OFF on specific days of the week at a set time.
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-accent px-5 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer mt-1"
            >
              Add Your First Schedule
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {schedules.map((schedule) => {
              const nextRun = formatNextRun(schedule.days, schedule.time);
              return (
                <div
                  key={schedule.id}
                  className={`relative overflow-hidden rounded-[18px] border border-border bg-card p-[18px] shadow-lg transition-all duration-200 hover:-translate-y-px hover:border-accent/40 hover:shadow-2xl ${!schedule.enabled ? 'opacity-55' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3  max-md:items-start w-full">
                    <div className="min-w-0 flex-1">
                      {/* Big time */}
                      <div className="text-2xl font-extrabold text-text tracking-tight">{formatTime(schedule.time)}</div>
                      {/* Device + Board */}
                      <div className="text-xs font-bold text-text-muted mt-0.5">
                        {schedule.devices?.boards?.name || 'Board'} → {schedule.devices?.name || 'Device'}
                      </div>
                      {/* Action */}
                      <div className="text-xs font-black text-accent mt-1">Turn {schedule.action ? 'ON' : 'OFF'}</div>
                      {/* Days */}
                      <div className="text-xs font-semibold text-text-muted mt-1">
                        🗓 {formatDays(schedule.days)}
                      </div>
                      {/* Repeat info */}
                      <div className="text-[10px] font-bold text-text-muted/60 mt-0.5 uppercase tracking-wide">
                        Repeats weekly · {schedule.days.length} day{schedule.days.length !== 1 ? 's' : ''}/week
                      </div>
                      {/* Next run */}
                      {schedule.enabled && nextRun && (
                        <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-bg text-accent text-[10px] font-extrabold">
                          ⏰ Next run: {nextRun}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 max-md:flex-col justify-end items-center max-md:mt-4">
                      <CardVoiceButton
                        onCommand={(tr) => handleScheduleCardCommand(schedule, tr)}
                        onToast={setToast}
                      />
                      <button
                        className={`inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 ${
                          schedule.enabled 
                            ? 'border-accent bg-accent text-[#0a0800] shadow-gold-glow'
                            : 'border-border bg-card text-text-muted hover:border-accent hover:text-accent hover:shadow-[0_0_12px_rgba(201,168,76,0.3)]'
                        }`}
                        onClick={() => toggleSchedule(schedule)}
                        title={schedule.enabled ? 'Disable Schedule' : 'Enable Schedule'}
                      >
                        {schedule.enabled ? <LucidePower size={16} strokeWidth={2.5} /> : <LucidePowerOff size={16} strokeWidth={2.5} />}
                      </button>
                      <button
                        className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-text-muted transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 hover:border-accent hover:text-accent hover:shadow-[0_0_12px_rgba(201,168,76,0.3)]"
                        onClick={() => openEditModal(schedule)}
                        title="Edit Schedule"
                      >
                        <Edit size={16} strokeWidth={2.5} />
                      </button>
                      <button
                        className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-500 transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 hover:bg-red-500 hover:text-white hover:shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                        onClick={() => deleteSchedule(schedule.id)}
                        title="Delete Schedule"
                      >
                        <Trash2 size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
              
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Schedule Modal ────────────────────────────────────────────────── */}
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
                {editingSchedule ? 'Edit Schedule' : 'New Schedule'}
              </h2>
              {editingSchedule && (
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md bg-accent-bg text-accent">
                  Editing
                </span>
              )}
            </div>
            <form onSubmit={addSchedule} className="flex flex-col gap-4">

              {/* Device — grouped by board with search */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Device</label>
                <DevicePicker devices={devices} selectedDevices={selectedDevices} onSelect={toggleDeviceSelection} />
              </div>

              {/* Time — custom 12h picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Time</label>
                <TimePicker12h value={scheduleTime} onChange={handleTimeChange} />
                {timeError && <p className="text-[11px] font-bold text-red-500">⚠ {timeError}</p>}
                {timeConfirmed && !timeError && (
                  <p className="text-[11px] font-bold text-green-500">✓ Time set to {formatTime(scheduleTime)}</p>
                )}
                {/* Confirm button */}
                <button
                  type="button"
                  onClick={handleConfirmTime}
                  className={`self-end px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer border ${
                    timeConfirmed
                      ? 'bg-green-500/20 border-green-500/40 text-green-500'
                      : 'bg-accent-bg border-accent/40 text-accent hover:bg-accent hover:text-[#0a0800]'
                  }`}
                >
                  {timeConfirmed ? '✓ Confirmed' : 'Confirm Time'}
                </button>
              </div>

              {/* Repeat Days */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Repeat Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAY_NAMES.map((name, idx) => (
                    <button
                      key={idx}
                      type="button"
                      title={DAY_FULL[idx]}
                      className={`grid h-[38px] w-[38px] place-items-center rounded-full border text-xs font-extrabold transition-all cursor-pointer hover:-translate-y-px ${
                        scheduleDays.includes(idx)
                          ? 'border-accent bg-accent text-[#100d06] shadow-gold-glow'
                          : 'border-border bg-input text-text-muted hover:border-accent hover:bg-accent-bg'
                      }`}
                      onClick={() => toggleDay(idx)}
                    >
                      {name[0]}
                    </button>
                  ))}
                </div>
                {scheduleDays.length > 0 && (
                  <p className="text-[11px] font-bold text-accent">{formatDays(scheduleDays)}</p>
                )}
              </div>

              {/* Action */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Action</label>
                <select
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  value={scheduleAction}
                  onChange={e => setScheduleAction(e.target.value === 'true')}
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
                  disabled={!!timeError || !timeConfirmed || scheduleDays.length === 0}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editingSchedule ? 'Save Changes' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete All Confirmation Modal ─────────────────────────────────────── */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowDeleteAllModal(false)}>
          <div className="bg-card border border-border rounded-[18px] p-6 w-[min(100%-40px,360px)] shadow-2xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-text">Delete All Schedules?</h3>
            <p className="text-xs text-text-muted font-semibold leading-relaxed">
              This will permanently delete all <strong className="text-text">{schedules.length}</strong> schedule{schedules.length !== 1 ? 's' : ''}. This action cannot be undone.
            </p>
            <div className="flex gap-2.5 justify-end">
              <button onClick={() => setShowDeleteAllModal(false)} className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-text hover:bg-card-alt cursor-pointer transition-all">
                Cancel
              </button>
              <button onClick={deleteAllSchedules} className="inline-flex min-h-[34px] items-center justify-center rounded-lg bg-red-500 px-4 text-xs font-extrabold text-white hover:bg-red-600 cursor-pointer transition-all">
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      <VoiceControl onToast={setToast} />
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
