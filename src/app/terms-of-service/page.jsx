'use client';

import InfoPageShell from '@/components/InfoPageShell';

const sections = [
  {
    title: '1. Acceptance of Terms',
    icon: 'fact_check',
    description: 'By connecting custom microcontrollers (such as ESP32 boards) to this service, you accept complete responsibility for hardware configurations, wiring safety, and mains AC handling.'
  },
  {
    title: '2. Hardware Limitations',
    icon: 'developer_board',
    description: 'Relays and current detectors carry physical operating limits. The software does not prevent electrical overloads. Ensure that your physical breaker sizes and contact ratings match your loads.'
  },
  {
    title: '3. Cloud Connectivity & Data',
    icon: 'cloud_sync',
    description: 'State synchronization depends on active Internet and Supabase availability. Real-time logging data (activity logs) is retained for 7 days before automated deletion.'
  },
  {
    title: '4. Subscription & Pre-Orders',
    icon: 'local_mall',
    description: 'Pre-orders and module purchases are subject to manufacturing timelines. Refunds are issued in full if hardware has not shipped. Newsletter subscriptions can be cancelled at any time.'
  },
  {
    title: '5. Limitation of Liability',
    icon: 'shield',
    description: 'We are not responsible for any physical damages, electrical shocks, fires, or breaker trips caused by custom hardware installations or code deviations.'
  },
  {
    title: '6. Governing Law',
    icon: 'gavel',
    description: 'These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of Hyderabad, Telangana.'
  }
];

export default function TermsOfServicePage() {
  return (
    <InfoPageShell
      badge="Legal"
      title="Terms of Service"
      subtitle="Legal guidelines and limitations of liability for the Smart Home system."
    >
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {sections.map((sec, index) => (
          <article key={index} className="p-6 md:p-7 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/35 transition-all rounded-xl flex gap-4 items-start">
            <span className="material-symbols-outlined text-lp-primary-container text-2xl mt-0.5 shrink-0">{sec.icon}</span>
            <div>
              <h3 className="font-label-caps text-sm font-bold text-white uppercase tracking-wider mb-2">{sec.title}</h3>
              <p className="text-xs font-body-md text-lp-on-surface-variant leading-relaxed">{sec.description}</p>
            </div>
          </article>
        ))}
      </div>
    </InfoPageShell>
  );
}