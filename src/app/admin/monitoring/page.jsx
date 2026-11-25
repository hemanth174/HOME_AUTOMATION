"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hasAdminPageAccess } from '@/lib/adminClientAccess';
import AdminMonitoring from "./AdminMonitoring";

export default function MonitoringPage() {
  const [status, setStatus] = useState('loading');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      if (await hasAdminPageAccess(session, 'monitoring')) {
        setAccessToken(session.access_token);
        setStatus('authorized');
      } else {
        setStatus('denied');
      }
    }).catch(() => {
      if (active) setStatus('denied');
    });
    return () => { active = false; };
  }, []);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-text">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent-bg text-accent shadow-gold-glow">
            <ShieldCheck size={26} className="animate-pulse" />
          </div>
          <p className="mt-4 text-[10px] font-black uppercase tracking-[.24em] text-accent">Monitoring</p>
          <h1 className="mt-1 text-xl font-black">Verifying admin session</h1>
        </div>
      </main>
    );
  }

  if (status === 'denied') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16 text-center text-text">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-card p-6 shadow-2xl sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-500">
            <ShieldAlert size={28} />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight">Admin Access Required</h1>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-text-muted">Supabase monitoring is restricted to authorized VikaTech operations personnel.</p>
          <Link href="/" className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-black text-[var(--btn-text)] shadow-md transition-transform hover:scale-[1.02]">
            <ArrowLeft size={14} /> Back to Main Site
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-text selection:bg-accent/20">
      <div className="mx-auto max-w-[1440px] px-3 py-4 sm:px-6 sm:py-5 lg:px-10">
        <AdminMonitoring accessToken={accessToken} standalone />
      </div>
    </main>
  );
}
