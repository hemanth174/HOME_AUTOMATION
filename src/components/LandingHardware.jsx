'use client';



export default function LandingHardware() {
  return (
        <section className="py-12 md:py-24 px-5 md:px-6 lg:px-24 bg-lp-surface relative overflow-hidden" id="v4">
          <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-lp-primary-container/5 blur-[120px] rounded-full pointer-events-none"></div>
          <div className="mb-10 md:mb-20">
            <h2 className="font-headline-md text-2xl md:text-4xl mb-3 md:mb-4 font-extrabold text-white">The V4 Hardware Advantage</h2>
            <p className="font-body-md text-lp-on-surface-variant text-[15px] md:text-sm max-w-2xl leading-relaxed">What you get with every Electric Warriors switchboard — engineered hardware, truthful feedback, and automation that never sleeps.</p>
            <div className="w-24 h-1 bg-lp-primary-container mt-4"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">account_tree</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Distributed Architecture</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">No central hub. Each switchboard has its own ESP32 communicating via Wi-Fi, drastically reducing wiring costs and eliminating single points of failure.</p>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">verified_user</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Fail-Safe Redundancy</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">True bi-directional control. The physical wall switches continue to work flawlessly even if the Wi-Fi drops or the ESP32 chip is damaged.</p>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">add_circle</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Infinitely Expandable</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Powered by shift registers, freeing up GPIO pins for OLED screens, rotary encoders, and motion/mmWave sensors.</p>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">settings_input_component</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Component Agnostic</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Custom PCB designed to accept any ESP32 variation, protecting your infrastructure against supply chain issues and chip shortages.</p>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden lg:col-span-2 rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">payments</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Ultra-Low Cost Manufacturing</h3>
              <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed flex-1">Manufactured at ~₹600 for a 4-channel relay with built-in AC feedback. High-performance IoT is no longer a luxury.</p>
                <div className="px-6 py-3 bg-lp-surface-lowest border border-lp-primary-container/20 rounded font-data-point text-lp-primary-container text-lg font-bold select-none">
                  ₹600 <span className="text-xs opacity-60">/ unit</span>
                </div>
              </div>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">sync_alt</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Bi-Directional Control</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Flip the physical wall switch and the app updates instantly. Toggle the app and the switch follows. True two-way sync with zero confusion.</p>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">electric_bolt</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">AC Current Feedback</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Onboard current-sensing circuits confirm the real load state — so the dashboard always shows the truth, even if a device is unplugged or the relay fails.</p>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">dashboard_customize</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Real-Time Web Dashboard</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Control every node from any browser via low-latency WebSockets. Watch state changes propagate live, from phone, tablet, or desktop.</p>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">schedule</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Offline Smart Schedules</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Presets and timers are saved locally on each node. Your automation keeps running exactly on time — even through a full internet outage.</p>
            </div>
          </div>
        </section>
  );
}



