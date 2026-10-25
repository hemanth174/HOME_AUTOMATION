"use client";

export default function LandingJourney() {
  return (
    <section
      className="py-12 md:py-24 bg-lp-surface px-5 md:px-6 lg:px-24 border-t border-lp-outline-variant"
      id="journey"
    >
      <div className="text-center mb-20">
        <h2 className="font-headline-md text-4xl mb-4 font-extrabold text-white">
          Our Journey
        </h2>
        <p className="font-body-md text-lp-on-surface-variant text-sm">
          The evolution from basic automation to industrial-grade V4
          architecture.
        </p>
      </div>

      <div className="max-w-4xl mx-auto relative py-12">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 mb-10 md:mb-24 relative">
          <div className="w-12 h-12 rounded-full bg-lp-slate-gray border-2 border-lp-outline flex items-center justify-center shrink-0 z-10 lp-timeline-node">
            <span className="font-label-caps text-xs text-white">P1</span>
          </div>
          <div className="flex-1 pt-1">
            <h3 className="font-headline-sm text-xl mb-3 text-white font-bold">
              Phase 1: The Start
            </h3>
            <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">
              Arduino Nano + HC05 Bluetooth. It worked, but the 30-minute
              disconnects and terrible range proved Bluetooth wasn&apos;t the
              answer for reliable infrastructure.
            </p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 mb-10 md:mb-24 relative">
          <div className="w-12 h-12 rounded-full bg-lp-slate-gray border-2 border-lp-outline flex items-center justify-center shrink-0 z-10 lp-timeline-node">
            <span className="font-label-caps text-xs text-white">P2</span>
          </div>
          <div className="flex-1 pt-1">
            <h3 className="font-headline-sm text-xl mb-3 text-white font-bold">
              Phase 2: The Wi-Fi Shift
            </h3>
            <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">
              Moved to ESP32 for range. Hit a wall with parallel wiring—if the
              manual switch was on, the app couldn&apos;t turn the light off.
              Zero feedback loop for the user.
            </p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 mb-10 md:mb-24 relative">
          <div className="w-12 h-12 rounded-full bg-lp-slate-gray border-2 border-lp-outline flex items-center justify-center shrink-0 z-10 lp-timeline-node">
            <span className="font-label-caps text-xs text-white">P3</span>
          </div>
          <div className="flex-1 pt-1">
            <h3 className="font-headline-sm text-xl mb-3 text-white font-bold">
              Phase 3: The Blueprint
            </h3>
            <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">
              Designed bi-directional switching and AC detectors on paper.
              Realized a central-hub architecture would make house wiring too
              expensive and messy.
            </p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-8 relative">
          <div className="w-12 h-12 rounded-full bg-lp-primary-container text-lp-on-primary-container border-2 border-lp-primary-container flex items-center justify-center shrink-0 z-10 lp-active-glow">
            <span className="material-symbols-outlined text-lg font-bold">
              check
            </span>
          </div>
          <div className="flex-1 pt-1">
            <div className="inline-block px-2 py-0.5 mb-2 bg-lp-primary-container/10 border border-lp-primary-container/30 rounded text-[10px] font-label-caps text-lp-primary-container uppercase select-none font-bold">
              Breakthrough
            </div>
            <h3 className="font-headline-sm text-xl mb-3 text-lp-primary-container font-bold">
              Phase 4: V4 Architecture
            </h3>
            <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">
              Pivoted to the V4 distributed model. Shift registers,
              component-agnostic PCB, and manual redundancy. Dropped
              manufacturing cost by 50% while maximizing reliability.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
