"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import CursorGlow from "./CursorGlow";
import LandingPageHeader from "./LandingPageHeader";
import LandingHero from "./LandingHero";
import LandingAudience from "./LandingAudience";
import LandingHardware from "./LandingHardware";
import LandingDualPlane from "./LandingDualPlane";
import LandingShowcase from "./LandingShowcase";
import LandingAnalytics from "./LandingAnalytics";
import LandingJourney from "./LandingJourney";
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    setMobileNavOpen(false);
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
        mobileNavOpen={mobileNavOpen}
        navItems={NAV_ITEMS}
        router={router}
        setMobileNavOpen={setMobileNavOpen}
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
        <LandingCta handleAddToCart={handleAddToCart} router={router} />
      </main>
      <LandingFooter
        handleScroll={handleScroll}
        handleShare={handleShare}
        router={router}
      />
    </div>
  );
}
