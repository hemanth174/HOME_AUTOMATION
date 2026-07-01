'use client';

import Link from 'next/link';
import { FileText, ArrowLeft, ShieldAlert, Cpu, Network, ShieldCheck } from 'lucide-react';

export default function TermsPage() {
  const sections = [
    {
      title: "1. Acceptance of Terms",
      description: "By connecting custom microcontrollers (such as ESP32 boards) to this service, you accept complete responsibility for hardware configurations, wiring safety, and mains AC handling.",
      icon: ShieldAlert
    },
    {
      title: "2. Hardware Limitations",
      description: "Relays and current detectors carry physical operating limits. The software does not prevent electrical overloads. Ensure that your physical breaker sizes and contact ratings match your loads.",
      icon: Cpu
    },
    {
      title: "3. Cloud Connectivity & Data",
      description: "State synchronization depends on active Internet and Supabase availability. Real-time logging data (activity logs) is retained for 7 days before automated deletion.",
      icon: Network
    },
    {
      title: "4. Limitation of Liability",
      description: "We are not responsible for any physical damages, electrical shocks, fires, or breaker trips caused by custom hardware installations or code deviations.",
      icon: ShieldCheck
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
          <FileText size={20} className="stroke-[2.5px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-black uppercase tracking-wider text-text">Terms & Conditions</h1>
          <span className="text-xs font-bold text-text-muted">Legal guidelines and limitations of liability for the Smart Home system.</span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {sections.map((sec, index) => {
          const Icon = sec.icon;
          return (
            <article key={index} className="border border-border bg-card p-5 rounded-2xl shadow-lg backdrop-blur-md flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-accent-bg flex items-center justify-center text-accent border border-accent/15 shrink-0 mt-0.5">
                <Icon size={16} />
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-extrabold text-accent leading-snug">{sec.title}</h3>
                <p className="text-xs text-text-muted font-semibold leading-relaxed">{sec.description}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
