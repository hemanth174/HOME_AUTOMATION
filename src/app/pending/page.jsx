'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Clock3, MailCheck, ShieldCheck, XCircle } from 'lucide-react';

function ReviewCard({ label, approved, email, rejected }) {
  const tone = rejected ? 'border-red-400/40 bg-red-400/10 text-red-600' : approved ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700' : 'border-amber-400/50 bg-amber-400/10 text-amber-700';
  const Icon = rejected ? XCircle : approved ? CheckCircle2 : Clock3;
  return <div className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${tone}`}><Icon size={19} /><div><p className="text-xs font-black text-text">{label}</p><p className="mt-1 text-[11px] font-bold">{rejected ? 'Rejected' : approved ? `Approved${email ? ` by ${email}` : ''}` : 'Waiting for review'}</p></div></div>;
}

export default function PendingPage() {
  const [approval, setApproval] = useState(null);
  useEffect(() => {
    let active = true;
    const load = async () => { const { data: { session } } = await supabase.auth.getSession(); if (!session) { window.location.href = '/login'; return; } const response = await fetch('/api/account/status', { cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}` } }); const data = await response.json(); if (active && response.ok) setApproval(data.approval); };
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) window.location.href = '/login'; });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => { if (approval?.account_status === 'approved') window.location.href = '/'; }, [approval]);
  const rejected = approval?.account_status === 'rejected' || approval?.account_status === 'revoked'; const firstApproved = Boolean(approval?.admin_one_approved_at); const secondApproved = Boolean(approval?.admin_two_approved_at); const bothApproved = firstApproved && secondApproved;
  const title = rejected ? 'Request not approved' : bothApproved ? 'Access approved' : firstApproved ? 'Waiting for second approval' : 'Approval is in progress';
  const subtitle = rejected ? approval?.rejection_reason || 'Please contact support for more information.' : bothApproved ? 'Both administrators have approved your account. Redirecting you now…' : firstApproved ? 'Approved by one administrator — waiting for the second approval.' : 'Your account and order access are waiting for administrator approval.';
  return <main className="min-h-screen bg-background px-5 py-16 text-text sm:px-8"><div className="mx-auto max-w-xl animate-fade-in"><div className="mb-10 text-center"><div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border ${rejected ? 'border-red-400/40 bg-red-400/10 text-red-500' : bothApproved ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600' : 'border-amber-400/50 bg-amber-400/10 text-amber-600'} animate-pulse`}><ShieldCheck size={30} /></div><p className="mt-6 text-[10px] font-black uppercase tracking-[.24em] text-accent">VikaTech account review</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1><p className="mt-3 text-sm font-semibold leading-6 text-text-muted">{subtitle}</p></div><div className="space-y-3 rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4"><MailCheck size={19} className="text-cyan-600" /><div><p className="text-xs font-black text-text">Account request</p><p className="mt-1 text-[11px] font-bold text-cyan-700">{rejected ? 'Rejected' : bothApproved ? 'Fully approved' : 'Pending two-admin review'}</p></div></div><ReviewCard label="Administrator 1" approved={firstApproved} email={approval?.admin_one_email} rejected={rejected} /><ReviewCard label="Administrator 2" approved={secondApproved} email={approval?.admin_two_email} rejected={rejected} /></div><div className="mt-6 flex flex-col gap-3 sm:flex-row"><Link href="/contact-sales" className="flex-1 rounded-xl bg-accent px-4 py-3 text-center text-xs font-black text-[var(--btn-text)] hover:bg-accent-hover">Book an order</Link><button onClick={() => window.location.reload()} className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-xs font-black hover:border-accent/50">Refresh status</button></div><p className="mt-8 text-center text-[10px] font-semibold text-text-muted">You can submit your order while approval is pending. Dashboard controls and ESP32 setup remain locked until both administrators approve.</p></div></main>;
}
