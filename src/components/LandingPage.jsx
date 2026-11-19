"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Download, X } from "lucide-react";
import CursorGlow from "./CursorGlow";
import LandingPageHeader from "./LandingPageHeader";
import LandingHero from "./LandingHero";
import LandingAudience from "./LandingAudience";
import LandingHardware from "./LandingHardware";
import LandingDualPlane from "./LandingDualPlane";
import LandingShowcase from "./LandingShowcase";
import LandingAnalytics from "./LandingAnalytics";
import LandingJourney from "./LandingJourney";
import VoiceSubscriptionSection from "./VoiceSubscriptionSection";
import LandingCta from "./LandingCta";
import LandingFooter from "./LandingFooter";

const NAV_ITEMS = [
  { id: "home", label: "Home", target: "top" },
  { id: "commercial", label: "Commercial", target: "commercial" },
  { id: "v4", label: "The V4", target: "v4" },
  { id: "dual-plane", label: "Dual-Plane", target: "dual-plane" },
  { id: "showcase3d", label: "3D Explorer", target: "showcase3d" },
  { id: "analytics", label: "Analytics", target: "analytics" },
  { id: "journey", label: "Our Journey", target: "journey" },
];

export default function LandingPage() {
  const router = useRouter();
  const [activeTab3D, setActiveTab3D] = useState("pcb");
  const videoRef = useRef(null);
  const cartRef = useRef(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartPop, setCartPop] = useState(false);
  const [cartShake, setCartShake] = useState(false);
  const [flyItem, setFlyItem] = useState(null);
  const [activeNav, setActiveNav] = useState("home");
  const installPromptRef = useRef(null);
  const [appInstalled, setAppInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showStorageNotice, setShowStorageNotice] = useState(false);

  useEffect(() => {
    try { setShowStorageNotice(localStorage.getItem("vikatech_storage_notice_v1") !== "seen"); } catch {
      setShowStorageNotice(true);
    }
    setAppInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean(navigator.standalone));
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      installPromptRef.current = event;
    };
    const handleInstalled = () => {
      installPromptRef.current = null;
      setAppInstalled(true);
      setShowInstallHelp(false);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const prompt = installPromptRef.current || window.__vikatechInstallPrompt;
    if (!prompt) return setShowInstallHelp(true);
    installPromptRef.current = null;
    window.__vikatechInstallPrompt = null;
    try {
      const choice = await prompt.prompt();
      if (choice?.outcome === "accepted") setAppInstalled(true);
    } catch {
      setShowInstallHelp(true);
    }
  };

  const dismissStorageNotice = () => {
    try { localStorage.setItem("vikatech_storage_notice_v1", "seen"); } catch {}
    setShowStorageNotice(false);
  };

  useEffect(() => {
    if (!showInstallHelp) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowInstallHelp(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showInstallHelp]);

  const handleAddToCart = (e, navigateTo) => {
    const rect = cartRef.current?.getBoundingClientRect();
    const toX = rect
      ? rect.left + rect.width / 2
      : typeof window !== "undefined"
        ? window.innerWidth - 48
        : 0;
    const toY = rect ? rect.top + rect.height / 2 : 48;
    setFlyItem({
      id: Date.now(),
      fromX: e.clientX,
      fromY: e.clientY,
      toX,
      toY,
    });
    setCartCount((c) => c + 1);
    setCartPop(false);
    setCartShake(false);
    requestAnimationFrame(() => {
      setCartPop(true);
      setCartShake(true);
    });
    setTimeout(() => setFlyItem(null), 750);
    setTimeout(() => router.push(navigateTo), 700);
  };

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 1.0;
  }, []);

  const handleScroll = (id) => {
    setActiveNav(id === "top" ? "home" : id);
    if (id === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const sectionIds = [
      "commercial",
      "v4",
      "dual-plane",
      "showcase3d",
      "analytics",
      "journey",
    ];
    const onScrollTop = () => {
      if (window.scrollY < 150)
        setActiveNav((prev) => (prev === "home" ? prev : "home"));
    };
    onScrollTop();
    window.addEventListener("scroll", onScrollTop, { passive: true });
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveNav(entry.target.id);
        }),
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScrollTop);
      observer.disconnect();
    };
  }, []);

  const navLinkClass = (id) =>
    `relative pb-1 cursor-pointer transition-colors after:absolute after:left-0 after:bottom-0 after:h-[2px] after:bg-lp-primary-container after:transition-all after:duration-300 ${activeNav === id ? "text-lp-primary font-bold after:w-full" : "text-lp-secondary hover:text-lp-primary after:w-0 hover:after:w-full"}`;

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Electric Warriors - Smart Home Automation",
          text: "Check out Electric Warriors premium smart home automation switchboards and controllers!",
          url: typeof window !== "undefined" ? window.location.origin : "",
        });
      } catch (err) {
        console.warn("Share cancelled or failed:", err);
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.origin);
        alert("Link copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy link:", err);
      }
    }
  };

  return (
    <div className="bg-lp-bg text-lp-on-surface font-body-md selection:bg-lp-primary-container selection:text-lp-on-primary-container min-h-screen">
      <LandingPageHeader
        activeNav={activeNav}
        activeNavClass={navLinkClass}
        cartCount={cartCount}
        cartPop={cartPop}
        cartRef={cartRef}
        cartShake={cartShake}
        handleScroll={handleScroll}
        navItems={NAV_ITEMS}
        router={router}
        onInstallClick={handleInstallClick}
        appInstalled={appInstalled}
      />
      {flyItem && (
        <span
          key={flyItem.id}
          className="lp-fly-item"
          style={{
            "--fx": `${flyItem.fromX}px`,
            "--fy": `${flyItem.fromY}px`,
            "--tx": `${flyItem.toX - flyItem.fromX}px`,
            "--ty": `${flyItem.toY - flyItem.fromY}px`,
          }}
        />
      )}
      <CursorGlow />
      <main className="pt-28 md:pt-20 overflow-x-clip">
        <LandingHero handleScroll={handleScroll} />
        <LandingAudience router={router} handleScroll={handleScroll} />
        <LandingHardware />
        <LandingDualPlane />
        <LandingShowcase
          activeTab3D={activeTab3D}
          setActiveTab3D={setActiveTab3D}
        />
        <LandingAnalytics videoRef={videoRef} />
        <LandingJourney />
        <VoiceSubscriptionSection />
        <LandingCta handleAddToCart={handleAddToCart} router={router} />
      </main>
      <LandingFooter
        handleScroll={handleScroll}
        handleShare={handleShare}
        router={router}
      />
      {showStorageNotice && (
        <aside className="fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-xl rounded-2xl border border-lp-outline-variant bg-lp-surface-low p-4 shadow-2xl sm:bottom-6 sm:left-6 sm:right-auto" aria-label="Browser storage notice">
          <p className="text-sm font-bold text-lp-on-surface">Your browser storage</p>
          <p className="mt-1 text-xs leading-relaxed text-lp-on-surface-variant">VikaTech uses essential browser storage for sign-in and preferences. We do not use advertising cookies. Read our <a href="/privacy-policy" className="font-bold text-lp-primary underline underline-offset-2">Privacy Policy</a>.</p>
          <button type="button" onClick={dismissStorageNotice} className="mt-3 rounded-lg bg-lp-primary-container px-4 py-2 text-xs font-bold text-lp-on-primary-container">Got it</button>
        </aside>
      )}
      {showInstallHelp && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowInstallHelp(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="install-help-title" className="w-full max-w-sm rounded-2xl border border-lp-outline-variant bg-lp-surface-low p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2"><Download size={18} className="text-lp-primary" /><h2 id="install-help-title" className="text-base font-bold">Install VikaTech</h2></div>
              <button type="button" onClick={() => setShowInstallHelp(false)} aria-label="Close install instructions" className="rounded-lg p-1 text-lp-on-surface-variant hover:bg-white/10"><X size={18} /></button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-lp-on-surface-variant">Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>. On iPhone or iPad, open this page in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>
            <button type="button" onClick={() => setShowInstallHelp(false)} className="mt-5 w-full rounded-lg bg-lp-primary-container px-4 py-2.5 text-sm font-bold text-lp-on-primary-container">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
