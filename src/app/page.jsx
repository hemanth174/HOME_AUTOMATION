'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import VoiceControl from '@/components/VoiceControl';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import { ChevronUp } from 'lucide-react';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [boards, setBoards] = useState([]);
  const [devices, setDevices] = useState([]);
  const [presets, setPresets] = useState([]);
  const [expandedBoards, setExpandedBoards] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [editingBoard, setEditingBoard] = useState(null);
  const [editingDevice, setEditingDevice] = useState(null);
  const [editName, setEditName] = useState('');
  const [showAddBoardModal, setShowAddBoardModal] = useState(false);
  const [boardIdentifier, setBoardIdentifier] = useState('');
  const [boardName, setBoardName] = useState('');

  const showToast = useCallback((msg) => {
    setToast(msg);
  }, []);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      setUser(user);
      
      const metadata = user.user_metadata || {};
      if (!metadata.full_name && !metadata.name) {
        window.location.href = '/profile?promptUpdate=true';
      }
    };
    checkAuth();
  }, []);

  // Fetch data
  useEffect(() => {
    if (!user) return;
    let active = true;

    const fetchData = async () => {
      const startTime = Date.now();
      const [boardsRes, devicesRes, presetsRes] = await Promise.all([
        supabase.from('boards').select('id, name, board_identifier, last_seen').eq('user_id', user.id).order('created_at'),
        supabase.from('devices').select('id, name, is_on, feedback_on, relay_index, board_id').eq('user_id', user.id).order('relay_index'),
        supabase.from('presets').select('id, name, actions').eq('user_id', user.id).order('created_at'),
      ]);

      if (!active) return;

      if (boardsRes.data) setBoards(boardsRes.data);
      if (devicesRes.data) setDevices(devicesRes.data);
      if (presetsRes.data) setPresets(presetsRes.data);

      // Expand all boards by default
      if (boardsRes.data) {
        const expanded = {};
        boardsRes.data.forEach(b => { expanded[b.id] = true; });
        setExpandedBoards(expanded);
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

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const devicesChannel = supabase
      .channel('devices-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setDevices(prev => prev.map(d => d.id === payload.new.id ? payload.new : d));
          } else if (payload.eventType === 'INSERT') {
            setDevices(prev => [...prev, payload.new]);
          } else if (payload.eventType === 'DELETE') {
            setDevices(prev => prev.filter(d => d.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const presetsChannel = supabase
      .channel('dashboard-presets-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'presets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setPresets(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
          } else if (payload.eventType === 'INSERT') {
            setPresets(prev => [...prev, payload.new]);
          } else if (payload.eventType === 'DELETE') {
            setPresets(prev => prev.filter(p => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const boardsChannel = supabase
      .channel('dashboard-boards-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boards',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setBoards(prev => prev.map(b => b.id === payload.new.id ? payload.new : b));
          } else if (payload.eventType === 'INSERT') {
            setBoards(prev => [...prev, payload.new]);
          } else if (payload.eventType === 'DELETE') {
            setBoards(prev => prev.filter(b => b.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(devicesChannel);
      supabase.removeChannel(presetsChannel);
      supabase.removeChannel(boardsChannel);
    };
  }, [user]);

  const toggleBoard = (boardId) => {
    setExpandedBoards(prev => ({ ...prev, [boardId]: !prev[boardId] }));
  };

  const toggleDevice = async (device) => {
    const newState = !device.is_on;
    await supabase
      .from('devices')
      .update({ is_on: newState, last_changed: new Date().toISOString() })
      .eq('id', device.id);

    try {
      await supabase.from('activity_logs').insert({
        user_id: user.id,
        device_id: device.id,
        device_name: device.name,
        action: newState ? 'turned ON' : 'turned OFF',
        triggered_by: 'Manual Web Dashboard'
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const isPresetActive = (preset) => {
    if (!preset.actions?.length) return false;
    return preset.actions.every((action) => {
      const device = devices.find(d => d.id === action.device_id);
      return device && device.is_on === action.is_on;
    });
  };

  const applyPreset = async (preset, deactivate = false) => {
    for (const action of preset.actions || []) {
      const targetState = deactivate ? !action.is_on : action.is_on;
      await supabase
        .from('devices')
        .update({ is_on: targetState, last_changed: new Date().toISOString() })
        .eq('id', action.device_id);

      const device = devices.find(d => d.id === action.device_id);
      if (device) {
        try {
          await supabase.from('activity_logs').insert({
            user_id: user.id,
            device_id: device.id,
            device_name: device.name,
            action: targetState ? 'turned ON' : 'turned OFF',
            triggered_by: `Preset: ${preset.name}`
          });
        } catch (e) {
          console.warn(e);
        }
      }
    }
    showToast(`${deactivate ? 'Deactivated' : 'Activated'}: ${preset.name}`);
  };

  const deletePreset = async (presetId) => {
    await supabase.from('presets').delete().eq('id', presetId);
    setPresets(prev => prev.filter(p => p.id !== presetId));
    showToast('Preset deleted');
  };

  const startEditBoard = (board) => {
    setEditingBoard(board.id);
    setEditName(board.name);
  };

  const saveEditBoard = async (boardId) => {
    if (editName.trim()) {
      await supabase.from('boards').update({ name: editName.trim() }).eq('id', boardId);
      setBoards(prev => prev.map(b => b.id === boardId ? { ...b, name: editName.trim() } : b));
    }
    setEditingBoard(null);
  };

  const startEditDevice = (device) => {
    setEditingDevice(device.id);
    setEditName(device.name);
  };

  const saveEditDevice = async (deviceId) => {
    if (editName.trim()) {
      await supabase.from('devices').update({ name: editName.trim() }).eq('id', deviceId);
      setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, name: editName.trim() } : d));
    }
    setEditingDevice(null);
  };

  const turnAllDevicesOn = async () => {
    const devicesToTurnOn = devices.filter(d => !d.is_on);
    if (devicesToTurnOn.length === 0) {
      showToast('All devices are already ON');
      return;
    }
    
    // Update local state immediately
    setDevices(prev => prev.map(d => ({ ...d, is_on: true })));
    
    await Promise.all(devicesToTurnOn.map(async (device) => {
      await supabase.from('devices').update({ is_on: true, last_changed: new Date().toISOString() }).eq('id', device.id);
      try {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          device_id: device.id,
          device_name: device.name,
          action: 'turned ON',
          triggered_by: 'Global All ON'
        });
      } catch (e) {
        console.warn(e);
      }
    }));
    showToast('All devices turned ON');
  };

  const turnAllDevicesOff = async () => {
    const devicesToTurnOff = devices.filter(d => d.is_on);
    if (devicesToTurnOff.length === 0) {
      showToast('All devices are already OFF');
      return;
    }
    
    // Update local state immediately
    setDevices(prev => prev.map(d => ({ ...d, is_on: false })));
    
    await Promise.all(devicesToTurnOff.map(async (device) => {
      await supabase.from('devices').update({ is_on: false, last_changed: new Date().toISOString() }).eq('id', device.id);
      try {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          device_id: device.id,
          device_name: device.name,
          action: 'turned OFF',
          triggered_by: 'Global All OFF'
        });
      } catch (e) {
        console.warn(e);
      }
    }));
    showToast('All devices turned OFF');
  };

  const turnBoardDevicesOn = async (boardId, boardName) => {
    const boardDevices = getDevicesForBoard(boardId);
    const devicesToTurnOn = boardDevices.filter(d => !d.is_on);
    if (devicesToTurnOn.length === 0) {
      showToast(`All devices on ${boardName} are already ON`);
      return;
    }
    
    // Update local state immediately
    setDevices(prev => prev.map(d => d.board_id === boardId ? { ...d, is_on: true } : d));
    
    await Promise.all(devicesToTurnOn.map(async (device) => {
      await supabase.from('devices').update({ is_on: true, last_changed: new Date().toISOString() }).eq('id', device.id);
      try {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          device_id: device.id,
          device_name: device.name,
          action: 'turned ON',
          triggered_by: `Board All ON: ${boardName}`
        });
      } catch (e) {
        console.warn(e);
      }
    }));
    showToast(`All devices on ${boardName} turned ON`);
  };

  const turnBoardDevicesOff = async (boardId, boardName) => {
    const boardDevices = getDevicesForBoard(boardId);
    const devicesToTurnOff = boardDevices.filter(d => d.is_on);
    if (devicesToTurnOff.length === 0) {
      showToast(`All devices on ${boardName} are already OFF`);
      return;
    }
    
    // Update local state immediately
    setDevices(prev => prev.map(d => d.board_id === boardId ? { ...d, is_on: false } : d));
    
    await Promise.all(devicesToTurnOff.map(async (device) => {
      await supabase.from('devices').update({ is_on: false, last_changed: new Date().toISOString() }).eq('id', device.id);
      try {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          device_id: device.id,
          device_name: device.name,
          action: 'turned OFF',
          triggered_by: `Board All OFF: ${boardName}`
        });
      } catch (e) {
        console.warn(e);
      }
    }));
    showToast(`All devices on ${boardName} turned OFF`);
  };

  const addBoard = async (e) => {
    e.preventDefault();
    if (!boardIdentifier.trim()) { showToast('Board identifier is required'); return; }

    // Insert board
    const { data: board, error: boardError } = await supabase.from('boards').insert({
      user_id: user.id,
      board_identifier: boardIdentifier.trim(),
      name: boardName.trim() || 'New Board',
    }).select('id').single();

    if (boardError) { showToast(boardError.message); return; }

    // Auto-create 4 devices for the board
    const deviceInserts = [];
    for (let i = 0; i < 4; i++) {
      deviceInserts.push({
        user_id: user.id,
        board_id: board.id,
        relay_index: i,
        name: `Device ${i + 1}`,
        is_on: false,
      });
    }
    const { error: devicesError } = await supabase.from('devices').insert(deviceInserts);
    if (devicesError) { showToast(devicesError.message); return; }

    setShowAddBoardModal(false);
    setBoardIdentifier('');
    setBoardName('');
    showToast('Board added with 4 devices');
  };



  const getFeedbackStatus = (device) => {
    // feedback_on === null/undefined → no feedback sensor wired, just reflect relay state
    if (device.feedback_on === null || device.feedback_on === undefined) {
      return { text: device.is_on ? 'ON' : 'OFF', className: device.is_on ? 'match' : '', manualOn: false };
    }

    // Active-low traveller config:
    //   feedback pin pulled LOW (0) → feedback_on stored as TRUE in DB → light is physically ON via manual switch
    //   feedback pin HIGH (1)        → feedback_on stored as FALSE in DB → manual switch is off
    if (device.feedback_on === true) {
      // Physical light is ON via manual wall switch — alert the user with red background
      return { text: 'Manual ON', className: 'manual', manualOn: true };
    }

    // feedback_on === false → manual switch is off; show normal relay state
    return { text: device.is_on ? 'ON' : 'OFF', className: device.is_on ? 'match' : '', manualOn: false };
  };

  const getDevicesForBoard = (boardId) => {
    return devices.filter(d => d.board_id === boardId);
  };

  if (loading) {
    return <Loader message="Loading Smart Home Dashboard..." />;
  }

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px]">

        {presets.length > 0 && (
          <section className="mb-[18px]">
            <div className="ml-1 mb-[9px] text-[11px] font-black uppercase tracking-[0.12em] text-text-muted">Quick Presets</div>
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-0.5 pb-3">
              {presets.map((preset) => {
                const active = isPresetActive(preset);
                return (
                  <article
                    key={preset.id}
                    className={`flex min-w-[250px] max-w-[310px] flex-[0_0_250px] snap-start items-center justify-between gap-3.5 rounded-[18px] border bg-card p-[15px] shadow-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-2xl ${active
                        ? 'border-accent bg-[linear-gradient(135deg,rgba(201,168,76,0.14),rgba(255,255,255,0.035))]'
                        : 'border-border hover:border-accent/40'
                      }`}
                  >
                    <div className="flex-1 min-w-0">
                      <strong className="mb-1 block truncate text-sm font-black text-text">{preset.name}</strong>
                      <span className="text-xs font-bold text-text-muted">
                        {preset.actions?.length || 0} device{preset.actions?.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-3 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover active:translate-y-0 shadow-gold-glow"
                        onClick={() => applyPreset(preset, active)}
                      >
                        {active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-extrabold text-red-500 transition-all duration-250 cursor-pointer hover:bg-red-500 hover:text-white active:translate-y-0"
                        onClick={() => deletePreset(preset.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex justify-between items-center mb-5 ml-1 select-none">
          <h2 className="text-lg font-extrabold text-text tracking-tight">Boards & Devices</h2>
          <div className="flex gap-2">
            <button
              onClick={turnAllDevicesOn}
              className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-1 text-xs font-extrabold text-text transition-all duration-250 cursor-pointer hover:bg-card-alt hover:border-accent/40"
            >
              All On
            </button>
            <button
              onClick={turnAllDevicesOff}
              className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-1 text-xs font-extrabold text-text transition-all duration-250 cursor-pointer hover:bg-card-alt hover:border-accent/40"
            >
              All Off
            </button>
            <button
              onClick={() => setShowAddBoardModal(true)}
              className="inline-flex min-h-[30px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover shadow-gold-glow"
            >
              Add Board
            </button>
          </div>
        </div>

        {boards.length === 0 ? (
          <div className="grid min-h-[220px] place-items-center rounded-[18px] border border-dashed border-border bg-white/[0.03] px-5 py-10 text-center text-sm font-semibold text-text-muted animate-scale-in">
            No boards yet. Tap Add Board to add your first ESP32 board.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {boards.map((board) => {
              const boardDevices = getDevicesForBoard(board.id);
              const isExpanded = expandedBoards[board.id];
              const isOnline = board.last_seen ? (Date.now() - new Date(board.last_seen).getTime() < 5 * 60 * 1000) : false;

              return (
                <div key={board.id} className="relative overflow-hidden rounded-[18px] border border-border bg-card shadow-lg backdrop-blur-md transition-all duration-250 ease-out hover:border-accent/40 animate-fade-up">
                  <div
                    className="flex min-h-[58px] cursor-pointer select-none items-center justify-between gap-3 bg-card-alt border-b border-border px-[18px] py-[15px] max-[430px]:px-3.5 max-[430px]:py-[13px] hover:bg-card/40 transition-all"
                    onClick={() => toggleBoard(board.id)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                      {editingBoard === board.id ? (
                        <input
                          className="min-w-[120px] border-0 border-b border-dashed border-accent bg-transparent text-[inherit] font-[inherit] text-text outline-0 focus:shadow-[0_6px_0_-5px_var(--accent)]"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => saveEditBoard(board.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditBoard(board.id); }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="max-w-full truncate text-[14px] font-extrabold text-text hover:border-border hover:bg-input border border-transparent rounded px-1 cursor-text"
                          onDoubleClick={() => startEditBoard(board)}
                          title="Double-click to rename"
                        >
                          {board.name}
                        </span>
                      )}
                      
                      {/* Connection Indicator Badge */}
                      <span className={`flex items-center gap-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isOnline ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        {isOnline ? 'Online' : 'Offline'}
                      </span>

                      <span className="text-[11px] text-text-muted font-bold whitespace-nowrap bg-bg px-2 py-0.5 rounded-md">
                        {boardDevices.length} devices
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="inline-flex h-[26px] items-center justify-center rounded bg-card border border-border px-2.5 py-0.5 text-[10px] font-extrabold text-text transition-all duration-200 hover:bg-card-alt hover:border-accent/40 cursor-pointer"
                        onClick={() => turnBoardDevicesOn(board.id, board.name)}
                      >
                        All On
                      </button>
                      <button
                        className="inline-flex h-[26px] items-center justify-center rounded bg-card border border-border px-2.5 py-0.5 text-[10px] font-extrabold text-text transition-all duration-200 hover:bg-card-alt hover:border-accent/40 cursor-pointer"
                        onClick={() => turnBoardDevicesOff(board.id, board.name)}
                      >
                        All Off
                      </button>
                      <button
                        className={`grid h-7 w-7 place-items-center rounded-full border border-border text-[10px] text-accent transition-all duration-300 font-bold cursor-pointer ${isExpanded ? 'rotate-180 bg-accent-bg' : ''}`}
                        onClick={() => toggleBoard(board.id)}
                      >
                        <ChevronUp />
                      </button>
                    </div>
                  </div>

                  <div className={`grid gap-3 overflow-hidden px-4 opacity-0 transition-all duration-300 ease-out max-md:grid-cols-2 max-md:gap-2.5 max-md:px-3 ${isExpanded ? 'grid-cols-4 max-h-[1200px] p-4 opacity-100 max-md:p-3' : 'max-h-0'}`}>
                    {boardDevices.map((device) => {
                      const feedback = getFeedbackStatus(device);
                      return (
                        <div
                          className={`flex min-h-[122px] flex-col items-center justify-center gap-[13px] rounded-2xl border px-3 py-4 text-center transition-all duration-250 ease-out hover:-translate-y-0.5 max-[430px]:min-h-[108px] max-[430px]:px-2.5 max-[430px]:py-[13px] ${
                            feedback.manualOn
                              // Manual wall switch ON — red alert card
                              ? 'border-red-500/60 bg-red-500/10 shadow-[0_0_16px_rgba(239,68,68,0.25)] animate-pulse-dot-red'
                              : device.is_on
                                // Relay ON — gold glow card
                                ? 'border-accent/50 bg-accent-bg shadow-gold-glow animate-glow-pulse hover:border-accent/45 hover:bg-accent-bg'
                                // Both OFF — neutral card
                                : 'border-border bg-white/[0.025] hover:border-accent/45 hover:bg-accent-bg'
                          }`}
                          key={device.id}
                        >
                          <div className="flex min-w-0 flex-col items-center gap-1 w-full">
                            {editingDevice === device.id ? (
                              <input
                                className="w-full text-center border-0 border-b border-dashed border-accent bg-transparent text-[inherit] font-[inherit] text-text outline-0 focus:shadow-[0_6px_0_-5px_var(--accent)]"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => saveEditDevice(device.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEditDevice(device.id); }}
                                autoFocus
                              />
                            ) : (
                              <span
                                className="break-words text-[12px] font-bold leading-tight text-text hover:border-border hover:bg-input border border-transparent rounded px-1.5 cursor-pointer max-w-full"
                                onClick={() => startEditDevice(device)}
                                title="Click to rename"
                              >
                                {device.name}
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-[0.05em] ${
                                feedback.className === 'manual'
                                  ? 'text-red-400'
                                  : feedback.className === 'match'
                                    ? 'text-[#73C983]'
                                    : 'text-text-muted'
                              }`}
                            >
                              {feedback.text}
                            </span>
                          </div>
                          <div
                            className={`relative h-[24px] w-11 shrink-0 rounded-full border border-border bg-toggle-track transition-all duration-250 cursor-pointer 
                              }`}
                            onClick={() => toggleDevice(device)}
                          >
                            <div
                              className={`absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-transform duration-250 ease-out ${device.is_on ? 'translate-x-[20px]' : ''
                                }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {boardDevices.length === 0 && (
                      <div className="col-span-full py-6 text-center text-text-muted text-xs font-semibold">
                        No devices on this board
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddBoardModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in" onClick={() => setShowAddBoardModal(false)}>
          <div className="max-h-[82vh] w-[min(100%,440px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl backdrop-blur-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-[18px] text-lg font-extrabold text-text">Add Board</h2>
            <form onSubmit={addBoard} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Board Identifier (ESP32 ID)</label>
                <input
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  type="text"
                  value={boardIdentifier}
                  onChange={(e) => setBoardIdentifier(e.target.value)}
                  placeholder="e.g., ESP32_001"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold tracking-wide text-text-muted">Display Name</label>
                <input
                  className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border bg-input text-text text-sm outline-none transition-all focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-bg)]"
                  type="text"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  placeholder="e.g., Living Room"
                />
              </div>
              <div className="mt-5 flex justify-end gap-2.5">
                <button
                  type="button"
                  className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer"
                  onClick={() => setShowAddBoardModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover cursor-pointer shadow-gold-glow"
                >
                  Add Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <VoiceControl devices={devices} boards={boards} onToast={showToast} />
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
