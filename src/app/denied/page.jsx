'use client';

import { useEffect, useState } from 'react';
import { LogOut, ShieldX } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function DeniedPage() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/login';
        return;
      }
      setEmail(session.user.email || '');
      const response = await fetch('/api/account/status', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (active && response.ok) setReason(data.approval?.rejection_reason || 'Your account access was not approved.');
      if (active) setLoading(false);
    };
    load();
    return () => { active = false; };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-text sm:px-8">
      <section className="w-full max-w-lg rounded-3xl border border-red-400/30 bg-card p-7 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/40 bg-red-400/10 text-red-500">
          <ShieldX size={30} />
        </div>
        <p className="mt-6 text-[10px] font-black uppercase tracking-[.24em] text-red-500">VikaTech account review</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Access not approved</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-text-muted">{loading ? 'Loading your review details…' : reason}</p>
        {email && <p className="mt-4 rounded-xl bg-background px-4 py-3 text-xs font-bold text-text-muted">{email}</p>}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <a href="/contact-sales" className="flex-1 rounded-xl bg-accent px-4 py-3 text-xs font-black text-[var(--btn-text)] hover:bg-accent-hover">Contact support</a>
          <button onClick={logout} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-xs font-black hover:border-red-400/50"><LogOut size={14} /> Log out</button>
        </div>
      </section>
    </main>
  );
}
