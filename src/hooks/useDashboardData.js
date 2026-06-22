'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function useDashboardData() {
  const [user, setUser] = useState(null);
  const [boards, setBoards] = useState([]);
  const [devices, setDevices] = useState([]);
  const [presets, setPresets] = useState([]);
  const [expandedBoards, setExpandedBoards] = useState({});
  const [loading, setLoading] = useState(true);

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
      if (presetsRes.data) {
        setPresets(presetsRes.data.map(p => {
          let actions = p.actions;
          if (typeof actions === 'string') {
            try { actions = JSON.parse(actions); } catch(e) { actions = []; }
          }
          return { ...p, actions };
        }));
      }

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

    let isFirstConnect = true;

    const channel = supabase
      .channel('dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'UPDATE') setDevices(prev => prev.map(d => d.id === payload.new.id ? payload.new : d));
        else if (payload.eventType === 'INSERT') setDevices(prev => [...prev, payload.new]);
        else if (payload.eventType === 'DELETE') setDevices(prev => prev.filter(d => d.id !== payload.old.id));
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
            console.log('Reconnected to Supabase Realtime. Resyncing state...');
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
    setLoading
  };
}
