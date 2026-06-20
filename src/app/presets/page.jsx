'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';

export default function PresetsPage() {
  const [user, setUser] = useState(null);
  const [presets, setPresets] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Form
  const [presetName, setPresetName] = useState('');
  const [presetActions, setPresetActions] = useState({});

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
      const [presetsRes, devicesRes] = await Promise.all([
        supabase.from('presets').select('id, name, actions').eq('user_id', user.id).order('created_at'),
        supabase.from('devices').select('id, name, is_on, boards(name)').eq('user_id', user.id).order('relay_index'),
      ]);

      if (!active) return;

      if (presetsRes.data) setPresets(presetsRes.data);
      if (devicesRes.data) setDevices(devicesRes.data);

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

  const openCreateModal = () => {
    const actions = {};
    devices.forEach(d => { actions[d.id] = { included: false, is_on: true }; });
    setPresetActions(actions);
    setPresetName('');
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

  const createPreset = async (e) => {
    e.preventDefault();
    if (!presetName.trim()) { setToast('Please enter a preset name'); return; }
    const actions = Object.entries(presetActions)
      .filter(([, v]) => v.included)
      .map(([deviceId, v]) => ({ device_id: deviceId, is_on: v.is_on }));
    if (actions.length === 0) { setToast('Please include at least one device'); return; }
    const { error } = await supabase.from('presets').insert({
      user_id: user.id,
      name: presetName.trim(),
      actions: actions,
    });
    if (error) { setToast(error.message); return; }
    const { data } = await supabase.from('presets').select('id, name, actions').eq('user_id', user.id).order('created_at');
    if (data) setPresets(data);
    setShowModal(false);
    setToast('Preset created');
  };

  const isPresetActive = (preset) => {
    if (!preset.actions?.length) return false;
    return preset.actions.every((action) => {
      const device = devices.find(d => d.id === action.device_id);
      return device && device.is_on === action.is_on;
    });
  };

  const applyPreset = async (preset, deactivate = false) => {
    const actions = preset.actions || [];
    for (const action of actions) {
      const nextState = deactivate ? !action.is_on : action.is_on;
      await supabase
        .from('devices')
        .update({ is_on: nextState, last_changed: new Date().toISOString() })
        .eq('id', action.device_id);
    }
    setDevices(prev => prev.map((device) => {
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
    for (const device of devices) {
      await supabase.from('devices').update({ is_on: true, last_changed: new Date().toISOString() }).eq('id', device.id);
    }
    setDevices(prev => prev.map(d => ({ ...d, is_on: true })));
    setToast('All devices turned ON');
  };

  const allOff = async () => {
    for (const device of devices) {
      await supabase.from('devices').update({ is_on: false, last_changed: new Date().toISOString() }).eq('id', device.id);
    }
    setDevices(prev => prev.map(d => ({ ...d, is_on: false })));
    setToast('All devices turned OFF');
  };

  if (loading) {
    return <Loader message="Loading presets..." />;
  }

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] select-none">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Presets</h2>
          <button
            className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover active:translate-y-0 shadow-gold-glow"
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
          <div className="grid min-h-[220px] place-items-center rounded-[18px] border border-dashed border-border bg-white/[0.03] px-5 py-10 text-center text-sm font-semibold text-text-muted animate-scale-in">
            No presets yet. Create custom presets for quick control.
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
                    <div className="flex gap-2 justify-end">
                      <button
                        className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover shadow-gold-glow"
                        onClick={() => applyPreset(preset, active)}
                      >
                        {active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-1 text-xs font-extrabold text-red-500 transition-all duration-250 cursor-pointer hover:bg-red-500 hover:text-white active:translate-y-0"
                        onClick={() => deletePreset(preset.id)}
                      >
                        Delete
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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in" onClick={() => setShowModal(false)}>
          <div className="max-h-[82vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl backdrop-blur-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-[18px] text-lg font-extrabold text-text">New Preset</h2>
            <form onSubmit={createPreset} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Preset Name</label>
                <input
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="e.g., Party Mode"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Select Devices</label>
                <div className="max-h-[30vh] overflow-y-auto border border-border rounded-lg bg-input px-3 py-1">
                  {devices.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="accent-accent cursor-pointer"
                          checked={presetActions[d.id]?.included || false}
                          onChange={() => togglePresetDevice(d.id)}
                        />
                        <span className="text-xs text-text truncate">{d.boards?.name} - {d.name}</span>
                      </div>
                      {presetActions[d.id]?.included && (
                        <button
                          type="button"
                          className={`min-h-[26px] min-w-[50px] inline-flex items-center justify-center rounded px-2.5 py-1 text-[10px] font-black cursor-pointer transition-all duration-200 ${
                            presetActions[d.id]?.is_on
                              ? 'bg-accent text-[#0a0800] shadow-gold-glow'
                              : 'border border-border bg-card text-text'
                          }`}
                          onClick={() => togglePresetAction(d.id)}
                        >
                          {presetActions[d.id]?.is_on ? 'ON' : 'OFF'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
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
