'use client';



export default function LandingCta({ handleAddToCart, router }) {
  return (
        <section className="py-12 md:py-24 bg-lp-surface-lowest border-t border-lp-outline-variant relative overflow-hidden" id="partner">
          <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10">
            <div className="p-6 md:p-12 bg-lp-surface border border-lp-outline-variant flex flex-col justify-between rounded">
              <div>
                <div role="heading" aria-level="2" className="font-headline-md text-3xl mb-6 font-extrabold text-lp-on-surface">Direct Sales &amp; Retrofitting</div>
                <p className="font-body-md text-lp-on-surface-variant text-sm mb-8 leading-relaxed">Ready to upgrade your existing space? Pre-order our 4-device relay modules designed for easy retrofitting into any standard switchboard.</p>
              </div>
              <button
                onClick={(e) => handleAddToCart(e, '/contact-sales')}
                className="w-fit px-8 py-4 border-2 border-lp-primary-container text-lp-primary-container font-label-caps font-bold text-sm hover:bg-lp-primary-container/10 hover:shadow-[0_0_20px_rgba(0,255,65,0.3)] transition-all active:scale-95 cursor-pointer rounded"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">add_shopping_cart</span>
                  Pre-Order Modules
                </span>
              </button>
            </div>
            <div className="p-6 md:p-12 bg-lp-primary-container text-lp-on-primary-container flex flex-col justify-between rounded">
              <div>
                <div role="heading" aria-level="2" className="font-headline-md text-3xl mb-6 font-extrabold text-lp-on-primary-container">Builder Partnerships</div>
                <p className="font-body-md text-lp-on-primary-container/80 text-sm mb-8 leading-relaxed">For real estate developers: Install Electric Warriors tech from the ground up. Offer your clients premium, integrated intelligence and command a higher market value.</p>
              </div>
              <button
                onClick={() => router.push('/partner-program')}
                className="w-fit px-8 py-4 bg-lp-on-primary-container text-lp-primary-container font-label-caps font-bold text-sm hover:shadow-xl hover:scale-[1.03] transition-all active:scale-95 cursor-pointer rounded"
              >
                Partner With Us
              </button>
            </div>
          </div>
        </section>
  );
}



