'use client';

import AppSelect from '@/components/AppSelect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Headset, LockKeyhole, LockKeyholeOpen, MessageSquare, Plus, RefreshCw, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showAdminToast } from '@/lib/adminToast';

const STATUS = {
  open: ['Open', 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300'],
  in_progress: ['In progress', 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'],
  waiting_customer: ['Waiting for customer', 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300'],
  resolved: ['Resolved', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'],
};

function StatusPill({ value }) {
  const [label, tone] = STATUS[value] || STATUS.open;
  return <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${tone}`}>{label}</span>;
}

export default function SupportDesk({ staffMode = false, mainAdmin = false, canCreate = mainAdmin, canDelete = mainAdmin }) {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lockedId, setLockedId] = useState(null);
  const [lockedDeleted, setLockedDeleted] = useState(false);
  const [detail, setDetail] = useState(null);
  const [viewerId, setViewerId] = useState(null);
  const [viewReady, setViewReady] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState({ customer: false, staff: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (staffMode && error) showAdminToast(error, 'error'); }, [staffMode, error]);
  useEffect(() => { if (staffMode && notice) showAdminToast(notice, 'success'); }, [staffMode, notice]);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [selfEmail, setSelfEmail] = useState('');
  const typingHeartbeatAt = useRef(0);
  const typingIdleTimer = useRef(null);
  const storageKey = viewerId ? `vikatech:support:${viewerId}:${staffMode ? 'staff' : 'customer'}` : null;

  useEffect(() => {
    let active = true;
    const restoreView = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session?.user?.id) { setViewReady(true); return; }
      const key = `vikatech:support:${session.user.id}:${staffMode ? 'staff' : 'customer'}`;
      let saved = {};
      try { saved = JSON.parse(window.localStorage.getItem(key) || '{}') || {}; } catch {}
      const pinned = typeof saved.lockedId === 'string' ? saved.lockedId : null;
      try { window.sessionStorage.removeItem(`${key}:open`); } catch {}
      const deletedView = canDelete && saved.showDeleted === true;
      setViewerId(session.user.id);
      setLockedId(pinned);
      setLockedDeleted(saved.lockedDeleted === true);
      setSelectedId(pinned && saved.lockedDeleted === deletedView ? pinned : null);
      setShowDeleted(deletedView);
      setSearch(typeof saved.search === 'string' ? saved.search : '');
      setStatusFilter(typeof saved.statusFilter === 'string' ? saved.statusFilter : 'all');
      setCategoryFilter(typeof saved.categoryFilter === 'string' ? saved.categoryFilter : 'all');
      setAssignmentFilter(typeof saved.assignmentFilter === 'string' ? saved.assignmentFilter : 'all');
      setViewReady(true);
    };
    void restoreView();
    return () => { active = false; };
  }, [staffMode, mainAdmin, canDelete]);

  useEffect(() => {
    if (!viewReady || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ lockedId, lockedDeleted, showDeleted, search, statusFilter, categoryFilter, assignmentFilter }));
    } catch {}
  }, [viewReady, storageKey, lockedId, lockedDeleted, showDeleted, search, statusFilter, categoryFilter, assignmentFilter]);

  const api = useCallback(async (path, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Please sign in again');
    const response = await fetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...options.headers },
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  }, []);

  const loadTickets = useCallback(async (silent = false) => {
    if (!viewReady) return;
    if (!silent) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSelfEmail(session?.user?.email || '');
      const result = await api(`/api/support/tickets${showDeleted && canDelete ? '?scope=deleted' : staffMode ? '?scope=staff' : ''}`);
      setTickets(result.tickets || []);
      setError('');
    } catch (failure) { setError(failure.message); }
    finally { if (!silent) setLoading(false); }
  }, [api, staffMode, canDelete, showDeleted, viewReady]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    try {
      const result = await api(`/api/support/tickets/${id}`);
      setDetail(result);
      setError('');
    } catch (failure) {
      if (failure.message === 'Ticket not found') {
        setSelectedId((current) => current === id ? null : current);
        setLockedId((current) => current === id ? null : current);
        setDetail(null);
      } else setError(failure.message);
    }
  }, [api]);

  useEffect(() => { void loadTickets(); }, [loadTickets]);
  useEffect(() => { if (viewReady) void loadDetail(selectedId); }, [selectedId, showDeleted, loadDetail, viewReady]);
  const sendTyping = useCallback((id, typing) => {
    if (!id) return;
    if (typing) {
      if (Date.now() - typingHeartbeatAt.current < 2_500) return;
      typingHeartbeatAt.current = Date.now();
    } else {
      typingHeartbeatAt.current = 0;
    }
    void api(`/api/support/tickets/${id}/typing`, {
      method: 'POST', body: JSON.stringify({ typing }),
    }).catch(() => {});
  }, [api]);

  useEffect(() => {
    setReply('');
    setRemoteTyping({ customer: false, staff: false });
    typingHeartbeatAt.current = 0;
    if (!selectedId || showDeleted) return undefined;
    let active = true;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const state = await api(`/api/support/tickets/${selectedId}/typing`);
        if (active) setRemoteTyping(state);
      } catch { if (active) setRemoteTyping({ customer: false, staff: false }); }
    };
    void poll();
    const timer = window.setInterval(poll, 2_500);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearTimeout(typingIdleTimer.current);
      if (typingHeartbeatAt.current) sendTyping(selectedId, false);
    };
  }, [selectedId, showDeleted, api, sendTyping]);

  const onReplyChange = (event) => {
    const next = event.target.value;
    setReply(next);
    window.clearTimeout(typingIdleTimer.current);
    if (next.trim()) {
      sendTyping(selectedId, true);
      typingIdleTimer.current = window.setTimeout(() => sendTyping(selectedId, false), 1_800);
    } else {
      sendTyping(selectedId, false);
    }
  };
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadTickets(true);
      if (selectedId) void loadDetail(selectedId);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadTickets, loadDetail, selectedId]);

  const createTicket = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await api(staffMode ? '/api/support/tickets?scope=staff' : '/api/support/tickets', { method: 'POST', body: JSON.stringify({ subject, category, message }) });
      setComposing(false); setSubject(''); setMessage(''); setCategory('general');
      setSelectedId(result.ticket.id); setNotice('Ticket created. Support can now reply.'); setError('');
      await loadTickets();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!selectedId || busy || !reply.trim()) return;
    setBusy(true);
    try {
      window.clearTimeout(typingIdleTimer.current);
      sendTyping(selectedId, false);
      await api(`/api/support/tickets/${selectedId}`, { method: 'POST', body: JSON.stringify({ message: reply }) });
      setReply(''); setNotice('Reply sent.'); setError('');
      await Promise.all([loadDetail(selectedId), loadTickets()]);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const updateTicket = async (change) => {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      await api(`/api/support/tickets/${selectedId}`, { method: 'PATCH', body: JSON.stringify(change) });
      setNotice('Ticket updated.'); setError('');
      await Promise.all([loadDetail(selectedId), loadTickets()]);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const deleteTicket = async () => {
    if (!canDelete || !selectedId || busy) return;
    setBusy(true);
    try {
      await api(`/api/support/tickets/${selectedId}`, { method: 'DELETE' });
      setLockedId((current) => current === selectedId ? null : current);
      setSelectedId(null); setDetail(null); setConfirmDelete(false);
      setNotice('Ticket moved to Deleted tickets. It can be restored for 30 days.'); setError('');
      await loadTickets();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const restoreTicket = async () => {
    if (!canDelete || !selectedId || busy) return;
    setBusy(true);
    try {
      await api(`/api/support/tickets/${selectedId}`, { method: 'PATCH', body: JSON.stringify({ restore: true }) });
      if (lockedId === selectedId) setLockedDeleted(false);
      setShowDeleted(false); setDetail(null);
      setNotice('Ticket restored to the support queue.'); setError('');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const toggleLock = (ticket) => {
    const isLocked = lockedId === ticket.id && lockedDeleted === showDeleted;
    const nextLockedId = isLocked ? null : ticket.id;
    if (storageKey) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}') || {};
        window.localStorage.setItem(storageKey, JSON.stringify({ ...saved, lockedId: nextLockedId, lockedDeleted: showDeleted }));
        window.sessionStorage.removeItem(`${storageKey}:open`);
      } catch {}
    }
    setLockedId(nextLockedId);
    setLockedDeleted(showDeleted);
    setComposing(false);
    setSelectedId(ticket.id);
  };

  const visibleTickets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesText = !needle || [ticket.subject, ticket.customer_email, ticket.category, ticket.status, ticket.id]
        .some((part) => String(part || '').toLowerCase().includes(needle));
      const matchesStatus = showDeleted || statusFilter === 'all' || ticket.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || ticket.category === categoryFilter;
      const matchesAssignment = !staffMode || showDeleted || assignmentFilter === 'all'
        || (assignmentFilter === 'mine' && ticket.assigned_to?.toLowerCase() === selfEmail.toLowerCase())
        || (assignmentFilter === 'unassigned' && !ticket.assigned_to);
      return matchesText && matchesStatus && matchesCategory && matchesAssignment;
    });
  }, [tickets, search, statusFilter, categoryFilter, assignmentFilter, staffMode, showDeleted, selfEmail]);

  const selected = detail?.ticket?.id === selectedId ? detail.ticket : tickets.find((item) => item.id === selectedId);
  const typingLabel = remoteTyping.customer ? 'Customer is typing' : remoteTyping.staff ? 'VikaTech support is typing' : '';

  return <section className="space-y-4 text-text">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">{staffMode ? 'Support queue' : 'Your support'}</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-black sm:text-2xl"><Headset size={22} className="text-accent" /> Support tickets</h2>
        <p className="mt-1 text-xs font-medium text-text-muted">{staffMode ? mainAdmin ? 'Open an issue, reply to customers, and track each request through resolution.' : 'Reply to customers and track each request through resolution.' : 'Ask for help and follow every reply in one place.'}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => loadTickets()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold hover:border-accent/50 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        {canDelete && <button type="button" onClick={() => { setShowDeleted((value) => !value); setSelectedId(null); setDetail(null); setConfirmDelete(false); }} aria-pressed={showDeleted} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${showDeleted ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300' : 'border-border bg-card text-text hover:border-red-500/40'}`}><Trash2 size={14} /> {showDeleted ? 'Active tickets' : 'Deleted tickets'}</button>}
        {(!staffMode || canCreate) && <button type="button" onClick={() => { setShowDeleted(false); setComposing(true); setSelectedId(null); setDetail(null); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-3 text-xs font-black text-[var(--btn-text)]"><Plus size={15} /> New ticket</button>}
      </div>
    </div>
    {!staffMode && error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-600 dark:text-red-300">{error}</div>}
    {!staffMode && notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{notice}</div>}

    <div className="grid min-h-[480px] gap-4 md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
      <div className={`${selectedId || composing ? 'hidden md:block' : ''} min-w-0 overflow-hidden rounded-2xl border border-border bg-card`}>
        <div className="border-b border-border px-4 py-3 text-xs font-black">{showDeleted ? 'Deleted tickets' : staffMode ? 'All customer requests' : 'My requests'} <span className="ml-1 text-text-muted">{visibleTickets.length}/{tickets.length}</span></div>
        <div className="space-y-2 border-b border-border p-3">
          <label className="relative block"><span className="sr-only">Search tickets</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cases or email" className="min-h-10 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs text-text outline-none focus:border-accent" /></label>
          <div className="grid grid-cols-2 gap-2">
            {!showDeleted && <AppSelect aria-label="Filter tickets by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 min-w-0 rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-text"><option value="all">Any status</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_customer">Waiting</option><option value="resolved">Resolved</option></AppSelect>}
            <AppSelect aria-label="Filter tickets by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={`${showDeleted ? 'col-span-2' : ''} min-h-10 min-w-0 rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-text`}><option value="all">Any category</option><option value="general">General</option><option value="device">Device</option><option value="billing">Billing</option><option value="account">Account</option></AppSelect>
            {staffMode && !showDeleted && <AppSelect aria-label="Filter tickets by assignment" value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)} className="col-span-2 min-h-10 min-w-0 rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-text"><option value="all">Any assignment</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></AppSelect>}
          </div>
          {(search || statusFilter !== 'all' || categoryFilter !== 'all' || assignmentFilter !== 'all') && <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); setCategoryFilter('all'); setAssignmentFilter('all'); }} className="text-[11px] font-bold text-text-muted hover:text-accent">Clear filters</button>}
        </div>
        <div className="max-h-[620px] overflow-y-auto p-2">
          {loading ? <p className="p-5 text-center text-xs text-text-muted">Loading tickets…</p> : visibleTickets.length === 0 ? <div className="p-8 text-center"><MessageSquare size={24} className="mx-auto text-text-muted" /><p className="mt-3 text-sm font-bold">{tickets.length ? 'No matching cases' : showDeleted ? 'No deleted tickets' : 'No tickets yet'}</p><p className="mt-1 text-xs text-text-muted">{tickets.length ? 'Try another search or clear the filters.' : showDeleted ? 'Tickets moved here stay recoverable for 30 days.' : staffMode ? 'New requests will appear here.' : 'Create one whenever you need help.'}</p></div> : visibleTickets.map((ticket) => {
            return <button key={ticket.id} type="button" onClick={() => { setComposing(false); if (selectedId !== ticket.id) { setSelectedId(ticket.id); setDetail(null); } }} aria-current={selectedId === ticket.id ? 'true' : undefined} className={`mb-1 w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${selectedId === ticket.id ? 'border-accent/50 bg-accent-bg' : 'border-transparent hover:border-border hover:bg-card-alt'}`}>
                <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-xs font-black">{ticket.subject}</span>{showDeleted ? <span className="text-[10px] font-black text-red-600 dark:text-red-300">Deleted</span> : <StatusPill value={ticket.status} />}</div>
                <p className="mt-1 truncate text-[11px] text-text-muted">{staffMode ? ticket.customer_email : ticket.category} · {new Date(showDeleted ? ticket.deleted_at : ticket.updated_at).toLocaleDateString()}</p>
            </button>;
          })}
        </div>
      </div>

      <div className={`${!selectedId && !composing ? 'hidden md:flex' : 'flex'} min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card`}>
        {(selectedId || composing) && <button type="button" onClick={() => { setSelectedId(null); setComposing(false); setDetail(null); }} className="inline-flex min-h-11 items-center gap-2 border-b border-border px-4 text-xs font-bold text-text-muted hover:text-accent md:hidden"><ArrowLeft size={16} /> Back to tickets</button>}
        {composing ? <form onSubmit={createTicket} className="space-y-4 p-4 sm:p-6">
          <h3 className="text-lg font-black">New support ticket</h3>
          <label className="block text-xs font-bold">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={120} required minLength={5} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent" placeholder="What do you need help with?" /></label>
          <label className="block text-xs font-bold">Category<AppSelect value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent"><option value="general">General</option><option value="device">Device</option><option value="billing">Billing</option><option value="account">Account</option></AppSelect></label>
          <label className="block text-xs font-bold">Details<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} required rows={7} className="mt-2 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-accent" placeholder="Describe the issue and what you tried." /></label>
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-accent px-5 text-xs font-black text-[var(--btn-text)] disabled:opacity-50">{busy ? 'Sending…' : 'Send ticket'}</button>
        </form> : selected ? <>
          <div className="border-b border-border p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-lg font-black">{selected.subject}</h3><p className="mt-1 text-xs text-text-muted">{selected.customer_email} · {selected.category} · Opened {new Date(selected.created_at).toLocaleString()}</p></div><div className="flex shrink-0 items-center gap-2">{showDeleted ? <span className="text-xs font-black text-red-600 dark:text-red-300">Deleted</span> : <StatusPill value={selected.status} />}<button type="button" onClick={() => toggleLock(selected)} aria-label={lockedId === selected.id && lockedDeleted === showDeleted ? `Unlock ${selected.subject}` : `Lock ${selected.subject} open after sign-in`} aria-pressed={lockedId === selected.id && lockedDeleted === showDeleted} title={lockedId === selected.id && lockedDeleted === showDeleted ? 'Unlock conversation' : 'Keep this conversation open'} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${lockedId === selected.id && lockedDeleted === showDeleted ? 'text-accent' : 'text-text-muted hover:text-accent'}`}>{lockedId === selected.id && lockedDeleted === showDeleted ? <LockKeyhole size={20} strokeWidth={2.8} /> : <LockKeyholeOpen size={20} strokeWidth={2.8} />}</button></div></div>
            {showDeleted ? <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-text-muted">Deleted {new Date(selected.deleted_at).toLocaleString()} · Restorable for 30 days</p><button type="button" onClick={restoreTicket} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-500/40 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-300"><RotateCcw size={14} /> Restore ticket</button></div> : staffMode && <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={busy || Boolean(selected.assigned_to && selected.assigned_to !== selfEmail && !mainAdmin)} onClick={() => updateTicket({ claim: selected.assigned_to !== selfEmail })} className="min-h-9 rounded-lg border border-border px-3 text-xs font-bold hover:border-accent/50 disabled:opacity-50">{selected.assigned_to === selfEmail ? 'Release ticket' : selected.assigned_to ? mainAdmin ? `Take over from ${selected.assigned_to}` : `Assigned: ${selected.assigned_to}` : 'Claim ticket'}</button><AppSelect aria-label="Ticket status" value={selected.status} disabled={busy} onChange={(event) => updateTicket({ status: event.target.value })} className="min-h-9 rounded-lg border border-border bg-background px-3 text-xs font-bold"><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_customer">Waiting for customer</option><option value="resolved">Resolved</option></AppSelect>{canDelete && <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-500/30 px-3 text-xs font-bold text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"><Trash2 size={14} /> Delete ticket</button>}</div>}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">{detail?.ticket?.id !== selectedId ? <p className="text-xs text-text-muted">Loading conversation…</p> : detail.messages.length === 0 ? <p className="text-xs text-text-muted">No messages yet.</p> : detail.messages.map((entry) => <div key={entry.id} className={`max-w-[90%] rounded-2xl border p-3 ${entry.sender_role === 'staff' ? 'ml-auto border-accent/25 bg-accent-bg' : 'border-border bg-card-alt'}`}><p className="text-[10px] font-black text-text-muted">{entry.sender_name} · {new Date(entry.created_at).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{entry.body}</p></div>)}
            {!showDeleted && typingLabel && <div role="status" className="flex items-center gap-2 text-xs font-semibold text-text-muted"><span>{typingLabel}</span><span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse" style={{ animationDelay: `${dot * 140}ms` }} />)}</span></div>}
          </div>
          {!showDeleted && <form onSubmit={sendReply} className="flex gap-2 border-t border-border p-3 sm:p-4"><label htmlFor="ticket-reply" className="sr-only">Reply</label><textarea id="ticket-reply" value={reply} onChange={onReplyChange} maxLength={4000} rows={2} className="min-w-0 flex-1 resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-accent" placeholder="Write a reply…" /><button type="submit" disabled={busy || !reply.trim()} aria-label="Send reply" className="self-end rounded-xl bg-accent p-3 text-[var(--btn-text)] disabled:opacity-50"><Send size={18} /></button></form>}
        </> : <div className="m-auto p-8 text-center"><MessageSquare size={30} className="mx-auto text-text-muted" /><h3 className="mt-3 text-sm font-black">Select a ticket</h3><p className="mt-1 text-xs text-text-muted">The conversation will appear here.</p></div>}
      </div>
    </div>
    {confirmDelete && selected && <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 px-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-ticket-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-text shadow-2xl sm:p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-300"><Trash2 size={19} /></div>
        <h3 id="delete-ticket-title" className="mt-4 text-lg font-black">Delete this ticket?</h3>
        <p className="mt-2 break-words text-sm text-text-muted">“{selected.subject}” and its conversation will move to Deleted tickets. Main admins can restore it within 30 days.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} className="min-h-10 rounded-xl border border-border px-4 text-xs font-bold hover:bg-card-alt">Cancel</button><button type="button" onClick={deleteTicket} disabled={busy} className="min-h-10 rounded-xl bg-red-600 px-4 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50">{busy ? 'Moving…' : 'Move to Deleted tickets'}</button></div>
      </div>
    </div>}
  </section>;
}
