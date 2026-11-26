"use client";

import { useEffect, useRef } from "react";
import { Download } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function LandingPageHeader({
  activeNav,
  activeNavClass,
  cartCount,
  cartPop,
  cartRef,
  cartShake,
  handleScroll,
  navItems,
  router,
  onInstallClick,
  appInstalled,
}) {
  const mobileNavRef = useRef(null);

  useEffect(() => {
    const activeItem = mobileNavRef.current?.querySelector(
      `[data-nav-id="${activeNav}"]`,
    );
    activeItem?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeNav]);

  return (
    <>
      <header className="fixed top-0 z-50 flex min-h-16 w-full items-center justify-between gap-3 border-b border-lp-outline-variant bg-lp-bg/85 px-3 py-2 sm:px-5 md:min-h-0 md:px-6 md:py-4 lp-glass-blur">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden select-none sm:hidden">
            <img
              src="/vvikatech_logo_house.png"
              alt="VikaTech"
              draggable="false"
              className="h-auto w-24 max-w-none shrink-0"
            />
          </div>
          <div
            className="hidden h-9 w-24 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm select-none shrink-0 sm:flex md:h-11 md:w-32"
          >
            <img
              src="/vikatech_logo.png"
              alt="VikaTech"
              draggable="false"
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
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3 md:gap-4">
          <ThemeToggle size={14} className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-lp-outline-variant text-lp-on-surface-variant transition-colors hover:bg-lp-primary-container/10 hover:text-lp-primary disabled:cursor-wait disabled:opacity-70 sm:h-9 sm:w-9" />
          {!appInstalled && (
            <button
              type="button"
              onClick={onInstallClick}
              title="Install VikaTech app"
              aria-label="Install VikaTech app"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-lp-primary-container/40 text-lp-primary transition-colors hover:bg-lp-primary-container/10 sm:h-9 sm:w-9 md:h-11 md:w-auto md:px-3"
            >
              <Download size={14} aria-hidden="true" />
              <span className="hidden text-[11px] font-bold md:inline">Install App</span>
            </button>
          )}
          <button
            ref={cartRef}
            onClick={() => router.push("/contact-sales")}
            title="Pre-Order Cart"
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-lp-primary-container/40 bg-lp-surface-lowest/60 transition-all hover:bg-lp-primary-container/10 hover:shadow-[0_0_15px_rgba(0,255,65,0.25)] active:scale-90 sm:h-9 sm:w-9 md:h-11 md:w-11 cursor-pointer ${cartShake ? "lp-cart-shake" : ""}`}
          >
            <span className="material-symbols-outlined text-base text-lp-primary-container sm:text-lg">
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
            className="inline-flex h-8 shrink-0 items-center rounded border border-lp-primary-container/40 px-2.5 font-label-caps text-[10px] text-lp-primary transition-all hover:bg-lp-primary-container/10 active:scale-95 sm:h-9 md:h-11 md:px-4 md:text-[12px] cursor-pointer whitespace-nowrap"
          >
            Login
          </button>
        </div>
      </header>
      <div className="lg:hidden fixed top-[64px] left-0 right-0 z-30 bg-lp-bg/85 lp-glass-blur border-b border-lp-outline-variant/60">
        <div
          ref={mobileNavRef}
          className="flex gap-2 overflow-x-auto px-3 py-2 scrollbar-none"
          style={{ scrollbarWidth: "none" }}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              data-nav-id={item.id}
              onClick={() => handleScroll(item.target)}
              onMouseEnter={() => handleScroll(item.target)}
              className={`shrink-0 min-h-[36px] px-3.5 rounded-full border text-[11px] font-label-caps font-bold whitespace-nowrap transition-all cursor-pointer hover:border-lp-primary-container hover:text-lp-primary hover:bg-lp-primary-container/10 ${
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
