'use client';



export default function LandingHero({ handleScroll }) {
  return (
        <section className="relative flex flex-col items-center justify-center overflow-hidden px-5 md:px-6 lg:px-24 min-h-[85vh] md:min-h-[85vh] py-10 md:py-0" style={{ minHeight: '92svh' }}>
          <div className="absolute inset-0 lp-grid-pattern pointer-events-none"></div>

          <div className="relative z-10 text-center max-w-4xl mx-auto pt-8 md:pt-12 min-w-0">
            <div className="inline-block px-3 py-1 mb-5 md:mb-6 border border-lp-primary-container/30 bg-lp-primary-container/5 rounded-full">
              <span className="font-label-caps text-[10px] text-lp-primary-container tracking-[0.2em] uppercase">Enterprise IoT Architecture</span>
            </div>
            <h1 className="font-display-lg font-extrabold text-white mb-5 md:mb-6 leading-[1.1] text-[32px] sm:text-[40px] md:text-[64px]">
              Automate Your Space.<br />
              <span className="text-lp-primary-container">Optimize Your Energy.</span>
            </h1>
            <p className="font-body-lg text-lp-secondary max-w-2xl mx-auto mb-8 md:mb-10 opacity-80 leading-relaxed text-[15px] md:text-base px-1">
              Distributed smart architecture for modern homes and data-driven commercial operations. Experience the power of V4 hardware precision.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center px-1">
              <button
                onClick={() => handleScroll('commercial')}
                className="w-full sm:w-auto min-h-[52px] px-8 py-4 bg-lp-primary-container text-lp-on-primary-container font-label-caps font-bold text-sm flex items-center justify-center gap-2 group cursor-pointer hover:shadow-[0_0_20px_rgba(0,255,65,0.45)] transition-all rounded"
              >
                Book a Commercial Demo
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
              <button
                onClick={() => handleScroll('showcase3d')}
                className="w-full sm:w-auto min-h-[52px] px-8 py-4 border border-lp-outline text-on-surface font-label-caps text-sm hover:bg-white/5 transition-all cursor-pointer rounded text-white flex items-center justify-center"
              >
                Explore 3D Models
              </button>
            </div>
          </div>
        </section>
  );
}



