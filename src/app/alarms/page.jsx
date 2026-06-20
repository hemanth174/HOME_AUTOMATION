'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';

export default function AlarmsPage() {
  const [user, setUser] = useState(null);
  const [alarms, setAlarms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Modal drag-to-close gesture state for mobile
  const [modalDragY, setModalDragY] = useState(0);
  const [modalDragging, setModalDragging] = useState(false);
  const [modalStartY, setModalStartY] = useState(0);

  const handleModalTouchStart = (e) => {
    setModalStartY(e.touches[0].clientY);
    setModalDragging(true);
  };

  const handleModalTouchMove = (e) => {
    if (!modalDragging) return;
    if (e.currentTarget.scrollTop > 0) return;
    const deltaY = e.touches[0].clientY - modalStartY;
    if (deltaY > 0) {
      setModalDragY(deltaY);
    }
  };

  const handleModalTouchEnd = () => {
    setModalDragging(false);
    if (modalDragY > 80) {
      setShowModal(false);
    }
    setModalDragY(0);
  };

  // Form
  const [selectedDevice, setSelectedDevice] = useState('');
  const [triggerAt, setTriggerAt] = useState('');
  const [alarmAction, setAlarmAction] = useState(true);

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
      const [alarmsRes, devicesRes] = await Promise.all([
        supabase.from('alarms').select('id, trigger_at, action, fired, device_id, devices(name, boards(name))').eq('user_id', user.id).order('trigger_at'),
        supabase.from('devices').select('id, name, boards(name)').eq('user_id', user.id).order('relay_index'),
      ]);

      if (!active) return;

      if (alarmsRes.data) setAlarms(alarmsRes.data);
      if (devicesRes.data) {
        setDevices(devicesRes.data);
        if (devicesRes.data.length > 0) setSelectedDevice(devicesRes.data[0].id);
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 500 - elapsed);
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
      .channel('alarms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alarms', filter: `user_id=eq.${user.id}` },
        async () => {
          const { data } = await supabase.from('alarms').select('id, trigger_at, action, fired, device_id, devices(name, boards(name))').eq('user_id', user.id).order('trigger_at');
          if (data) setAlarms(data);
        }
      ).subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  const addAlarm = async (e) => {
    e.preventDefault();
    if (!selectedDevice || !triggerAt) {
      setToast('Please fill all fields');
      return;
    }
    const { error } = await supabase.from('alarms').insert({
      user_id: user.id,
      device_id: selectedDevice,
      action: alarmAction,
      trigger_at: new Date(triggerAt).toISOString(),
      fired: false,
    });
    if (error) { setToast(error.message); return; }
    setShowModal(false);
    setTriggerAt('');
    setToast('Alarm created');
  };

  const deleteAlarm = async (id) => {
    await supabase.from('alarms').delete().eq('id', id);
    setAlarms(prev => prev.filter(a => a.id !== id));
    setToast('Alarm deleted');
  };

  const formatDateTime = (isoStr) => {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true,
    });
  };

  const isPast = (isoStr) => new Date(isoStr) < new Date();

  if (loading) {
    return <Loader message="Loading alarms..." />;
  }

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] select-none">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Alarms</h2>
          <button
            className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover active:translate-y-0 shadow-gold-glow"
            onClick={() => setShowModal(true)}
          >
            Add Alarm
          </button>
        </div>

        {alarms.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-[18px] border border-dashed border-border bg-white/[0.03] px-5 py-10 text-center text-sm font-semibold text-text-muted animate-scale-in">
            No alarms yet. Tap Add to create one.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {alarms.map((alarm) => {
              const past = isPast(alarm.trigger_at);
              return (
                <div
                  key={alarm.id}
                  className={`relative overflow-hidden rounded-[18px] border border-border bg-card p-[18px] shadow-lg transition-all duration-200 hover:-translate-y-px hover:border-accent/40 hover:shadow-2xl ${
                    alarm.fired || past ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 max-md:flex-col max-md:items-start w-full">
                    <div>
                      <div className="text-xl font-extrabold text-text">{formatDateTime(alarm.trigger_at)}</div>
                      <div className="text-xs font-bold text-text-muted">
                        {alarm.devices?.name || 'Device'} — {alarm.devices?.boards?.name || 'Board'}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-extrabold uppercase px-2 py-0.5 rounded-md ${
                        alarm.fired
                          ? 'text-green-500 bg-green-500/10'
                          : past
                          ? 'text-text-muted bg-white/5'
                          : 'text-accent bg-accent-bg'
                      }`}
                    >
                      {alarm.fired ? 'Fired' : past ? 'Expired' : 'Pending'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-text-muted mt-2">
                    Turn {alarm.action ? 'ON' : 'OFF'}
                  </div>
                  <div className="mt-3.5 flex gap-2 justify-end">
                    <button
                      className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-1 text-xs font-extrabold text-red-500 transition-all duration-250 cursor-pointer hover:bg-red-500 hover:text-white active:translate-y-0"
                      onClick={() => deleteAlarm(alarm.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0" onClick={() => setShowModal(false)}>
          <div 
            onTouchStart={handleModalTouchStart}
            onTouchMove={handleModalTouchMove}
            onTouchEnd={handleModalTouchEnd}
            style={{
              transform: `translateY(${modalDragY}px)`,
              transition: modalDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            className="max-h-[82vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl backdrop-blur-xl animate-fade-up max-md:w-full max-md:max-h-[85vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-10 max-md:animate-slide-up max-md:shadow-none flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle for Mobile */}
            <div className="hidden max-md:block w-12 h-1 bg-border rounded-full mx-auto mb-5 shrink-0" />
            <h2 className="mb-[18px] text-lg font-extrabold text-text">New Alarm</h2>
            <form onSubmit={addAlarm} className="flex flex-col gap-4">
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
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Trigger At</label>
                <input
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  type="datetime-local"
                  value={triggerAt}
                  onChange={(e) => setTriggerAt(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Action</label>
                <select
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  value={alarmAction}
                  onChange={(e) => setAlarmAction(e.target.value === 'true')}
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
