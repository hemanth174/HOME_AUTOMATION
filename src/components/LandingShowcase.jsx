'use client';

import dynamic from 'next/dynamic';

const ThreeModelViewer = dynamic(() => import('./ThreeModelViewer'), { ssr: false });

export default function LandingShowcase({ activeTab3D, setActiveTab3D }) {
  return (
        <section className="py-12 md:py-24 px-5 md:px-6 lg:px-24 bg-lp-surface-lowest border-t border-lp-outline-variant relative overflow-hidden" id="showcase3d">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 h-2/3 bg-lp-secondary/5 blur-[140px] rounded-full pointer-events-none"></div>

          <div className="text-center mb-16 relative z-10 max-w-3xl mx-auto">
            <div className="inline-block px-3 py-1 mb-4 border border-lp-secondary/30 bg-lp-secondary/5 rounded-full">
              <span className="font-label-caps text-[10px] text-lp-secondary tracking-[0.2em] uppercase">Interactive 3D Explorer</span>
            </div>
            <h2 className="font-headline-md text-4xl mb-4 font-extrabold text-white">Inspect Our Custom Engineering</h2>
            <p className="font-body-md text-lp-on-surface-variant text-sm max-w-xl mx-auto leading-relaxed">
              Use touch or mouse gestures to drag, rotate, and zoom the components. Toggle between the custom PCB board and the onboard ESP32 microchip.
            </p>
            <div className="flex flex-wrap justify-center gap-2 md:gap-4 mt-6 md:mt-8 px-1">
              <button
                onClick={() => setActiveTab3D('pcb')}
                className={`px-5 py-2.5 rounded font-label-caps text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 border ${activeTab3D === 'pcb'
                    ? 'bg-lp-primary-container text-lp-on-primary-container border-lp-primary-container shadow-[0_0_15px_rgba(0,255,65,0.25)]'
                    : 'bg-lp-surface-low text-lp-on-surface-variant border-lp-outline-variant hover:text-white hover:border-lp-outline'
                  }`}
              >
                <span className="material-symbols-outlined text-sm">developer_board</span>
                Custom V4 Switchboard PCB
              </button>
              <button
                onClick={() => setActiveTab3D('esp')}
                className={`px-5 py-2.5 rounded font-label-caps text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 border ${activeTab3D === 'esp'
                    ? 'bg-lp-primary-container text-lp-on-primary-container border-lp-primary-container shadow-[0_0_15px_rgba(0,255,65,0.25)]'
                    : 'bg-lp-surface-low text-lp-on-surface-variant border-lp-outline-variant hover:text-white hover:border-lp-outline'
                  }`}
              >
                <span className="material-symbols-outlined text-sm">memory</span>
                ESP32-WROOM Module
              </button>
            </div>
          </div>
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
            <div className="lg:col-span-8 bg-lp-surface-low/60 border border-lp-outline-variant p-2 rounded-2xl shadow-2xl relative">
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <span className="px-2 py-0.5 rounded bg-lp-bg/85 border border-lp-outline-variant text-[9px] font-label-caps text-lp-primary-container uppercase tracking-wide select-none">3D Interactive</span>
                <span className="px-2 py-0.5 rounded bg-lp-bg/85 border border-lp-outline-variant text-[9px] font-label-caps text-lp-secondary uppercase tracking-wide select-none">Drag to Orbit</span>
              </div>
              <div className="w-full aspect-[4/3] min-h-[280px] md:min-h-[450px] rounded-xl overflow-hidden bg-[#0d0e12]/90 relative">
                {activeTab3D === 'pcb' ? (
                  <ThreeModelViewer
                    key="pcb-viewer"
                    modelType="pcb-custom"
                    modelPath="/models/pcb_custom_front.png"
                    mtlPath="/models/pcb_custom_back.png"
                    glowColor={0x00ff41}
                  />
                ) : (
                  <ThreeModelViewer
                    key="esp-viewer"
                    modelType="glb"
                    modelPath="/models/esp32_wroom.glb"
                    glowColor={0x00e3fd}
                  />
                )}
              </div>
            </div>
            <div className="lg:col-span-4 flex flex-col gap-6">
              {activeTab3D === 'pcb' ? (
                <div className="animate-fade-in flex flex-col gap-6">
                  <div className="border-b border-lp-outline-variant pb-4">
                    <span className="text-xs font-label-caps text-lp-primary-container uppercase tracking-wider">Board Model v4.2</span>
                    <h3 className="text-2xl font-headline-sm font-bold text-white mt-1">V4 Redundant Switchboard</h3>
                  </div>
                  <p className="text-sm font-body-md text-lp-on-surface-variant leading-relaxed">
                    Designed to accept generic ESP32 modules. Interfaces 4 relays via high-speed shift registers, allowing mechanical switches and logic triggers to operate independently.
                  </p>
                  <div className="space-y-4">
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-primary-container mt-0.5 text-lg">bolt</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">AC Current Feedback</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">True status confirmation using custom optical/current detector circuits.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-primary-container mt-0.5 text-lg">settings_suggest</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Shift Register Extension</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Minimizes GPIO overhead, freeing up pins for custom sensors and displays.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-primary-container mt-0.5 text-lg">construction</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Easy Retrofitting</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Compact footprint (~₹600 bills of materials) that drops behind existing board frames.</p>
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="animate-fade-in flex flex-col gap-6">
                  <div className="border-b border-lp-outline-variant pb-4">
                    <span className="text-xs font-label-caps text-lp-secondary uppercase tracking-wider">Processor Core</span>
                    <h3 className="text-2xl font-headline-sm font-bold text-white mt-1">ESP32-WROOM-32D</h3>
                  </div>
                  <p className="text-sm font-body-md text-lp-on-surface-variant leading-relaxed">
                    The heart of our distributed nodes. Boasts robust dual-core processing, hardware Wi-Fi/Bluetooth, and a highly customizable framework.
                  </p>
                  <div className="space-y-4">
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-secondary mt-0.5 text-lg">wifi</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Wi-Fi & Bluetooth Stack</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Operates on 2.4GHz with instant fail-safe fallback commands.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-secondary mt-0.5 text-lg">terminal</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Dual-Core Tensilica Core</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Runs concurrent Wi-Fi handlers on Core 0 and relay commands on Core 1.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-secondary mt-0.5 text-lg">shield</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Offline Resilient ROM</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Saves presets and timers locally to continue executing schedules offline.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
  );
}



