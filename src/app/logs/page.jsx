'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Loader from '@/components/Loader';
import Toast from '@/components/Toast';

export default function LogsPage() {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
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

        const { data } = await supabase
          .from('activity_logs')
          .select('id, created_at, action, device_name, triggered_by')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (active && data) setLogs(data);
      } catch (err) {
        console.warn('Logs table might not exist yet:', err);
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 2000 - elapsed);
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

  const filteredLogs = logs.filter(log => {
    const term = search.toLowerCase();
    return (
      (log.device_name || '').toLowerCase().includes(term) ||
      (log.action || '').toLowerCase().includes(term) ||
      (log.triggered_by || '').toLowerCase().includes(term)
    );
  });

  if (loading) {
    return <Loader message="Loading activity logs..." />;
  }

  return (
    <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px]">
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
          <div className="text-center py-12 text-xs font-semibold text-text-muted">
            {search ? 'No matches found for your filter.' : 'No activity logged yet.'}
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredLogs.map((log) => {
              const date = new Date(log.created_at);
              const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const formattedDate = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
              const isActionOn = log.action?.toLowerCase().includes('on') || log.action?.toLowerCase().includes('activate');

              return (
                <div key={log.id} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-white/[0.01] transition-colors max-sm:flex-col max-sm:items-start max-sm:gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${isActionOn ? 'bg-accent shadow-gold-glow animate-pulse' : 'bg-text-muted/40'}`} />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-text truncate max-w-[150px]">{log.device_name || 'Device'}</span>
                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide ${isActionOn ? 'text-accent bg-accent-bg border border-accent/15' : 'text-text-muted bg-input border border-border/40'}`}>
                          {log.action}
                        </span>
                      </div>
                      <span className="text-[10px] text-text-muted mt-1 font-bold">
                        Triggered via: <span className="text-text/80">{log.triggered_by}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right text-[10px] font-extrabold text-text-muted shrink-0 max-sm:text-left">
                    {formattedDate} at {formattedTime}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
            className="max-h-[82vh] w-[min(100%,420px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl backdrop-blur-xl animate-fade-up max-md:w-full max-md:max-h-[85vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-10 max-md:animate-slide-up max-md:shadow-none flex flex-col"
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
    </div>
  );
}
