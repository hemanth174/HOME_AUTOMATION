'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import ConfirmModal from '@/components/ConfirmModal';
import { Edit, LucidePower, LucidePowerOff, Trash, SlidersHorizontal } from 'lucide-react';
import PresetModal from './PresetModal';

export default function PresetsPage() {
  const [user, setUser] = useState(null);
  const [presets, setPresets] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Edit state — null means "create new", otherwise holds preset being edited
  const [editingPreset, setEditingPreset] = useState(null);

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

  const deletePreset = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('presets').delete().eq('id', pendingDelete.id);
    setDeleting(false);
    if (error) {
      setToast(`Could not delete preset: ${error.message}`);
      return;
    }
    setPresets(prev => prev.filter(p => p.id !== pendingDelete.id));
    setPendingDelete(null);
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
      <div className="dashboard-container animate-fade-up select-none">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Presets</h2>
          <button
            className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[var(--btn-text)] transition-all duration-250 cursor-pointer hover:bg-accent-hover shadow-gold-glow"
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
              className="inline-flex min-h-[36px] items-center justify-center rounded-xl bg-accent px-5 text-xs font-extrabold text-[var(--btn-text)] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer mt-1"
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
                            ? 'border-accent bg-accent text-[var(--btn-text)] shadow-gold-glow'
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
                        onClick={() => setPendingDelete(preset)}
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

      {showModal && (
        <PresetModal editingPreset={editingPreset} presetActions={presetActions} presetName={presetName} setPresetName={setPresetName} devices={devices} savePreset={savePreset} closeModal={closeModal} togglePresetDevice={togglePresetDevice} togglePresetAction={togglePresetAction} />
      )}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete this preset?"
        description={`“${pendingDelete?.name || 'This preset'}” will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete Preset"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deletePreset}
      />

      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
