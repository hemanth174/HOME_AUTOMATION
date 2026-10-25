'use client';



export default function LandingAudience({ router, handleScroll }) {
  return (
        <section className="flex flex-col md:flex-row border-y border-lp-outline-variant md:min-h-[60vh]">
          <div className="flex-1 p-6 sm:p-8 md:p-20 bg-lp-surface-low border-b md:border-b-0 md:border-r border-lp-outline-variant group relative overflow-hidden flex flex-col justify-center min-w-0">
            <div className="relative z-10">
              <span className="font-label-caps text-xs text-lp-primary mb-3 md:mb-4 block">FOR INDIVIDUALS</span>
              <h2 className="font-headline-md text-2xl md:text-3xl mb-4 md:mb-6 font-extrabold text-white">Home Automation<br /><span className="text-lp-secondary">Without the Mess.</span></h2>
              <p className="font-body-md text-lp-on-surface-variant mb-6 md:mb-8 max-w-md text-[15px] md:text-sm leading-relaxed">Focus on day-to-day convenience, aesthetics, and reliability. Our V4 architecture ensures your house stays clean with no bulky central hub wiring or complex server racks.</p>
              <ul className="space-y-3 md:space-y-4 mb-8 md:mb-10 text-sm">
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">check_circle</span> Zero Hub Latency
                </li>
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">check_circle</span> Invisible Retrofitting
                </li>
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">check_circle</span> 100% Offline Resilience
                </li>
              </ul>
              <button
                onClick={() => router.push('/login')}
                className="px-6 py-3 border-2 border-lp-primary-container text-lp-primary-container font-label-caps text-xs font-bold hover:bg-lp-primary-container/10 transition-all cursor-pointer rounded"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
          <div className="flex-1 p-6 sm:p-8 md:p-20 bg-lp-surface-lowest group relative overflow-hidden flex flex-col justify-center min-w-0" id="commercial">
            <div className="relative z-10">
              <span className="font-label-caps text-xs text-lp-secondary mb-3 md:mb-4 block">FOR ENTERPRISE</span>
              <h2 className="font-headline-md text-2xl md:text-3xl mb-4 md:mb-6 font-extrabold text-white">Commercial Operations<br /><span className="text-lp-primary-container">Energy Analytics.</span></h2>
              <p className="font-body-md text-lp-on-surface-variant mb-6 md:mb-8 max-w-md text-[15px] md:text-sm leading-relaxed">Real-time analytics and automated scheduling to eliminate wasted electricity. Track device on/off times to map store foot-traffic and optimize utility spending.</p>
              <ul className="space-y-3 md:space-y-4 mb-8 md:mb-10 text-sm">
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">monitoring</span> Real-time Foot-traffic Mapping
                </li>
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">schedule</span> Multi-store Automation
                </li>
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">analytics</span> Advanced Energy ROI
                </li>
              </ul>
              <button
                onClick={() => handleScroll('showcase3d')}
                className="px-6 py-3 bg-lp-primary-container text-lp-on-primary-container font-label-caps text-xs font-bold hover:shadow-[0_0_20px_rgba(0,255,65,0.3)] transition-all cursor-pointer rounded"
              >
                Explore 3D Hardware
              </button>
            </div>
          </div>
        </section>
  );
}



