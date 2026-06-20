'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulesPage() {
  const [user, setUser] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Form state
  const [selectedDevice, setSelectedDevice] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleDays, setScheduleDays] = useState([]);
  const [scheduleAction, setScheduleAction] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      setUser(user);
    };
    init();
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const fetchData = async () => {
      const startTime = Date.now();
      const [schedulesRes, devicesRes] = await Promise.all([
        supabase.from('schedules').select('id, time, enabled, days, action, device_id, devices(name, boards(name))').eq('user_id', user.id).order('time'),
        supabase.from('devices').select('id, name, boards(name)').eq('user_id', user.id).order('relay_index'),
      ]);

      if (!active) return;

      if (schedulesRes.data) setSchedules(schedulesRes.data);
      if (devicesRes.data) {
        setDevices(devicesRes.data);
        if (devicesRes.data.length > 0) setSelectedDevice(devicesRes.data[0].id);
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 2000 - elapsed);
      setTimeout(() => {
        if (active) setLoading(false);
      }, remaining);
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('schedules-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `user_id=eq.${user.id}` },
        async () => {
          const { data } = await supabase.from('schedules').select('id, time, enabled, days, action, device_id, devices(name, boards(name))').eq('user_id', user.id).order('time');
          if (data) setSchedules(data);
        }
      ).subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  const toggleDay = (day) => {
    setScheduleDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const addSchedule = async (e) => {
    e.preventDefault();
    if (!selectedDevice || scheduleDays.length === 0) {
      setToast('Please select a device and at least one day');
      return;
    }
    const { error } = await supabase.from('schedules').insert({
      user_id: user.id,
      device_id: selectedDevice,
      action: scheduleAction,
      time: scheduleTime,
      days: scheduleDays.sort(),
      enabled: true,
    });
    if (error) { setToast(error.message); return; }
    setShowModal(false);
    setScheduleDays([]);
    setToast('Schedule created');
  };

  const toggleSchedule = async (schedule) => {
    await supabase.from('schedules').update({ enabled: !schedule.enabled }).eq('id', schedule.id);
  };

  const deleteSchedule = async (id) => {
    await supabase.from('schedules').delete().eq('id', id);
    setSchedules(prev => prev.filter(s => s.id !== id));
    setToast('Schedule deleted');
  };

  const formatTime = (timeStr) => {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  };

  if (loading) {
    return <Loader message="Loading schedules..." />;
  }

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] select-none">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Schedules</h2>
          <button
            className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover active:translate-y-0 shadow-gold-glow"
            onClick={() => setShowModal(true)}
          >
            Add Schedule
          </button>
        </div>

        {schedules.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-[18px] border border-dashed border-border bg-white/[0.03] px-5 py-10 text-center text-sm font-semibold text-text-muted animate-scale-in">
            No schedules yet. Tap Add to create one.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className={`relative overflow-hidden rounded-[18px] border border-border bg-card p-[18px] shadow-lg transition-all duration-200 hover:-translate-y-px hover:border-accent/40 hover:shadow-2xl ${
                  !schedule.enabled ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3 max-md:flex-col max-md:items-start w-full">
                  <div>
                    <div className="text-2xl font-extrabold text-text">{formatTime(schedule.time)}</div>
                    <div className="text-xs font-bold text-text-muted">
                      {schedule.devices?.name || 'Device'} — {schedule.devices?.boards?.name || 'Board'}
                    </div>
                  </div>
                  <div
                    className={`relative h-[24px] w-11 shrink-0 rounded-full border border-border bg-toggle-track transition-all duration-250 cursor-pointer ${
                      schedule.enabled ? 'border-transparent bg-toggle-on shadow-[0_0_14px_var(--accent-glow)]' : ''
                    }`}
                    onClick={() => toggleSchedule(schedule)}
                  >
                    <div
                      className={`absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-transform duration-250 ease-out ${
                        schedule.enabled ? 'translate-x-[20px]' : ''
                      }`}
                    />
                  </div>
                </div>
                <div className="text-xs font-bold text-text-muted mt-2">
                  {schedule.days.map(d => DAY_NAMES[d]).join(', ')} — Turn {schedule.action ? 'ON' : 'OFF'}
                </div>
                <div className="mt-3.5 flex gap-2 justify-end">
                  <button
                    className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-1 text-xs font-extrabold text-red-500 transition-all duration-250 cursor-pointer hover:bg-red-500 hover:text-white active:translate-y-0"
                    onClick={() => deleteSchedule(schedule.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in" onClick={() => setShowModal(false)}>
          <div className="max-h-[82vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl backdrop-blur-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-[18px] text-lg font-extrabold text-text">New Schedule</h2>
            <form onSubmit={addSchedule} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Device</label>
                <select
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                >
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>{d.boards?.name} - {d.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Time</label>
                <input
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAY_NAMES.map((name, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`grid h-[38px] w-[38px] place-items-center rounded-full border border-border bg-input text-xs font-extrabold transition-all duration-200 cursor-pointer hover:-translate-y-px ${
                        scheduleDays.includes(idx)
                          ? 'border-accent bg-accent text-[#100d06] shadow-gold-glow'
                          : 'text-text-muted border-border hover:border-accent hover:bg-accent-bg'
                      }`}
                      onClick={() => toggleDay(idx)}
                    >
                      {name.substring(0, 1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Action</label>
                <select
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  value={scheduleAction}
                  onChange={(e) => setScheduleAction(e.target.value === 'true')}
                >
                  <option value="true">Turn ON</option>
                  <option value="false">Turn OFF</option>
                </select>
              </div>
              <div className="mt-5 flex justify-end gap-2.5">
                <button
                  type="button"
                  className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
