'use client';

import { useState, useEffect, useMemo } from 'react';
import { RotateCcw, ScrollText, Search, SlidersHorizontal, X } from 'lucide-react';
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
  const [boardFilter, setBoardFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState('');

  // Modal confirm state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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
          .eq('user_id', user.id)
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
          setLogs((prev) => [
            payload.new,
            ...prev.filter((log) => log.id !== payload.new.id),
          ].slice(0, 100));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'activity_logs',
        },
        (payload) => {
          if (payload.old?.id) {
            setLogs((prev) => prev.filter((log) => log.id !== payload.old.id));
          } else {
            // When replica identity omits the deleted row ID, reload the current user's list.
            void supabase
              .from('activity_logs')
              .select('id, created_at, action, device_name, triggered_by, device_id')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(100)
              .then(({ data, error }) => {
                if (!error && data) setLogs(data);
              });
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const handleClearLogs = () => {
    setShowConfirmModal(true);
  };

  const executeClearLogs = async () => {
    try {
      const { error } = await supabase.from('activity_logs').delete().eq('user_id', user.id);
      if (error) throw error;
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

  const getLogState = (log) => {
    const action = String(log.action || '').toLowerCase();
    return action.includes('on') || action.includes('activate') ? 'on' : 'off';
  };

  const filterOptions = useMemo(() => {
    const boardIds = new Set();
    const deviceIds = new Set();
    const sources = new Set();

    logs.forEach((log) => {
      boardIds.add(getBoardIdentifier(log));
      if (log.device_id) deviceIds.add(String(log.device_id));
      sources.add(getTriggerSource(log.triggered_by));
    });

    return {
      boardIds: [...boardIds].sort(),
      deviceIds: [...deviceIds].sort((a, b) => {
        const deviceA = devices.find((device) => String(device.id) === a);
        const deviceB = devices.find((device) => String(device.id) === b);
        return (deviceA?.name || a).localeCompare(deviceB?.name || b);
      }),
      sources: [...sources].sort(),
    };
  }, [logs, boards, devices]);

  const resetFilters = () => {
    setSearch('');
    setBoardFilter('all');
    setDeviceFilter('all');
    setSourceFilter('all');
    setStateFilter('all');
    setDateFilter('all');
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
    boardFilter !== 'all' ||
    deviceFilter !== 'all' ||
    sourceFilter !== 'all' ||
    stateFilter !== 'all' ||
    dateFilter !== 'all',
  );

  const filteredLogs = useMemo(() => {
    const term = search.toLowerCase().trim();
    const now = Date.now();
    const dateCutoff =
      dateFilter === 'today'
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : dateFilter === '7'
          ? now - 7 * 24 * 60 * 60 * 1000
          : dateFilter === '30'
            ? now - 30 * 24 * 60 * 60 * 1000
            : null;

    return logs.filter((log) => {
      const boardIdVal = getBoardIdentifier(log).toLowerCase();
      const triggerSource = getTriggerSource(log.triggered_by).toLowerCase();
      const stateVal = getLogState(log);
      const createdAt = new Date(log.created_at).getTime();
      const matchesSearch = !term || (
        (log.device_name || '').toLowerCase().includes(term) ||
        (log.action || '').toLowerCase().includes(term) ||
        (log.triggered_by || '').toLowerCase().includes(term) ||
        boardIdVal.includes(term) ||
        triggerSource.includes(term) ||
        stateVal === term
      );
      return (
        matchesSearch &&
        (boardFilter === 'all' || getBoardIdentifier(log) === boardFilter) &&
        (deviceFilter === 'all' || String(log.device_id || '') === deviceFilter) &&
        (sourceFilter === 'all' || getTriggerSource(log.triggered_by) === sourceFilter) &&
        (stateFilter === 'all' || stateVal === stateFilter) &&
        (dateCutoff === null || createdAt >= dateCutoff)
      );
    });
  }, [logs, search, boardFilter, deviceFilter, sourceFilter, stateFilter, dateFilter, boards, devices]);

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
      <div className="mb-4 flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search logs</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="min-h-11 w-full rounded-xl border border-border bg-input py-2 pl-9 pr-3 text-base font-bold text-text outline-0 transition-colors placeholder:text-text-muted focus:border-accent sm:min-h-10 sm:text-xs"
            placeholder="Search device, action, board, or source"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[10px] font-black uppercase tracking-wider text-text transition-colors hover:border-accent hover:text-accent sm:min-h-10 sm:px-4"
          aria-label="Open log filters"
        >
          <SlidersHorizontal size={15} />
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilters && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] text-[var(--btn-text)]">
              {filteredLogs.length}/{logs.length}
            </span>
          )}
        </button>
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
                {hasActiveFilters ? 'No Matches Found' : 'No Activity Logs'}
              </h3>
              <p className="text-xs text-text-muted font-semibold leading-relaxed">
                  {hasActiveFilters
                    ? 'We couldn\'t find any logs matching your filter query. Try searching another term.'
                  : 'Historical events and relay triggers will be shown here. Logs older than 7 days are automatically cleared.'}
              </p>
            </div>
          </div>
        ) : (
          <>
          <div className="divide-y divide-border/30 sm:hidden">
            {filteredLogs.map((log) => {
              const isActionOn = log.action?.toLowerCase().includes('on') || log.action?.toLowerCase().includes('activate');
              return (
                <article key={log.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-text">{log.device_name || 'Device'}</p>
                    <p className="truncate text-[11px] font-semibold text-text-muted mt-1">{getBoardIdentifier(log)} · {getTriggerSource(log.triggered_by)}</p>
                    <p className="text-[10px] font-semibold text-text-muted mt-1">{formatLogTime(log.created_at)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${isActionOn ? 'bg-accent text-[var(--btn-text)]' : 'bg-border text-text-muted'}`}>
                    {isActionOn ? 'ON' : 'OFF'}
                  </span>
                </article>
              );
            })}
          </div>
          <div className="hidden w-full overflow-x-auto sm:block">
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
          </>
        )}
      </div>
    </div>

      <Toast message={toast} onClose={() => setToast('')} />

      {showFilters && (
        <div
          className="fixed inset-0 z-[1050] flex items-end justify-center bg-black/65 backdrop-blur-sm md:items-stretch md:justify-end"
          onClick={() => setShowFilters(false)}
        >
          <div className="absolute inset-0" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-filters-title"
            className="relative z-10 flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[24px] border border-border bg-card shadow-2xl max-md:max-h-[88svh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 md:h-full md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-r-0"
            onClick={(event) => event.stopPropagation()}
          >
            <div data-sheet-drag-zone="1" className="shrink-0 touch-none">
              <div
                data-sheet-handle="1"
                className="mx-auto mt-2.5 flex h-7 w-20 cursor-grab items-start justify-center active:cursor-grabbing md:hidden"
                aria-label="Drag down to close filters"
              >
                <span className="mt-1.5 h-1 w-12 rounded-full bg-border" />
              </div>
              <header className="flex items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Activity logs</p>
                  <h2 id="log-filters-title" className="mt-1 text-lg font-black text-text">Filter activity</h2>
                </div>
                <button
                  type="button"
                  data-sheet-close="1"
                  onClick={() => setShowFilters(false)}
                  aria-label="Close filters"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:text-text"
                >
                  <X size={16} />
                </button>
              </header>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Board</span>
                  <select
                    value={boardFilter}
                    onChange={(e) => setBoardFilter(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-border bg-input px-3 py-2 text-base font-bold text-text outline-0 focus:border-accent sm:text-sm"
                  >
                    <option value="all">All boards</option>
                    {filterOptions.boardIds.map((boardId) => {
                      const board = boards.find((item) => item.board_identifier === boardId);
                      return (
                        <option key={boardId} value={boardId}>
                          {board?.name ? `${board.name} · ${boardId}` : boardId}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Device</span>
                  <select
                    value={deviceFilter}
                    onChange={(e) => setDeviceFilter(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-border bg-input px-3 py-2 text-base font-bold text-text outline-0 focus:border-accent sm:text-sm"
                  >
                    <option value="all">All devices</option>
                    {filterOptions.deviceIds.map((deviceId) => {
                      const device = devices.find((item) => String(item.id) === deviceId);
                      return (
                        <option key={deviceId} value={deviceId}>
                          {device?.name || 'Unknown device'}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Trigger source</span>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-border bg-input px-3 py-2 text-base font-bold text-text outline-0 focus:border-accent sm:text-sm"
                  >
                    <option value="all">All sources</option>
                    {filterOptions.sources.map((source) => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">State</span>
                    <select
                      value={stateFilter}
                      onChange={(e) => setStateFilter(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-border bg-input px-3 py-2 text-base font-bold text-text outline-0 focus:border-accent sm:text-sm"
                    >
                      <option value="all">All states</option>
                      <option value="on">ON only</option>
                      <option value="off">OFF only</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Date range</span>
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-border bg-input px-3 py-2 text-base font-bold text-text outline-0 focus:border-accent sm:text-sm"
                    >
                      <option value="all">Any time</option>
                      <option value="today">Today</option>
                      <option value="7">Last 7 days</option>
                      <option value="30">Last 30 days</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-between sm:p-5">
              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-xs font-black text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={14} />
                Reset filters
              </button>
              <button
                type="button"
                data-sheet-close="1"
                onClick={() => setShowFilters(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-xs font-black text-[var(--btn-text)] transition-opacity hover:opacity-90"
              >
                Apply filters
              </button>
            </footer>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-[22px] backdrop-blur-md animate-scale-in max-md:items-end max-md:p-0" onClick={() => setShowConfirmModal(false)}>
          <div 
            className="max-h-[82vh] w-[min(100%,420px)] overflow-auto rounded-[18px] border border-border bg-card p-6 shadow-2xl backdrop-blur-xl animate-fade-up max-md:w-full max-md:max-h-[85vh] max-md:rounded-t-[24px] max-md:rounded-b-none max-md:border-t max-md:border-x-0 max-md:border-b-0 max-md:pb-24 max-md:animate-slide-up max-md:shadow-none flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div data-sheet-drag-zone="1" className="shrink-0 touch-none">
              <div data-sheet-handle="1" className="hidden max-md:block w-12 h-1 cursor-grab touch-none bg-border rounded-full mx-auto mb-5 shrink-0 active:cursor-grabbing" />
              <h2 className="mb-2 text-lg font-extrabold text-text">Clear Activity Logs</h2>
              <p className="text-xs text-text-muted mb-6 leading-relaxed font-semibold">
                Are you sure you want to clear all activity logs? This action cannot be undone and will delete all local history.
              </p>
            </div>
            <div className="flex justify-end gap-2.5 max-md:w-full max-md:flex-col-reverse">
              <button
                type="button"
                data-sheet-close="1"
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
