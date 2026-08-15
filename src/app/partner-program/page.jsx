'use client';

import { useRouter } from 'next/navigation';
import InfoPageShell from '@/components/InfoPageShell';

const benefits = [
  {
    title: 'Pre-Installed Intelligence',
    icon: 'smart_home',
    description: 'Offer your clients premium, integrated home intelligence from day one and command a higher market value per square foot.'
  },
  {
    title: 'Bulk Hardware Pricing',
    icon: 'inventory_2',
    description: 'Volume pricing on V4 switchboards and relay modules for developers, builders, and system integrators.'
  },
  {
    title: 'Co-Branded Solutions',
    icon: 'handshake',
    description: 'White-label dashboards and co-branded hardware for established electrical and automation brands.'
  },
  {
    title: 'Priority Technical Support',
    icon: 'support_agent',
    description: 'Dedicated engineering channel for your installers, with firmware and PCB support for custom deployments.'
  },
  {
    title: 'Retrofitting Projects',
    icon: 'construction',
    description: 'Upgrade existing buildings without rewiring. Our compact modules drop behind standard board frames.'
  },
  {
    title: 'Energy ROI Reporting',
    icon: 'analytics',
    description: 'Deliver measurable energy-savings reports to your end clients with our analytics layer.'
  }
];

const steps = [
  { step: '01', title: 'Reach Out', description: 'Submit an inquiry through the contact form or direct sales email.' },
  { step: '02', title: 'Discovery Call', description: 'We map your project size, timelines, and integration requirements.' },
  { step: '03', title: 'Pilot Deployment', description: 'Install a pilot board set at a reference site to validate performance.' },
  { step: '04', title: 'Scale Up', description: 'Roll out across your portfolio with bulk pricing and priority support.' }
];

export default function PartnerProgramPage() {
  const router = useRouter();

  return (
    <InfoPageShell
      badge="For Builders & Developers"
      title="Partner Program"
      subtitle="Install Electric Warriors tech from the ground up and offer your clients real, measurable smart-home value."
    >
      {/* Benefits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {benefits.map((benefit, index) => (
          <div key={index} className="p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all rounded">
            <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">{benefit.icon}</span>
            <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">{benefit.title}</h3>
            <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">{benefit.description}</p>
          </div>
        ))}
      </div>

      {/* How It Works */}
      <section className="max-w-4xl mx-auto mt-24">
        <div className="text-center mb-14">
          <h2 className="font-headline-md text-3xl mb-4 font-extrabold text-white">How Partnering Works</h2>
          <div className="w-24 h-1 bg-lp-primary-container mx-auto"></div>
        </div>
        <div className="flex flex-col gap-8">
          {steps.map((item) => (
            <div key={item.step} className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-14 h-14 rounded-full bg-lp-slate-gray border-2 border-lp-outline flex items-center justify-center shrink-0">
                <span className="font-data-point text-sm text-lp-primary-container font-bold">{item.step}</span>
              </div>
              <div className="flex-1 pt-1">
                <h3 className="font-headline-sm text-xl mb-2 text-white font-bold">{item.title}</h3>
                <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-16">
          <button
            onClick={() => router.push('/contact-sales')}
            className="px-8 py-4 bg-lp-primary-container text-lp-on-primary-container font-label-caps font-bold text-sm hover:shadow-[0_0_20px_rgba(0,255,65,0.45)] transition-all cursor-pointer rounded"
          >
            Become a Partner
          </button>
        </div>
      </section>
    </InfoPageShell>
  );
}