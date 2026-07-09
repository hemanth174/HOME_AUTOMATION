'use client';

import { useState, useEffect, useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Loader from '@/components/Loader';
import Toast from '@/components/Toast';

export default function LogsPage() {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [boards, setBoards] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  // Modal confirm and drag state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
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
      setShowConfirmModal(false);
    }
    setModalDragY(0);
  };

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      setUser(user);
    };
    checkAuth();
  }, []);

  // Fetch logs
  useEffect(() => {
    if (!user) return;
    let active = true;

    const fetchLogs = async () => {
      const startTime = Date.now();
      try {
        // Delete logs older than 7 days (does not affect analytics)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('activity_logs')
          .delete()
          .lt('created_at', sevenDaysAgo);

        const [logsRes, boardsRes, devicesRes] = await Promise.all([
          supabase
            .from('activity_logs')
            .select('id, created_at, action, device_name, triggered_by, device_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('boards')
            .select('id, name, board_identifier')
            .eq('user_id', user.id),
          supabase
            .from('devices')
            .select('id, name, board_id')
            .eq('user_id', user.id)
        ]);

        if (active) {
          if (logsRes.data) setLogs(logsRes.data);
          if (boardsRes.data) setBoards(boardsRes.data);
          if (devicesRes.data) setDevices(devicesRes.data);
        }
      } catch (err) {
        console.warn('Logs table might not exist yet:', err);
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 500 - elapsed);
      setTimeout(() => {
        if (active) setLoading(false);
      }, remaining);
    };

    fetchLogs();

    return () => {
      active = false;
    };
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('activity-logs-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          setLogs(prev => [payload.new, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const handleClearLogs = () => {
    setModalDragY(0);
    setShowConfirmModal(true);
  };

  const executeClearLogs = async () => {
    try {
      await supabase.from('activity_logs').delete().eq('user_id', user.id);
      setLogs([]);
      setToast('Logs cleared successfully');
      setShowConfirmModal(false);
    } catch (e) {
      setToast('Failed to clear logs');
    }
  };

  const getBoardIdentifier = (log) => {
    if (!log.device_id) return 'board_main';
    const device = devices.find(d => d.id === log.device_id);
    if (!device) return 'board_main';
    const board = boards.find(b => b.id === device.board_id);
    return board ? board.board_identifier : 'board_main';
  };

  const getTriggerSource = (triggered_by) => {
    if (!triggered_by) return 'Manual';
    const lower = triggered_by.toLowerCase();
    if (lower.includes('manual') || lower.includes('web dashboard') || lower.includes('override')) return 'Manual';
    if (lower.includes('schedule')) return 'Schedule';
    if (lower.includes('alarm')) return 'Alarm';
    if (lower.includes('preset')) return 'Preset';
    if (lower.includes('voice') || lower.includes('alexa') || lower.includes('google')) return 'Voice';
    if (lower.includes('testing')) return 'Testing';
    return triggered_by;
  };

  const getOrdinalSuffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1:  return 'st';
      case 2:  return 'nd';
      case 3:  return 'rd';
      default: return 'th';
    }
  };

  const formatLogTime = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString([], { month: 'short' });
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = String(hours % 12 || 12).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    return `${day}${getOrdinalSuffix(day)} ${month} ${formattedHours}:${formattedMinutes}:${formattedSeconds} ${ampm}`;
  };

  const filteredLogs = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return logs;
    return logs.filter(log => {
      const boardIdVal = getBoardIdentifier(log).toLowerCase();
      const triggerSource = getTriggerSource(log.triggered_by).toLowerCase();
      const stateVal = (log.action?.toLowerCase().includes('on') || log.action?.toLowerCase().includes('activate')) ? 'on' : 'off';
      return (
        (log.device_name || '').toLowerCase().includes(term) ||
        (log.action || '').toLowerCase().includes(term) ||
        (log.triggered_by || '').toLowerCase().includes(term) ||
        boardIdVal.includes(term) ||
        triggerSource.includes(term) ||
        stateVal === term
      );
    });
  }, [logs, search, boards, devices]);

  if (loading) {
    return <Loader message="Loading activity logs..." />;
  }

  return (
    <>
      <div className="dashboard-container animate-fade-up">
      {/* Header */}
      <div className="ml-1 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-black uppercase tracking-wider text-text">Activity Logs</h1>
          <span className="text-xs font-bold text-text-muted">A history of state changes and triggers across your home.</span>
        </div>

        {logs.length > 0 && (
          <button
            onClick={handleClearLogs}
            className="py-1.5 px-3 border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
          >
            Clear All Logs
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="mb-4">
        <input
          className="w-full rounded-xl border border-border bg-input px-4 py-2 text-xs font-bold text-text outline-0 focus:border-accent"
          placeholder="Filter logs by device name, action, or source..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Logs Container */}
      <div className="border border-border bg-card rounded-2xl shadow-lg overflow-hidden max-h-[600px] overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center select-none gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow">
              <ScrollText size={24} className="stroke-[2.5px]" />
            </div>
            <div className="flex flex-col gap-1 max-w-xs mx-auto">
              <h3 className="text-sm font-extrabold text-text tracking-tight">
                {search ? 'No Matches Found' : 'No Activity Logs'}
              </h3>
              <p className="text-xs text-text-muted font-semibold leading-relaxed">
                {search 
                  ? 'We couldn\'t find any logs matching your filter query. Try searching another term.' 
                  : 'Historical events and relay triggers will be shown here. Logs older than 7 days are automatically cleared.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-border/40 text-text-muted text-[10px] uppercase tracking-wider font-extrabold select-none">
                  <th className="py-4 px-6 font-extrabold">board_id</th>
                  <th className="py-4 px-6 font-extrabold">device name</th>
                  <th className="py-4 px-6 font-extrabold">time</th>
                  <th className="py-4 px-6 font-extrabold text-right">state</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-xs font-semibold text-text">
                {filteredLogs.map((log) => {
                  const isActionOn = log.action?.toLowerCase().includes('on') || log.action?.toLowerCase().includes('activate');
                  const boardIdentifier = getBoardIdentifier(log);
                  const triggerSource = getTriggerSource(log.triggered_by);
                  
                  return (
                    <tr key={log.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="py-3.5 px-6 font-mono text-[11px] text-text-muted">
                        {boardIdentifier}
                      </td>
                      <td className="py-3.5 px-6 font-bold">
                        <span className="text-text">{log.device_name || 'Device'}</span>
                        <span className="text-text-muted font-bold text-[10px] ml-1.5">
                          ({triggerSource})
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-text-muted font-bold">
                        {formatLogTime(log.created_at)}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <span 
                          className={`inline-flex items-center justify-center min-w-[54px] py-1 px-3 rounded-full text-[9px] font-black uppercase tracking-wider select-none ${
                            isActionOn 
                              ? 'bg-accent text-[var(--btn-text)] shadow-gold-glow font-black' 
                              : 'bg-border text-text-muted'
                          }`}
                        >
                          {isActionOn ? 'ON' : 'OFF'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    <Toast message={toast} onClose={() => setToast('')} />

      {showConfirmModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0" onClick={() => setShowConfirmModal(false)}>
          <div 
            onTouchStart={handleModalTouchStart}
            onTouchMove={handleModalTouchMove}
            onTouchEnd={handleModalTouchEnd}
            style={{
              transform: `translateY(${modalDragY}px)`,
              transition: modalDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            className="max-h-[82vh] w-[min(100%,420px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl backdrop-blur-xl animate-fade-up max-md:w-full max-md:max-h-[85vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-24 max-md:animate-slide-up max-md:shadow-none flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle for Mobile */}
            <div className="hidden max-md:block w-12 h-1 bg-border rounded-full mx-auto mb-5 shrink-0" />
            <h2 className="mb-2 text-lg font-extrabold text-text">Clear Activity Logs</h2>
            <p className="text-xs text-text-muted mb-6 leading-relaxed font-semibold">
              Are you sure you want to clear all activity logs? This action cannot be undone and will delete all local history.
            </p>
            <div className="flex justify-end gap-2.5 max-md:w-full max-md:flex-col-reverse">
              <button
                type="button"
                className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-text transition-all hover:bg-card-alt cursor-pointer max-md:w-full"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-5 py-2 text-xs font-extrabold hover:bg-red-700 cursor-pointer shadow-[0_4px_12px_rgba(220,38,38,0.2)] max-md:w-full"
                onClick={executeClearLogs}
              >
                Clear Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
