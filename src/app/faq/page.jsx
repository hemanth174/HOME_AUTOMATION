'use client';

import Link from 'next/link';
import { HelpCircle, ArrowLeft, Lightbulb, AlertTriangle, CalendarDays, Mic } from 'lucide-react';

export default function FAQPage() {
  const faqs = [
    {
      q: "How does the manual wall switch override work?",
      a: "The physical wall switch and the cloud relay are configured as a hardware XOR circuit. Flipping either control reverses the light state instantly. Your app stays in perfect sync by monitoring AC current flow directly.",
      icon: Lightbulb
    },
    {
      q: "What does the 'Bulb Error' badge indicate?",
      a: "If you turn a device ON from the app, but the AC detector registers no current flow, a red warning badge is shown. This indicates that the light bulb is burnt out, or the physical breaker has tripped.",
      icon: AlertTriangle
    },
    {
      q: "How do I configure alarms or schedules?",
      a: "Use the navigation menu to visit the Schedules page (for weekly repeats) or Alarms page (for one-time events). The system automatically validates dates, preventing conflicts.",
      icon: CalendarDays
    },
    {
      q: "What voice commands can I speak?",
      a: "Click the gold microphone floating at the bottom right. Try commands like 'turn on fan 2', 'deactivate Party Mode', or 'set alarm for fan 2 at 9 PM'.",
      icon: Mic
    }
  ];

  return (
    <div className="mx-auto w-[min(100%-32px,720px)] pt-[104px] pb-8 animate-fade-up max-md:pt-[92px] max-md:pb-[96px] select-none">
      {/* Back Button */}
      <Link 
        href="/" 
        className="inline-flex items-center gap-1.5 text-xs font-extrabold text-text-muted hover:text-accent transition-colors mb-5"
      >
        <ArrowLeft size={14} />
        Back to Dashboard
      </Link>

      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow">
          <HelpCircle size={20} className="stroke-[2.5px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-black uppercase tracking-wider text-text">Frequently Asked Questions</h1>
          <span className="text-xs font-bold text-text-muted">Answers to common questions about your Smart Home setup.</span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {faqs.map((faq, index) => {
          const Icon = faq.icon;
          return (
            <article key={index} className="border border-border bg-card p-5 rounded-2xl shadow-lg backdrop-blur-md flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-accent-bg flex items-center justify-center text-accent border border-accent/15 shrink-0 mt-0.5">
                <Icon size={16} />
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-extrabold text-accent leading-snug">{faq.q}</h3>
                <p className="text-xs text-text-muted font-semibold leading-relaxed">{faq.a}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
