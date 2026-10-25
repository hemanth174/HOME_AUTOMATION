'use client';



export default function LandingDualPlane() {
  return (
        <section className="py-12 md:py-24 px-5 md:px-6 lg:px-24 bg-lp-bg border-t border-lp-outline-variant relative overflow-hidden" id="dual-plane">
          <div className="text-center mb-16 relative z-10 max-w-3xl mx-auto">
            <div className="inline-block px-3 py-1 mb-4 border border-lp-primary-container/30 bg-lp-primary-container/5 rounded-full">
              <span className="font-label-caps text-[10px] text-lp-primary-container tracking-[0.2em] uppercase">Built for 100% Uptime</span>
            </div>
            <h2 className="font-headline-md text-3xl md:text-5xl mb-4 font-black text-white tracking-tight">
              Dual-Plane Autonomous Architecture
            </h2>
            <p className="font-body-md text-lp-on-surface-variant text-sm max-w-2xl mx-auto leading-relaxed">
              Traditional IoT breaks the moment Wi-Fi drops. Electric Warriors introduces concurrent Dual-Plane control: Sub-30ms local RF mesh when offline, and automatic Supabase cloud sync with zero data loss.
            </p>
          </div>

          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-amber-400/50 transition-all rounded-2xl flex flex-col justify-between group relative">
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">wifi_off</span>
                </div>
                <div className="inline-block px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-3">
                  Scenario 1
                </div>
                <h3 className="text-lg font-bold text-white mb-3">Total Internet Outage</h3>
                <p className="text-xs text-lp-on-surface-variant leading-relaxed">
                  When your router dies or ISP fails, the ESP32 broadcasts its own autonomous SoftAP <strong className="text-white">HOME-AUTO-LEADER</strong>. Connect your phone for instant, sub-30ms local control with zero internet required.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-lp-outline-variant flex items-center justify-between text-[11px] font-mono text-amber-400">
                <span>Latency: &lt; 25ms</span>
                <span>Direct RF</span>
              </div>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/50 transition-all rounded-2xl flex flex-col justify-between group relative">
              <div>
                <div className="w-12 h-12 rounded-xl bg-lp-primary-container/10 border border-lp-primary-container/30 flex items-center justify-center text-lp-primary-container mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">cloud_sync</span>
                </div>
                <div className="inline-block px-2 py-0.5 rounded bg-lp-primary-container/10 border border-lp-primary-container/30 text-[9px] font-bold text-lp-primary-container uppercase tracking-widest mb-3">
                  Scenario 2
                </div>
                <h3 className="text-lg font-bold text-white mb-3">Store-and-Forward Sync</h3>
                <p className="text-xs text-lp-on-surface-variant leading-relaxed">
                  Switches toggled while offline are queued in non-volatile flash. The moment Wi-Fi reconnects, the ESP32 flushes its queue to Supabase automatically. Zero missed logs, 100% state consistency.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-lp-outline-variant flex items-center justify-between text-[11px] font-mono text-lp-primary-container">
                <span>Auto Queue Flush</span>
                <span>Zero Loss</span>
              </div>
            </div>
            <div className="p-5 md:p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-cyan-400/50 transition-all rounded-2xl flex flex-col justify-between group relative">
              <div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-2xl">electric_meter</span>
                </div>
                <div className="inline-block px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-3">
                  Scenario 3
                </div>
                <h3 className="text-lg font-bold text-white mb-3">Hardware XOR Override</h3>
                <p className="text-xs text-lp-on-surface-variant leading-relaxed">
                  Manual wall switches work normally through hardware interrupts. Onboard optoisolated current sensing confirms true AC load status and updates your app live with AC ON / AC OFF pills.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-lp-outline-variant flex items-center justify-between text-[11px] font-mono text-cyan-400">
                <span>AC Current Sensing</span>
                <span>Wall XOR</span>
              </div>
            </div>
          </div>
        </section>
  );
}



