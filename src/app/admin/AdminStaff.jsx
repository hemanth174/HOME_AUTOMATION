'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import { ADMIN_FEATURES, hasAdminPermission, normalizeAdminPermissions } from '@/lib/adminPermissions';
import { showAdminToast } from '@/lib/adminToast';

export default function AdminStaff({ accessToken, role, onRefreshAccess }) {
  const main = role === 'main_admin';
  const [staff, setStaff] = useState([]);
  const [requests, setRequests] = useState([]);
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busySwitch, setBusySwitch] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [selectedSubEmail, setSelectedSubEmail] = useState('');
  const api = useCallback(async (path, method = 'GET', body) => {
    const response = await fetch(path, { method, cache: 'no-store', headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  }, [accessToken]);
  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [team, accessRequests] = await Promise.all([api('/api/admin/staff'), api('/api/admin/staff/requests')]);
      setStaff(team.staff || []); setRequests(accessRequests.requests || []);
    } catch (failure) { showAdminToast(failure.message, 'error'); }
    finally { setLoading(false); }
  }, [accessToken, api]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action, success) => {
    setBusy(true);
    try { await action(); await load(); showAdminToast(success, 'success'); }
    catch (failure) { showAdminToast(failure.message, 'error'); }
    finally { setBusy(false); }
  };
  const pending = requests.filter((request) => request.status === 'pending');
  const subAdmins = staff.filter((person) => person.role === 'sub_admin');
  const selectedEmail = subAdmins.some((person) => person.email === selectedSubEmail) ? selectedSubEmail : subAdmins[0]?.email;
  const visibleStaff = main ? subAdmins.filter((person) => person.email === selectedEmail) : staff;
  return <section className="space-y-5">
    {confirmation && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="admin-access-confirm-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-text shadow-2xl sm:p-6"><h3 id="admin-access-confirm-title" className="text-lg font-black">Confirm access change</h3><p className="mt-2 text-sm text-text-muted">{confirmation.action} <strong className="text-text">{confirmation.label}</strong> for:</p><p className="mt-2 break-all rounded-xl border border-border bg-background p-3 text-sm font-black">{confirmation.email}</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmation(null)} className="min-h-10 rounded-xl border border-border px-4 text-xs font-black">Cancel</button><button type="button" onClick={() => { const choice = confirmation; setConfirmation(null); setBusySwitch(`${choice.email}:${choice.body.feature || 'account'}`); void act(() => api('/api/admin/staff', 'PATCH', choice.body), `${choice.label} ${choice.action.toLowerCase()}d for ${choice.email}.`).finally(() => setBusySwitch('')); }} className="min-h-10 rounded-xl bg-accent px-4 text-xs font-black text-[var(--btn-text)]">Confirm</button></div></div></div>}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-accent">People & permissions</p><h2 className="mt-1 flex items-center gap-2 text-xl font-black sm:text-2xl"><Users size={22} className="text-accent" /> Admin team</h2><p className="mt-1 text-xs text-text-muted">{main ? 'Manage access and review feature requests.' : 'See your access and request more features.'}</p></div><button type="button" onClick={() => { void load(); onRefreshAccess?.(); }} disabled={loading || busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
    {loading && !staff.length && <p className="rounded-2xl border border-border bg-card p-5 text-sm text-text-muted">Loading team access…</p>}
    {main && subAdmins.length > 0 && <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><p className="text-sm font-black">Sub admin access</p><p className="mt-0.5 text-xs text-text-muted">Select one account to manage its permissions.</p></div><div className="flex min-w-0 flex-wrap gap-2">{subAdmins.map((person) => <button key={person.email} type="button" disabled={busy} onClick={() => setSelectedSubEmail(person.email)} aria-pressed={selectedEmail === person.email} className={`min-h-10 max-w-full break-all rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors disabled:opacity-50 ${selectedEmail === person.email ? 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-border text-text-muted hover:border-sky-500/40 hover:text-text'}`}>{person.email}</button>)}</div></div>}
    {main && pending.length > 0 && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5"><h3 className="text-sm font-black">Access requests · {pending.length}</h3><div className="mt-3 grid gap-2">{pending.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"><div className="min-w-0"><p className="break-all text-xs font-black">{item.staff_email}</p><p className="mt-1 text-xs text-text-muted">Requested {ADMIN_FEATURES.find((feature) => feature.key === item.feature_key)?.label || item.feature_key} · {new Date(item.created_at).toLocaleString()}</p>{item.reason && <p className="mt-1 text-xs">{item.reason}</p>}</div><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => act(() => api('/api/admin/staff/requests', 'PATCH', { requestId: item.id, approve: true }), 'Access granted.')} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-500/40 px-3 text-xs font-black text-emerald-700 dark:text-emerald-300"><Check size={14} /> Grant</button><button type="button" disabled={busy} onClick={() => act(() => api('/api/admin/staff/requests', 'PATCH', { requestId: item.id, approve: false }), 'Request declined.')} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-500/40 px-3 text-xs font-black text-red-600 dark:text-red-300"><X size={14} /> Decline</button></div></div>)}</div></div>}
    <div className="space-y-5">{visibleStaff.map((person) => {
      const mainAccount = person.role === 'main_admin';
      const permissions = normalizeAdminPermissions(person.permissions);
      return <article key={person.email} className={`min-w-0 rounded-2xl border bg-card p-4 sm:p-6 ${mainAccount ? 'border-amber-500/30' : 'border-border'}`}>
        <div className="flex items-start justify-between gap-2"><ShieldCheck size={24} className={mainAccount ? 'text-amber-600 dark:text-amber-300' : 'text-sky-600 dark:text-sky-300'} /><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${mainAccount ? 'border-amber-500/30 text-amber-700 dark:text-amber-300' : person.active ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 text-red-600 dark:text-red-300'}`}>{mainAccount ? 'Main admin' : person.active ? 'Active' : 'Disabled'}</span></div>
        <h3 className="mt-3 break-all text-sm font-black sm:text-base">{person.email}</h3><p className="mt-1 text-xs text-text-muted">{mainAccount ? 'Full access to every admin feature' : main ? 'Set access for each feature below.' : 'Your current feature access'}</p>
        {!mainAccount && main && <button type="button" disabled={busy} onClick={() => setConfirmation({ email: person.email, label: 'Account access', action: person.active ? 'Disable' : 'Enable', body: { email: person.email, active: !person.active } })} className={`mt-3 min-h-9 rounded-lg border px-3 text-xs font-black ${person.active ? 'border-red-500/30 text-red-600 dark:text-red-300' : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}`}>{person.active ? 'Disable account' : 'Enable account'}</button>}
        {!mainAccount && <div className="mt-5 grid gap-3 md:grid-cols-2">{ADMIN_FEATURES.map((feature) => {
          const enabled = hasAdminPermission('sub_admin', permissions, feature.key);
          const requested = pending.some((item) => item.feature_key === feature.key && item.staff_email === person.email);
          return <div key={feature.key} className="rounded-xl border border-border bg-background p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black">{feature.label}</p><p className="mt-0.5 text-xs leading-5 text-text-muted">{feature.detail}</p></div>{main ? <button type="button" role="switch" aria-label={`${feature.label} for ${person.email}`} aria-checked={enabled} aria-busy={busySwitch === `${person.email}:${feature.key}`} disabled={busy} onClick={() => setConfirmation({ email: person.email, label: feature.label, action: enabled ? 'Disable' : 'Enable', body: { email: person.email, feature: feature.key, enabled: !enabled } })} className={`relative h-7 w-[52px] shrink-0 cursor-pointer rounded-full border transition-colors duration-200 disabled:cursor-wait ${enabled ? 'border-emerald-600 bg-emerald-600' : 'border-border bg-border'}`}><span className={`absolute top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-white shadow transition-all duration-200 ${enabled ? 'left-[calc(100%-26px)]' : 'left-[3px]'}`}>{busySwitch === `${person.email}:${feature.key}` && <span className="absolute inset-[4px] animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 motion-reduce:animate-none" aria-hidden="true" />}</span></button> : <span className={`rounded-full px-2 py-1 text-[10px] font-black ${enabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-card-alt text-text-muted'}`}>{enabled ? 'Enabled' : requested ? 'Requested' : 'Unavailable'}</span>}</div>{!main && !enabled && !requested && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label={`Reason for ${feature.label} request`} maxLength={500} value={reasons[feature.key] || ''} onChange={(event) => setReasons((current) => ({ ...current, [feature.key]: event.target.value }))} placeholder="Why do you need this? (optional)" className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-xs text-text" /><button type="button" disabled={busy} onClick={() => act(() => api('/api/admin/staff/requests', 'POST', { feature: feature.key, reason: reasons[feature.key] || '' }), 'Request sent to main admins.')} className="min-h-9 rounded-lg border border-sky-500/40 px-3 text-xs font-black text-sky-700 dark:text-sky-300">Request access</button></div>}</div>;
        })}</div>}
      </article>;
    })}</div>
    {main && <section aria-label="Main administrators" className="space-y-3"><div><h3 className="text-sm font-black">Main admins</h3><p className="mt-0.5 text-xs text-text-muted">Both main admins have full access.</p></div><div className="grid gap-3 sm:grid-cols-2">{staff.filter((person) => person.role === 'main_admin').map((person) => <div key={person.email} className="flex min-w-0 items-center gap-3 rounded-2xl border border-amber-500/30 bg-card p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300"><ShieldCheck size={19} /></span><div className="min-w-0"><p className="break-all text-xs font-black sm:text-sm">{person.email}</p><p className="mt-0.5 text-[11px] text-text-muted">Full admin access</p></div></div>)}</div></section>}
  </section>;
}
