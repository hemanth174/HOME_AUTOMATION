'use client';

import Link from 'next/link';
import { Clock3, LogOut, ShieldX } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function AccessForbidden({ email }) {
  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {}
    window.location.href = '/login';
  };

  return (
    <main className="fixed inset-0 z-[10002] flex min-h-[100svh] items-center justify-center overflow-y-auto overscroll-contain bg-background px-5 py-20 text-text sm:px-8">
      <section className="w-full max-w-lg animate-fade-in rounded-3xl border border-amber-400/40 bg-card p-7 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-400/10 text-amber-600">
          <ShieldX size={30} />
        </div>
        <p className="mt-6 text-[10px] font-black uppercase tracking-[.24em] text-amber-600">403 · Access denied</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Approval required</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-text-muted">
          {email ? `You are signed in as ${email}, but ` : 'You are signed in, but '}
          the dashboard stays locked until both administrators approve your account.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pending"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-black text-[var(--btn-text)] transition-colors hover:bg-accent-hover"
          >
            <Clock3 size={14} /> View approval status
          </Link>
          <button
            onClick={signOut}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-xs font-black transition-colors hover:border-red-400/50"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <p className="mt-6 text-[11px] font-semibold text-text-muted">
          No dashboard data is loaded for pending accounts.
        </p>
      </section>
    </main>
  );
}
