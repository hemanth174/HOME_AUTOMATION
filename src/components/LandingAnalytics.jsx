'use client';



export default function LandingAnalytics({ videoRef }) {
  return (
        <section className="py-12 md:py-24 bg-lp-surface-low border-t border-lp-outline-variant px-5 md:px-6 lg:px-24" id="analytics">
          <div className="flex flex-col lg:flex-row gap-16 items-center max-w-6xl mx-auto">
            <div className="flex-1">
              <span className="font-label-caps text-xs text-lp-primary mb-4 block">POWERED BY SUPABASE</span>
              <h2 className="font-headline-md text-4xl mb-6 text-white font-extrabold">Full-Stack Intelligence.</h2>
              <p className="font-body-md text-lp-on-surface-variant mb-10 leading-relaxed text-sm">
                Our software layer leverages low-latency WebSockets and a robust Supabase backend for real-time responsiveness. The &quot;Energy Dashboard&quot; provides deep logs of device uptime, providing actionable data for warehouse and retail managers to cut costs.
              </p>
              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-lp-primary-container/10 rounded">
                    <span className="material-symbols-outlined text-lp-primary-container">bolt</span>
                  </div>
                  <div>
                    <h4 className="font-headline-sm text-lg text-white mb-1 font-bold">Real-time Monitoring</h4>
                    <p className="text-lp-on-surface-variant text-xs leading-relaxed">Instant visual updates via bi-directional WebSockets.</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-lp-primary-container/10 rounded">
                    <span className="material-symbols-outlined text-lp-primary-container">history</span>
                  </div>
                  <div>
                    <h4 className="font-headline-sm text-lg text-white mb-1 font-bold">Historical Logs</h4>
                    <p className="text-lp-on-surface-variant text-xs leading-relaxed">Audit every switch event with sub-second precision.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full max-w-2xl relative">
              <div className="relative rounded-xl bg-lp-slate-gray p-1 overflow-hidden shadow-2xl">
                <video
                  ref={videoRef}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover rounded opacity-90"
                >
                  <source 
                    src="https://res.cloudinary.com/dvwvphn8u/video/upload/v1783665250/analytics_demo_f2vdpq.mp4" 
                    type="video/mp4" 
                  />
                  Your browser does not support the video tag.
                </video>
                <div className="absolute inset-0 bg-gradient-to-tr from-lp-surface/50 via-transparent to-lp-primary-container/5 pointer-events-none"></div>
              </div>
            </div>
          </div>
        </section>
  );
}



