'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { setLocalDeviceState, triggerLocalAll, fetchLocalDevices } from '@/lib/localApi';
import useLocalConnection from './useLocalConnection';

const LOCAL_STORAGE_BOARDS = 'home_auto_cached_boards';
const LOCAL_STORAGE_DEVICES = 'home_auto_cached_devices';
const LOCAL_STORAGE_PRESETS = 'home_auto_cached_presets';

export default function useDashboardData() {
  const [user, setUser] = useState(null);
  const [boards, setBoards] = useState([]);
  const [devices, setDevices] = useState([]);
  const [presets, setPresets] = useState([]);
  const [expandedBoards, setExpandedBoards] = useState({});
  const [loading, setLoading] = useState(true);
  const [isClientOnline, setIsClientOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const { isLocalConnected, leaderNode, localUrl, checkConnection } = useLocalConnection();

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsClientOnline(true);
    const handleOffline = () => setIsClientOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load offline cache on boot
  useEffect(() => {
    try {
      const cachedBoards = localStorage.getItem(LOCAL_STORAGE_BOARDS);
      const cachedDevices = localStorage.getItem(LOCAL_STORAGE_DEVICES);
      const cachedPresets = localStorage.getItem(LOCAL_STORAGE_PRESETS);

      if (cachedBoards) {
        const parsed = JSON.parse(cachedBoards);
        setBoards(parsed);
        const exp = {};
        parsed.forEach(b => { exp[b.id] = true; });
        setExpandedBoards(exp);
      }
      if (cachedDevices) setDevices(JSON.parse(cachedDevices));
      if (cachedPresets) setPresets(JSON.parse(cachedPresets));
    } catch (e) {
      console.warn('Failed to load local cache', e);
    }
  }, []);

  // Auth sync
  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (active && user) {
          setUser(user);
        }
      } catch (err) {
        console.warn('Auth check skipped:', err);
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user || null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Fetch cloud data when user is present
  useEffect(() => {
    if (!user) return;
    let active = true;

    const fetchData = async () => {
      const startTime = Date.now();
      try {
        const [boardsRes, devicesRes, presetsRes] = await Promise.all([
          supabase.from('boards').select('id, name, board_identifier, last_seen').eq('user_id', user.id).order('created_at'),
          supabase.from('devices').select('id, name, is_on, feedback_on, relay_index, board_id').eq('user_id', user.id).order('relay_index'),
          supabase.from('presets').select('id, name, actions').eq('user_id', user.id).order('created_at'),
        ]);

        if (!active) return;

        if (boardsRes.data) {
          setBoards(boardsRes.data);
          try { localStorage.setItem(LOCAL_STORAGE_BOARDS, JSON.stringify(boardsRes.data)); } catch {}
          const expanded = {};
          boardsRes.data.forEach(b => { expanded[b.id] = true; });
          setExpandedBoards(expanded);
        }

        if (devicesRes.data) {
          setDevices(devicesRes.data);
          try { localStorage.setItem(LOCAL_STORAGE_DEVICES, JSON.stringify(devicesRes.data)); } catch {}
        }

        if (presetsRes.data) {
          const parsedPresets = presetsRes.data.map(p => {
            let actions = p.actions;
            if (typeof actions === 'string') {
              try { actions = JSON.parse(actions); } catch(e) { actions = []; }
            }
            return { ...p, actions };
          });
          setPresets(parsedPresets);
          try { localStorage.setItem(LOCAL_STORAGE_PRESETS, JSON.stringify(parsedPresets)); } catch {}
        }
      } catch (err) {
        console.warn('Error fetching cloud data, relying on local state:', err);
      } finally {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 500 - elapsed);
        setTimeout(() => {
          if (active) setLoading(false);
        }, remaining);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    let isFirstConnect = true;

    const channel = supabase
      .channel('dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setDevices(prev => {
            const updated = prev.map(d => d.id === payload.new.id ? payload.new : d);
            try { localStorage.setItem(LOCAL_STORAGE_DEVICES, JSON.stringify(updated)); } catch {}
            return updated;
          });
        } else if (payload.eventType === 'INSERT') {
          setDevices(prev => {
            const updated = [...prev, payload.new];
            try { localStorage.setItem(LOCAL_STORAGE_DEVICES, JSON.stringify(updated)); } catch {}
            return updated;
          });
        } else if (payload.eventType === 'DELETE') {
          setDevices(prev => {
            const updated = prev.filter(d => d.id !== payload.old.id);
            try { localStorage.setItem(LOCAL_STORAGE_DEVICES, JSON.stringify(updated)); } catch {}
            return updated;
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presets', filter: `user_id=eq.${user.id}` }, (payload) => {
        let newPreset = payload.new;
        if (newPreset && typeof newPreset.actions === 'string') {
          try { newPreset.actions = JSON.parse(newPreset.actions); } catch(e) { newPreset.actions = []; }
        }
        if (payload.eventType === 'UPDATE') setPresets(prev => prev.map(p => p.id === newPreset.id ? newPreset : p));
        else if (payload.eventType === 'INSERT') setPresets(prev => [...prev, newPreset]);
        else if (payload.eventType === 'DELETE') setPresets(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'UPDATE') setBoards(prev => prev.map(b => b.id === payload.new.id ? payload.new : b));
        else if (payload.eventType === 'INSERT') setBoards(prev => [...prev, payload.new]);
        else if (payload.eventType === 'DELETE') setBoards(prev => prev.filter(b => b.id !== payload.old.id));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (isFirstConnect) {
            isFirstConnect = false;
          } else {
            // Background silent refetch on reconnect
            const [boardsRes, devicesRes, presetsRes] = await Promise.all([
              supabase.from('boards').select('id, name, board_identifier, last_seen').eq('user_id', user.id).order('created_at'),
              supabase.from('devices').select('id, name, is_on, feedback_on, relay_index, board_id').eq('user_id', user.id).order('relay_index'),
              supabase.from('presets').select('id, name, actions').eq('user_id', user.id).order('created_at'),
            ]);
            if (boardsRes.data) setBoards(boardsRes.data);
            if (devicesRes.data) setDevices(devicesRes.data);
            if (presetsRes.data) {
              setPresets(presetsRes.data.map(p => {
                let actions = p.actions;
                if (typeof actions === 'string') {
                  try { actions = JSON.parse(actions); } catch(e) { actions = []; }
                }
                return { ...p, actions };
              }));
            }
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  /**
   * Dual-Plane Device Controller:
   * 1. If Local ESP32 connected -> dispatches directly to local REST endpoint immediately (sub-100ms response).
   * 2. Optimistically updates UI state.
   * 3. Syncs to Supabase in background if internet is active.
   */
  const controlDevice = useCallback(async (device, targetState, triggeredBy = 'Manual Web Dashboard') => {
    const newState = targetState !== undefined ? Boolean(targetState) : !device.is_on;
    const relayIndex = device.relay_index ?? 0;

    // 1. Optimistic UI update
    setDevices(prev => {
      const updated = prev.map(d => d.id === device.id ? { ...d, is_on: newState, _lastSource: isLocalConnected ? 'local' : 'cloud' } : d);
      try { localStorage.setItem(LOCAL_STORAGE_DEVICES, JSON.stringify(updated)); } catch {}
      return updated;
    });

    let localDispatched = false;

    // 2. Try Local REST API if connected to ESP32 SoftAP/LAN
    if (isLocalConnected) {
      try {
        await setLocalDeviceState(relayIndex, newState);
        localDispatched = true;
      } catch (err) {
        console.warn('Local REST dispatch failed, falling back to cloud:', err);
      }
    }

    // 3. Sync to Supabase if internet / session is available
    if (user && isClientOnline) {
      try {
        await supabase
          .from('devices')
          .update({ is_on: newState, last_changed: new Date().toISOString() })
          .eq('id', device.id);

        await supabase.from('activity_logs').insert({
          user_id: user.id,
          device_id: device.id,
          device_name: device.name,
          action: newState ? 'turned ON' : 'turned OFF',
          triggered_by: localDispatched ? `${triggeredBy} (via ESP32 Local Mesh)` : triggeredBy
        });
      } catch (err) {
        console.warn('Supabase sync background error:', err);
      }
    }

    return { success: true, localDispatched, newState };
  }, [isLocalConnected, user, isClientOnline]);

  /**
   * Dual-Plane Bulk Switch (All ON / All OFF)
   */
  const controlAll = useCallback(async (action, triggeredBy = 'Global') => {
    const targetState = action === 'on';

    // 1. Optimistic UI update
    setDevices(prev => {
      const updated = prev.map(d => ({ ...d, is_on: targetState, _lastSource: isLocalConnected ? 'local' : 'cloud' }));
      try { localStorage.setItem(LOCAL_STORAGE_DEVICES, JSON.stringify(updated)); } catch {}
      return updated;
    });

    let localDispatched = false;

    // 2. Local REST trigger
    if (isLocalConnected) {
      try {
        await triggerLocalAll(action);
        localDispatched = true;
      } catch (err) {
        console.warn('Local trigger all failed:', err);
      }
    }

    // 3. Cloud update
    if (user && isClientOnline) {
      try {
        await Promise.all(devices.map(d =>
          supabase.from('devices').update({ is_on: targetState, last_changed: new Date().toISOString() }).eq('id', d.id)
        ));

        await supabase.from('activity_logs').insert({
          user_id: user.id,
          device_id: null,
          device_name: 'All Devices',
          action: targetState ? 'turned ON' : 'turned OFF',
          triggered_by: localDispatched ? `${triggeredBy} All (via ESP32 Local Mesh)` : `${triggeredBy} All`
        });
      } catch (err) {
        console.warn('Supabase global sync error:', err);
      }
    }
  }, [isLocalConnected, user, isClientOnline, devices]);

  return {
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
    setLoading,
    isClientOnline,
    isLocalConnected,
    leaderNode,
    localUrl,
    checkLocalConnection: checkConnection,
    controlDevice,
    controlAll
  };
}
