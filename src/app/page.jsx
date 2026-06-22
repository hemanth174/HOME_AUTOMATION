'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import VoiceControl from '@/components/VoiceControl';
import Toast from '@/components/Toast';
import Loader from '@/components/Loader';
import BoardCard from '@/components/BoardCard';
import AddBoardModal from '@/components/AddBoardModal';
import EditBoardModal from '@/components/EditBoardModal';
import QuickPresets from '@/components/QuickPresets';
import useDashboardData from '@/hooks/useDashboardData';

export default function Dashboard() {
  const {
    user,
    setUser,
    boards,
    setBoards,
    devices,
    setDevices,
    presets,
    setPresets,
    expandedBoards,
    setExpandedBoards,
    loading,
    setLoading
  } = useDashboardData();

  const [toast, setToast] = useState('');
  const [showAddBoardModal, setShowAddBoardModal] = useState(false);
  const [boardIdentifier, setBoardIdentifier] = useState('');
  const [boardName, setBoardName] = useState('');

  // Edit Board Modal State
  const [showEditBoardModal, setShowEditBoardModal] = useState(false);
  const [editingBoardObj, setEditingBoardObj] = useState(null);

  // Modal drag-to-close gesture state for mobile
  const [modalDragY, setModalDragY] = useState(0);
  const [modalDragging, setModalDragging] = useState(false);
  const [modalStartY, setModalStartY] = useState(0);

  const showToast = useCallback((msg) => {
    setToast(msg);
  }, []);

  const handleModalTouchStart = useCallback((e) => {
    setModalStartY(e.touches[0].clientY);
    setModalDragging(true);
  }, []);

  const handleModalTouchMove = useCallback((e) => {
    if (!modalDragging) return;
    if (e.currentTarget.scrollTop > 0) return;
    const deltaY = e.touches[0].clientY - modalStartY;
    if (deltaY > 0) {
      setModalDragY(deltaY);
    }
  }, [modalDragging, modalStartY]);

  const handleModalTouchEnd = useCallback(() => {
    setModalDragging(false);
    if (modalDragY > 80) {
      setShowAddBoardModal(false);
    }
    setModalDragY(0);
  }, [modalDragY]);

  const toggleBoard = useCallback((boardId) => {
    setExpandedBoards(prev => ({ ...prev, [boardId]: !prev[boardId] }));
  }, []);

  const toggleDevice = useCallback(async (device) => {
    if (!user) return;
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
  }, [user]);

  const isPresetActive = useCallback((preset) => {
    let actions = preset.actions;
    if (typeof actions === 'string') {
      try { actions = JSON.parse(actions); } catch(e) { actions = []; }
    }
    if (!actions?.length) return false;
    return actions.every((action) => {
      const device = devices.find(d => d.id === action.device_id);
      return device && device.is_on === action.is_on;
    });
  }, [devices]);

  const applyPreset = useCallback(async (preset, deactivate = false) => {
    if (!user) return;
    let actions = preset.actions;
    if (typeof actions === 'string') {
      try { actions = JSON.parse(actions); } catch(e) { actions = []; }
    }
    for (const action of actions || []) {
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
  }, [devices, user, showToast]);

  const deletePreset = useCallback(async (presetId) => {
    await supabase.from('presets').delete().eq('id', presetId);
    setPresets(prev => prev.filter(p => p.id !== presetId));
    showToast('Preset deleted');
  }, [showToast]);


  const turnAllDevicesOn = useCallback(async () => {
    if (!user) return;
    const devicesToTurnOn = devices.filter(d => !d.is_on);
    if (devicesToTurnOn.length === 0) {
      showToast('All devices are already ON');
      return;
    }
    
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
  }, [devices, user, showToast]);

  const turnAllDevicesOff = useCallback(async () => {
    if (!user) return;
    const devicesToTurnOff = devices.filter(d => d.is_on);
    if (devicesToTurnOff.length === 0) {
      showToast('All devices are already OFF');
      return;
    }
    
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
  }, [devices, user, showToast]);

  const getDevicesForBoard = useCallback((boardId) => {
    return devices.filter(d => d.board_id === boardId);
  }, [devices]);

  const turnBoardDevicesOn = useCallback(async (boardId, boardName) => {
    if (!user) return;
    const boardDevices = getDevicesForBoard(boardId);
    const devicesToTurnOn = boardDevices.filter(d => !d.is_on);
    if (devicesToTurnOn.length === 0) {
      showToast(`All devices on ${boardName} are already ON`);
      return;
    }
    
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
  }, [getDevicesForBoard, user, showToast]);

  const turnBoardDevicesOff = useCallback(async (boardId, boardName) => {
    if (!user) return;
    const boardDevices = getDevicesForBoard(boardId);
    const devicesToTurnOff = boardDevices.filter(d => d.is_on);
    if (devicesToTurnOff.length === 0) {
      showToast(`All devices on ${boardName} are already OFF`);
      return;
    }
    
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
  }, [getDevicesForBoard, user, showToast]);

  const addBoard = useCallback(async (e) => {
    e.preventDefault();
    if (!user) return;
    if (!boardIdentifier.trim()) { showToast('Board identifier is required'); return; }

    const { data: board, error: boardError } = await supabase.from('boards').insert({
      user_id: user.id,
      board_identifier: boardIdentifier.trim(),
      name: boardName.trim() || 'New Board',
    }).select('id').single();

    if (boardError) { showToast(boardError.message); return; }

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
  }, [user, boardIdentifier, boardName, showToast]);

  const openFullEditBoard = useCallback((board) => {
    setEditingBoardObj(board);
    setShowEditBoardModal(true);
  }, []);

  const saveFullBoardEdit = useCallback(async (boardId, newName, newIdentifier, newDeviceNames) => {
    if (!user) return;
    
    // Update board
    const { error: boardError } = await supabase.from('boards')
      .update({ name: newName, board_identifier: newIdentifier })
      .eq('id', boardId);
    if (boardError) { showToast(boardError.message); return; }
    
    // Update devices
    const devicesToUpdate = getDevicesForBoard(boardId);
    for (const d of devicesToUpdate) {
      if (d.relay_index >= 0 && d.relay_index <= 3) {
        const newDevName = newDeviceNames[d.relay_index];
        if (newDevName !== d.name) {
          await supabase.from('devices')
            .update({ name: newDevName })
            .eq('id', d.id);
        }
      }
    }
    
    showToast('Board updated successfully');
    setShowEditBoardModal(false);
  }, [user, getDevicesForBoard, showToast]);

  const getFeedbackStatus = useCallback((device) => {
    if (device.feedback_on === null || device.feedback_on === undefined) {
      return { text: device.is_on ? 'ON' : 'OFF', className: device.is_on ? 'match' : '', manualOn: false };
    }

    if (device.feedback_on === true) {
      return { text: 'Manual ON', className: 'manual', manualOn: true };
    }

    return { text: device.is_on ? 'ON' : 'OFF', className: device.is_on ? 'match' : '', manualOn: false };
  }, []);



  if (loading) {
    return <Loader message="Loading Smart Home Dashboard..." />;
  }

  return (
    <>
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px]">

        <QuickPresets
          presets={presets}
          isPresetActive={isPresetActive}
          applyPreset={applyPreset}
          deletePreset={deletePreset}
        />

        <div className="flex flex-col min-[480px]:flex-row justify-between min-[480px]:items-center gap-3 mb-5 ml-1 select-none">
          <h2 className="text-lg font-extrabold text-text tracking-tight whitespace-nowrap">Boards & Devices</h2>
          <div className="flex items-center gap-2 max-[480px]:w-full max-[480px]:justify-between">
          <div className='flex gap-3'>
              <button
              onClick={turnAllDevicesOn}
              className="inline-flex min-h-[32px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-1 text-xs font-extrabold text-text transition-all duration-250 cursor-pointer hover:bg-card-alt hover:border-accent/40 whitespace-nowrap"
            >
              All On
            </button>
            <button
              onClick={turnAllDevicesOff}
              className="inline-flex min-h-[32px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-1 text-xs font-extrabold text-text transition-all duration-250 cursor-pointer hover:bg-card-alt hover:border-accent/40 whitespace-nowrap"
            >
              All Off
            </button>
          </div>
            <button
              onClick={() => setShowAddBoardModal(true)}
              className="inline-flex min-h-[32px] items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-1 text-xs font-extrabold text-[#0a0800] transition-all duration-250 cursor-pointer hover:bg-accent-hover shadow-gold-glow whitespace-nowrap"
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
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                boardDevices={getDevicesForBoard(board.id)}
                expandedBoards={expandedBoards}
                toggleBoard={toggleBoard}
                turnBoardDevicesOn={turnBoardDevicesOn}
                turnBoardDevicesOff={turnBoardDevicesOff}
                getFeedbackStatus={getFeedbackStatus}
                toggleDevice={toggleDevice}
                openFullEditBoard={openFullEditBoard}
              />
            ))}
          </div>
        )}
      </div>

      <AddBoardModal
        showAddBoardModal={showAddBoardModal}
        setShowAddBoardModal={setShowAddBoardModal}
        boardIdentifier={boardIdentifier}
        setBoardIdentifier={setBoardIdentifier}
        boardName={boardName}
        setBoardName={setBoardName}
        addBoard={addBoard}
        modalDragY={modalDragY}
        modalDragging={modalDragging}
        handleModalTouchStart={handleModalTouchStart}
        handleModalTouchMove={handleModalTouchMove}
        handleModalTouchEnd={handleModalTouchEnd}
      />

      <EditBoardModal
        showEditBoardModal={showEditBoardModal}
        setShowEditBoardModal={setShowEditBoardModal}
        editingBoardObj={editingBoardObj}
        editingBoardDevices={editingBoardObj ? getDevicesForBoard(editingBoardObj.id) : []}
        saveFullBoardEdit={saveFullBoardEdit}
        modalDragY={modalDragY}
        modalDragging={modalDragging}
        handleModalTouchStart={handleModalTouchStart}
        handleModalTouchMove={handleModalTouchMove}
        handleModalTouchEnd={handleModalTouchEnd}
      />

      <VoiceControl devices={devices} boards={boards} onToast={showToast} />
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
