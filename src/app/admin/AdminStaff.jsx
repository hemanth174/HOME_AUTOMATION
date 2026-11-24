'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldHalf, Users, RefreshCw } from 'lucide-react';

const PRIVILEGES = [
  ['Support tickets', 'View, reply, claim, and update ticket status', true],
  ['Create admin issues', 'Open a new ticket directly in the support queue', false],
  ['Order summaries', 'Read customer, order ID, category, and stage', true],
  ['Order changes and account approvals', 'Advance stages, approve, deny, and revoke', false],
  ['Hardware, MQTT, monitoring, and plans', 'Control devices and servers; see infrastructure data', false],
];

export default function AdminStaff({ accessToken }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const response = await fetch('/api/admin/staff', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load admin roles');
      setStaff(result.staff || []); setError('');
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (person) => {
    setBusy(person.email);
    try {
      const response = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: person.email, active: !person.active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not change access');
      setStaff((current) => current.map((item) => item.email === person.email ? result.staff : item));
      setError('');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  };

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">People & permissions</p><h2 className="mt-1 flex items-center gap-2 text-xl font-black sm:text-2xl"><Users size={22} className="text-accent" /> Admin team</h2><p className="mt-1 text-xs text-text-muted">Main admins keep full control. Sub admins help customers with limited access.</p></div>
      <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold hover:border-accent/50 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {staff.map((person) => {
        const main = person.role === 'main_admin';
        return <article key={person.email} className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${main ? 'border-amber-500/30 bg-amber-500/5' : 'border-sky-500/30 bg-sky-500/5'}`}>
          <div className="flex items-start justify-between gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${main ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'}`}>{main ? <ShieldCheck size={19} /> : <ShieldHalf size={19} />}</div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${main ? 'border-amber-500/30 text-amber-600 dark:text-amber-300' : person.active ? 'border-sky-500/30 text-sky-600 dark:text-sky-300' : 'border-red-500/30 text-red-600 dark:text-red-300'}`}>{main ? 'Main admin' : person.active ? 'Sub admin · active' : 'Sub admin · disabled'}</span></div>
          <h3 className="mt-3 break-all text-sm font-black sm:text-base">{person.email}</h3>
          <p className="mt-1 text-xs text-text-muted">{main ? 'All administration and operational controls' : 'Support desk and read-only order summaries'}</p>
          {!main && <button type="button" disabled={busy === person.email} onClick={() => toggle(person)} className={`mt-4 min-h-10 rounded-xl border px-4 text-xs font-black transition-colors disabled:opacity-50 ${person.active ? 'border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-300' : 'border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300'}`}>{busy === person.email ? 'Saving…' : person.active ? 'Disable access' : 'Enable access'}</button>}
        </article>;
      })}
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border px-4 py-4 sm:px-5"><h3 className="text-sm font-black">Role privileges</h3><p className="mt-1 text-xs text-text-muted">These permissions are checked by the server for every request.</p></div><div className="divide-y divide-border">{PRIVILEGES.map(([title, description, sub]) => <div key={title} className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-5"><div><p className="font-black">{title}</p><p className="mt-0.5 text-text-muted">{description}</p></div><span className="w-fit rounded-full bg-amber-500/10 px-2.5 py-1 font-black text-amber-600 dark:text-amber-300">Main: Yes</span><span className={`w-fit rounded-full px-2.5 py-1 font-black ${sub ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'bg-card-alt text-text-muted'}`}>Sub: {sub ? 'Yes' : 'No'}</span></div>)}</div></div>
  </section>;
}
