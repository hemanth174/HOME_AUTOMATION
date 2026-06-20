'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Loader from '@/components/Loader';

export default function LogsPage() {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

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

  const handleClearLogs = async () => {
    const confirmed = window.confirm('Are you sure you want to clear all activity logs?');
    if (!confirmed) return;
    try {
      await supabase.from('activity_logs').delete().eq('user_id', user.id);
      setLogs([]);
      setToast('Logs cleared successfully');
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

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-accent text-[#0a0800] px-4 py-2 text-xs font-black shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
