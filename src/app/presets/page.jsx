'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import { Edit, LucideEdit2, LucidePower, LucidePowerOff, PowerOffIcon, Trash, SlidersHorizontal } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByBoard(devices) {
  const map = {};
  for (const d of devices) {
    const bn = d.boards?.name || 'Unknown Board';
    if (!map[bn]) map[bn] = [];
    map[bn].push(d);
  }
  return map;
}

// ─── Grouped, searchable device list for presets modal ────────────────────────

function PresetDeviceList({ devices, presetActions, onToggleDevice, onToggleAction }) {
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
      {/* Search bar */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search device or board…"
        className="w-full px-3 py-2 rounded-lg border-[1.5px] border-border bg-input text-text text-xs outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
      />
      {/* Board-grouped scrollable device list */}
      <div className="max-h-[36vh] overflow-y-auto rounded-lg border border-border bg-input">
        {Object.keys(groups).length === 0 ? (
          <p className="px-4 py-3 text-xs text-text-muted font-semibold">No devices found.</p>
        ) : (
          Object.entries(groups).map(([boardName, devs]) => (
            <div key={boardName}>
              {/* Board header */}
              <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-accent bg-black border-b border-border sticky top-0 z-10">
                📋 {boardName}
              </div>
              {/* Devices under this board */}
              {devs.map(d => (
                <div
                  key={d.id}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0 gap-3"
                >
                  <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      className="accent-accent cursor-pointer shrink-0"
                      checked={presetActions[d.id]?.included || false}
                      onChange={() => onToggleDevice(d.id)}
                    />
                    <span className="text-xs font-bold text-text truncate">{d.name}</span>
                  </label>
                  {presetActions[d.id]?.included && (
                    <button
                      type="button"
                      className={`shrink-0 min-h-[26px] min-w-[46px] inline-flex items-center justify-center rounded px-2.5 py-1 text-[10px] font-black cursor-pointer transition-all duration-200 ${
                        presetActions[d.id]?.is_on
                          ? 'bg-accent text-[#0a0800] shadow-gold-glow'
                          : 'border border-border bg-card text-text'
                      }`}
                      onClick={() => onToggleAction(d.id)}
                    >
                      {presetActions[d.id]?.is_on ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PresetsPage() {
  const [user, setUser] = useState(null);
  const [presets, setPresets] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Edit state — null means "create new", otherwise holds preset being edited
  const [editingPreset, setEditingPreset] = useState(null);

  // Modal drag-to-close
  const [modalDragY, setModalDragY] = useState(0);
  const [modalDragging, setModalDragging] = useState(false);
  const [modalStartY, setModalStartY] = useState(0);

  const handleModalTouchStart = (e) => { setModalStartY(e.touches[0].clientY); setModalDragging(true); };
  const handleModalTouchMove = (e) => {
    if (!modalDragging) return;
    if (e.currentTarget.scrollTop > 0) return;
    const deltaY = e.touches[0].clientY - modalStartY;
    if (deltaY > 0) setModalDragY(deltaY);
  };
  const handleModalTouchEnd = () => {
    setModalDragging(false);
    if (modalDragY > 80) closeModal();
    setModalDragY(0);
  };

  // Form
  const [presetName, setPresetName] = useState('');
  const [presetActions, setPresetActions] = useState({});

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
      const [presetsRes, devicesRes] = await Promise.all([
        supabase.from('presets').select('id, name, actions').eq('user_id', user.id).order('created_at'),
        supabase.from('devices').select('id, name, is_on, boards(name)').eq('user_id', user.id).order('relay_index'),
      ]);
      if (!active) return;
      if (presetsRes.data) {
        setPresets(presetsRes.data.map(p => {
          let actions = p.actions;
          if (typeof actions === 'string') {
            try { actions = JSON.parse(actions); } catch(e) { actions = []; }
          }
          return { ...p, actions };
        }));
      }
      if (devicesRes.data) setDevices(devicesRes.data);
      const elapsed = Date.now() - startTime;
      setTimeout(() => { if (active) setLoading(false); }, Math.max(0, 500 - elapsed));
    };
    fetchData();
    return () => { active = false; };
  }, [user]);

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const presetsChannel = supabase
      .channel('presets-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presets', filter: `user_id=eq.${user.id}` },
        (payload) => {
          let newPreset = payload.new;
          if (newPreset && typeof newPreset.actions === 'string') {
            try { newPreset.actions = JSON.parse(newPreset.actions); } catch(e) { newPreset.actions = []; }
          }
          if (payload.eventType === 'INSERT') {
            setPresets(prev => prev.some(p => p.id === newPreset.id) ? prev : [...prev, newPreset]);
          } else if (payload.eventType === 'UPDATE') {
            setPresets(prev => prev.map(p => p.id === newPreset.id ? newPreset : p));
          } else if (payload.eventType === 'DELETE') {
            setPresets(prev => prev.filter(p => p.id !== payload.old.id));
          }
        }
      ).subscribe();

    const devicesChannel = supabase
      .channel('presets-devices-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${user.id}` },
        async (payload) => {
          if (payload.eventType === 'UPDATE') {
            setDevices(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d));
          } else {
            const { data } = await supabase.from('devices').select('id, name, is_on, boards(name)').eq('user_id', user.id).order('relay_index');
            if (data) setDevices(data);
          }
        }
      ).subscribe();

    return () => {
      supabase.removeChannel(presetsChannel);
      supabase.removeChannel(devicesChannel);
    };
  }, [user]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  /** Build a fresh presetActions map from device list, optionally pre-filled from existing preset */
  const buildPresetActions = (deviceList, existingActions = []) => {
    const actions = {};
    deviceList.forEach(d => {
      const match = existingActions.find(a => a.device_id === d.id);
      actions[d.id] = {
        included: !!match,
        is_on: match ? match.is_on : true,
      };
    });
    return actions;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const closeModal = () => {
    setShowModal(false);
    setEditingPreset(null);
    setPresetName('');
    setPresetActions({});
  };

  const openCreateModal = () => {
    setEditingPreset(null);
    setPresetActions(buildPresetActions(devices));
    setPresetName('');
    setShowModal(true);
  };

  const openEditModal = (preset) => {
    let actions = preset.actions;
    if (typeof actions === 'string') {
      try { actions = JSON.parse(actions); } catch(e) { actions = []; }
    }
    setEditingPreset(preset);
    setPresetName(preset.name);
    setPresetActions(buildPresetActions(devices, actions || []));
    setShowModal(true);
  };

  const togglePresetDevice = (deviceId) => {
    setPresetActions(prev => ({
      ...prev,
      [deviceId]: { ...prev[deviceId], included: !prev[deviceId].included },
    }));
  };

  const togglePresetAction = (deviceId) => {
    setPresetActions(prev => ({
      ...prev,
      [deviceId]: { ...prev[deviceId], is_on: !prev[deviceId].is_on },
    }));
  };

  const savePreset = async (e) => {
    e.preventDefault();
    if (!presetName.trim()) { setToast('Please enter a preset name'); return; }
    const actions = Object.entries(presetActions)
      .filter(([, v]) => v.included)
      .map(([deviceId, v]) => ({ device_id: deviceId, is_on: v.is_on }));
    if (actions.length === 0) { setToast('Please include at least one device'); return; }

    if (editingPreset) {
      // ── Edit mode: UPDATE existing preset ──────────────────────────────
      const { error } = await supabase
        .from('presets')
        .update({ name: presetName.trim(), actions })
        .eq('id', editingPreset.id);
      if (error) { setToast(error.message); return; }
      // Optimistic local update (realtime will also sync)
      setPresets(prev => prev.map(p =>
        p.id === editingPreset.id ? { ...p, name: presetName.trim(), actions } : p
      ));
      closeModal();
      setToast('Preset updated');
    } else {
      // ── Create mode: INSERT new preset ────────────────────────────────
      const { error } = await supabase
        .from('presets')
        .insert({ user_id: user.id, name: presetName.trim(), actions });
      if (error) { setToast(error.message); return; }
      const { data } = await supabase.from('presets').select('id, name, actions').eq('user_id', user.id).order('created_at');
      if (data) setPresets(data);
      closeModal();
      setToast('Preset created');
    }
  };

  const isPresetActive = (preset) => {
    let actions = preset.actions;
    if (typeof actions === 'string') {
      try { actions = JSON.parse(actions); } catch(e) { actions = []; }
    }
    if (!actions?.length) return false;
    return actions.every(action => {
      const device = devices.find(d => d.id === action.device_id);
      return device && device.is_on === action.is_on;
    });
  };

  const applyPreset = async (preset, deactivate = false) => {
    let actions = preset.actions;
    if (typeof actions === 'string') {
      try { actions = JSON.parse(actions); } catch(e) { actions = []; }
    }
    actions = actions || [];
    for (const action of actions) {
      const nextState = deactivate ? !action.is_on : action.is_on;
      await supabase.from('devices').update({ is_on: nextState, last_changed: new Date().toISOString() }).eq('id', action.device_id);
    }
    setDevices(prev => prev.map(device => {
      const action = actions.find(a => a.device_id === device.id);
      if (!action) return device;
      return { ...device, is_on: deactivate ? !action.is_on : action.is_on };
    }));
    setToast(`${deactivate ? 'Deactivated' : 'Activated'}: ${preset.name}`);
  };

  const deletePreset = async (id) => {
    await supabase.from('presets').delete().eq('id', id);
    setPresets(prev => prev.filter(p => p.id !== id));
    setToast('Preset deleted');
  };

  const allOn = async () => {
    if (devices.length === 0) {
      setToast('No devices available to turn ON. Please add a board first.');
      return;
    }
    const devicesToTurnOn = devices.filter(d => !d.is_on);
    if (devicesToTurnOn.length === 0) { setToast('All devices are already ON'); return; }
    setDevices(prev => prev.map(d => ({ ...d, is_on: true })));
    await Promise.all(devicesToTurnOn.map(async (device) => {
      await supabase.from('devices').update({ is_on: true, last_changed: new Date().toISOString() }).eq('id', device.id);
      try {
        await supabase.from('activity_logs').insert({ user_id: user.id, device_id: device.id, device_name: device.name, action: 'turned ON', triggered_by: 'Preset: All ON' });
      } catch (e) { console.warn(e); }
    }));
    setToast('All devices turned ON');
  };

  const allOff = async () => {
    if (devices.length === 0) {
      setToast('No devices available to turn OFF. Please add a board first.');
      return;
    }
    const devicesToTurnOff = devices.filter(d => d.is_on);
    if (devicesToTurnOff.length === 0) { setToast('All devices are already OFF'); return; }
    setDevices(prev => prev.map(d => ({ ...d, is_on: false })));
    await Promise.all(devicesToTurnOff.map(async (device) => {
      await supabase.from('devices').update({ is_on: false, last_changed: new Date().toISOString() }).eq('id', device.id);
      try {
        await supabase.from('activity_logs').insert({ user_id: user.id, device_id: device.id, device_name: device.name, action: 'turned OFF', triggered_by: 'Preset: All OFF' });
      } catch (e) { console.warn(e); }
    }));
    setToast('All devices turned OFF');
  };

  if (loading) return <Loader message="Loading presets..." />;

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] select-none">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Presets</h2>
          <button
            className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover shadow-gold-glow"
            onClick={openCreateModal}
          >
            Add Preset
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 mb-4">
          <button
            className="flex-1 min-h-[36px] inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card text-xs font-bold text-text transition-all hover:bg-card-alt cursor-pointer"
            onClick={allOn}
          >
            All ON
          </button>
          <button
            className="flex-1 min-h-[36px] inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card text-xs font-bold text-text transition-all hover:bg-card-alt cursor-pointer"
            onClick={allOff}
          >
            All OFF
          </button>
        </div>

        {presets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-border border-dashed bg-card p-10 text-center animate-scale-in max-w-lg mx-auto select-none gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow">
              <SlidersHorizontal size={24} className="stroke-[2.5px]" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-extrabold text-text tracking-tight">No Presets Configured</h3>
              <p className="text-xs text-text-muted font-semibold leading-relaxed px-4">
                Presets let you control multiple devices simultaneously with a single tap. Create one now to automate your routine!
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-accent px-5 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer mt-1"
            >
              Create Preset
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {presets.map((preset) => {
              const active = isPresetActive(preset);
              return (
                <div
                  key={preset.id}
                  className={`relative overflow-hidden rounded-[18px] border bg-card p-[18px] shadow-lg transition-all duration-200 hover:-translate-y-px hover:shadow-2xl ${
                    active
                      ? 'border-accent bg-[linear-gradient(135deg,rgba(201,168,76,0.14),rgba(255,255,255,0.035))]'
                      : 'border-border hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 max-md:flex-col max-md:items-start w-full">
                    <div>
                      <div className="text-sm font-extrabold text-text">{preset.name}</div>
                      <div className="text-xs font-bold text-text-muted mt-1">
                        {preset.actions.length} device{preset.actions.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <button
                        className={`inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 ${
                          active 
                            ? 'border-accent bg-accent text-[#0a0800] shadow-gold-glow'
                            : 'border-border bg-card text-text-muted hover:border-accent hover:text-accent hover:shadow-[0_0_12px_rgba(201,168,76,0.3)]'
                        }`}
                        onClick={() => applyPreset(preset, active)}
                        title={active ? 'Deactivate' : 'Activate'}
                      >
                        {active ? <LucidePowerOff size={16} strokeWidth={2.5} /> : <LucidePower size={16} strokeWidth={2.5} />}
                      </button>
                      <button
                        className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-1 bg-card transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 hover:border-accent hover:text-accent hover:shadow-[0_0_12px_rgba(201,168,76,0.3)]"
                        onClick={() => openEditModal(preset)}
                        title="Edit Preset"
                      >
                        <Edit size={16} strokeWidth={2.5} />
                      </button>
                      <button
                        className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-500 transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 hover:bg-red-500 hover:text-white hover:shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                        onClick={() => deletePreset(preset.id)}
                        title="Delete Preset"
                      >
                        <Trash size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit Preset Modal ─────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0"
          onClick={closeModal}
        >
          <div
            onTouchStart={handleModalTouchStart}
            onTouchMove={handleModalTouchMove}
            onTouchEnd={handleModalTouchEnd}
            style={{ transform: `translateY(${modalDragY}px)`, transition: modalDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
            className="max-h-[88vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl animate-fade-up max-md:w-full max-md:max-h-[92vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-10 max-md:animate-slide-up max-md:shadow-none flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hidden max-md:block w-12 h-1 bg-border rounded-full mx-auto mb-5 shrink-0" />

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-text">
                {editingPreset ? `Edit: ${editingPreset.name}` : 'New Preset'}
              </h2>
              {editingPreset && (
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md bg-accent-bg text-accent">
                  Editing
                </span>
              )}
            </div>

            <form onSubmit={savePreset} className="flex flex-col gap-4">

              {/* Preset Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Preset Name</label>
                <input
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  type="text"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  placeholder="e.g., Party Mode"
                  required
                />
              </div>

              {/* Device selection — grouped by board, searchable */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">
                  Select Devices
                  <span className="ml-1 text-[10px] font-bold text-text-muted/60">(grouped by board)</span>
                </label>
                <PresetDeviceList
                  devices={devices}
                  presetActions={presetActions}
                  onToggleDevice={togglePresetDevice}
                  onToggleAction={togglePresetAction}
                />
              </div>

              <div className="mt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow"
                >
                  {editingPreset ? 'Save Changes' : 'Create'}
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
