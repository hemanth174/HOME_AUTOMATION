'use client';

import { useState } from 'react';
import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import CursorGlow from './CursorGlow';

export default function InfoPageShell({ badge, title, subtitle, children }) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setEmail('');
  };

  return (
    <div className="bg-lp-bg text-lp-on-surface font-body-md min-h-screen flex flex-col selection:bg-lp-primary-container selection:text-lp-on-primary-container">
      {/* Top Navbar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-6 py-3 md:py-4 bg-lp-bg/85 lp-glass-blur border-b border-lp-outline-variant">
        <Link href="/" className="text-base md:text-xl font-headline-md font-black tracking-tighter text-white uppercase select-none">
          ELECTRIC WARRIORS
        </Link>
        <div className="flex gap-2 md:gap-4 items-center shrink-0">
          <ThemeToggle />
          <Link
            href="/login"
            className="px-3 py-1.5 md:px-4 md:py-2 border border-lp-primary-container/40 text-lp-primary font-label-caps text-[10px] md:text-[12px] hover:bg-lp-primary-container/10 transition-all active:scale-95 cursor-pointer rounded whitespace-nowrap"
          >
            Login
          </Link>
        </div>
      </header>

      <main className="flex-1 pt-28 pb-24 px-6 lg:px-24">
        {/* Page Hero */}
        <section className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-block px-3 py-1 mb-6 border border-lp-primary-container/30 bg-lp-primary-container/5 rounded-full">
            <span className="font-label-caps text-[10px] text-lp-primary-container tracking-[0.2em] uppercase">{badge}</span>
          </div>
          <h1 className="font-display-lg text-[36px] leading-tight md:text-[48px] text-white mb-4 font-extrabold">{title}</h1>
          <p className="font-body-lg text-lp-secondary opacity-80 leading-relaxed text-sm md:text-base">{subtitle}</p>
        </section>

        {children}

        {/* Subscription Section */}
        <section className="max-w-2xl mx-auto mt-20 rounded-xl border border-lp-outline-variant bg-lp-surface-low p-8 md:p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-lp-primary-container/5 blur-[120px] rounded-full pointer-events-none"></div>
          <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-4 block">mark_email_read</span>
          <h2 className="text-2xl font-headline-sm font-bold text-white mb-2">Stay in the Loop</h2>
          <p className="text-sm font-body-md text-lp-on-surface-variant leading-relaxed mb-6">
            Subscribe for product updates, V4 launch news, and exclusive offers. No spam, ever.
          </p>
          {subscribed ? (
            <div className="px-6 py-3 bg-lp-primary-container/10 border border-lp-primary-container/40 rounded font-data-point text-lp-primary-container text-sm font-bold">
              Subscribed! Watch your inbox for updates.
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 justify-center">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 min-w-0 px-4 py-3 rounded bg-lp-surface-lowest border border-lp-outline-variant text-sm text-white outline-none focus:border-lp-primary-container transition-colors placeholder:text-lp-on-surface-variant/60"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-lp-primary-container text-lp-on-primary-container font-label-caps font-bold text-xs hover:shadow-[0_0_20px_rgba(0,255,65,0.35)] transition-all cursor-pointer rounded"
              >
                Subscribe
              </button>
            </form>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-lp-surface-lowest border-t border-lp-outline-variant py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1 items-center md:items-start">
            <span className="text-lg font-headline-md font-bold text-white uppercase tracking-tighter select-none">ELECTRIC WARRIORS</span>
            <p className="font-body-md text-lp-on-surface-variant text-xs">Precision in Darkness.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <Link href="/privacy-policy" className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors">Privacy Policy</Link>
            <Link href="/terms-of-service" className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors">Terms of Service</Link>
            <Link href="/partner-program" className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors">Partner Program</Link>
            <Link href="/contact-sales" className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors">Contact Sales</Link>
          </div>
          <span className="font-label-caps text-[11px] text-lp-on-surface-variant opacity-60 select-none">© 2026 Electric Warriors. Shock, Inspire, Lead.</span>
        </div>
      </footer>
      <CursorGlow />
    </div>
  );
}