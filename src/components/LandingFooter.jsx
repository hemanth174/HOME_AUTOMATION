'use client';



export default function LandingFooter({ handleScroll, handleShare, router }) {
  return (
      <footer className="bg-lp-surface-lowest border-t border-lp-outline-variant py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col gap-2 items-center md:items-start">
            <div className="text-lg font-headline-md font-bold text-white uppercase tracking-tighter select-none">
              ELECTRIC WARRIORS
            </div>
            <p className="font-body-md text-lp-on-surface-variant text-xs">Precision in Darkness.</p>
            <p className="font-label-caps text-[11px] text-lp-on-surface-variant mt-4 opacity-60 select-none">© 2026 Electric Warriors. Shock, Inspire, Lead.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <button 
              className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors cursor-pointer bg-transparent border-none p-0 outline-none" 
              onClick={() => router.push('/privacy-policy')}
            >
              Privacy Policy
            </button>
            <button 
              className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors cursor-pointer bg-transparent border-none p-0 outline-none" 
              onClick={() => router.push('/terms-of-service')}
            >
              Terms of Service
            </button>
            <button 
              className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors cursor-pointer bg-transparent border-none p-0 outline-none" 
              onClick={() => router.push('/partner-program')}
            >
              Partner Program
            </button>
            <button 
              className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors cursor-pointer bg-transparent border-none p-0 outline-none" 
              onClick={() => router.push('/contact-sales')}
            >
              Contact Sales
            </button>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={handleShare}
              title="Share Page"
              className="w-10 h-10 rounded-full border border-lp-outline-variant bg-transparent flex items-center justify-center hover:border-lp-primary transition-colors group cursor-pointer"
            >
              <span className="material-symbols-outlined text-lp-on-surface-variant group-hover:text-lp-primary-container text-lg">share</span>
            </button>
            <button 
              onClick={() => handleScroll('showcase3d')}
              title="Inspect 3D Hardware"
              className="w-10 h-10 rounded-full border border-lp-outline-variant bg-transparent flex items-center justify-center hover:border-lp-primary transition-colors group cursor-pointer"
            >
              <span className="material-symbols-outlined text-lp-on-surface-variant group-hover:text-lp-primary-container text-lg">hub</span>
            </button>
          </div>
        </div>
      </footer>
  );
}



