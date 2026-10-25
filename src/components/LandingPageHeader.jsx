"use client";

import ThemeToggle from "./ThemeToggle";

export default function LandingPageHeader({
  activeNav,
  activeNavClass,
  cartCount,
  cartPop,
  cartRef,
  cartShake,
  handleScroll,
  mobileNavOpen,
  navItems,
  router,
  setMobileNavOpen,
}) {
  return (
    <>
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-6 py-3 md:py-4 bg-lp-bg/85 lp-glass-blur border-b border-lp-outline-variant">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
            className="lg:hidden w-11 h-11 -ml-1 rounded-lg border border-lp-outline-variant bg-lp-surface-low/60 flex items-center justify-center text-white active:scale-95 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-xl">
              {mobileNavOpen ? "close" : "menu"}
            </span>
          </button>
          <div className="flex h-9 w-28 md:h-11 md:w-36 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm select-none shrink-0">
            <img
              src="/vikatech-logo.png"
              alt="VikaTech"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
        <nav className="hidden lg:flex gap-3 xl:gap-8 font-label-caps text-[10px] xl:text-[12px] tracking-tight items-center">
          <button
            onClick={() => handleScroll("top")}
            className={activeNavClass("home")}
          >
            Home
          </button>
          <button
            onClick={() => handleScroll("commercial")}
            className={activeNavClass("commercial")}
          >
            Commercial
          </button>
          <button
            onClick={() => handleScroll("v4")}
            className={activeNavClass("v4")}
          >
            The V4
          </button>
          <button
            onClick={() => handleScroll("dual-plane")}
            className={activeNavClass("dual-plane")}
          >
            Dual-Plane
          </button>
          <button
            onClick={() => handleScroll("showcase3d")}
            className={activeNavClass("showcase3d")}
          >
            3D Explorer
          </button>
          <button
            onClick={() => handleScroll("analytics")}
            className={activeNavClass("analytics")}
          >
            Analytics
          </button>
          <button
            onClick={() => handleScroll("journey")}
            className={activeNavClass("journey")}
          >
            Our Journey
          </button>
        </nav>
        <div className="flex gap-2 md:gap-4 items-center shrink-0">
          <ThemeToggle />
          <button
            ref={cartRef}
            onClick={() => router.push("/contact-sales")}
            title="Pre-Order Cart"
            className={`relative w-10 h-10 md:w-11 md:h-11 rounded-full border border-lp-primary-container/40 bg-lp-surface-lowest/60 flex items-center justify-center hover:bg-lp-primary-container/10 hover:shadow-[0_0_15px_rgba(0,255,65,0.25)] transition-all active:scale-90 cursor-pointer ${cartShake ? "lp-cart-shake" : ""}`}
          >
            <span className="material-symbols-outlined text-lp-primary-container text-lg">
              shopping_cart
            </span>
            {cartCount > 0 && (
              <span
                key={cartCount}
                className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-lp-primary-container text-lp-on-primary-container text-[9px] font-label-caps font-bold flex items-center justify-center ${cartPop ? "lp-cart-pop" : ""}`}
              >
                {cartCount}
              </span>
            )}
          </button>
          <button
            onClick={() => router.push("/login")}
            className="px-3 py-1.5 md:px-4 md:py-2 border border-lp-primary-container/40 text-lp-primary font-label-caps text-[10px] md:text-[12px] hover:bg-lp-primary-container/10 transition-all active:scale-95 cursor-pointer rounded whitespace-nowrap"
          >
            Login
          </button>
        </div>
      </header>
      {mobileNavOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav className="absolute top-[64px] left-2 right-2 rounded-2xl border border-lp-outline-variant bg-lp-surface-lowest/95 backdrop-blur-xl shadow-2xl p-2 max-h-[70svh] overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleScroll(item.target)}
                className={`w-full min-h-[48px] flex items-center justify-between px-4 py-3 rounded-xl font-label-caps text-[13px] tracking-wide transition-colors cursor-pointer ${
                  activeNav === item.id
                    ? "bg-lp-primary-container/10 text-lp-primary font-bold"
                    : "text-lp-on-surface-variant hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`h-5 w-1 rounded-full ${activeNav === item.id ? "bg-lp-primary-container" : "bg-transparent"}`}
                  />
                  {item.label}
                </span>
                <span className="material-symbols-outlined text-base opacity-60">
                  arrow_forward
                </span>
              </button>
            ))}
            <button
              onClick={() => router.push("/login")}
              className="w-full min-h-[48px] mt-2 px-4 py-3 rounded-xl border border-lp-primary-container/40 text-lp-primary font-label-caps text-[13px] font-bold hover:bg-lp-primary-container/10 transition-all cursor-pointer"
            >
              Login
            </button>
          </nav>
        </div>
      )}
      <div className="lg:hidden fixed top-[64px] left-0 right-0 z-30 bg-lp-bg/85 lp-glass-blur border-b border-lp-outline-variant/60">
        <div
          className="flex gap-2 overflow-x-auto px-3 py-2 scrollbar-none"
          style={{ scrollbarWidth: "none" }}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleScroll(item.target)}
              className={`shrink-0 min-h-[36px] px-3.5 rounded-full border text-[11px] font-label-caps font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeNav === item.id
                  ? "bg-lp-primary-container text-lp-on-primary-container border-lp-primary-container"
                  : "bg-lp-surface-low text-lp-on-surface-variant border-lp-outline-variant"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
