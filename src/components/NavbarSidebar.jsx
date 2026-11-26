"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Ellipsis,
  FileText,
  HelpCircle,
  PanelLeftClose,
  Pin,
  PinOff,
} from "lucide-react";

const supportLinks = [
  { href: "/faq", label: "FAQ's", icon: HelpCircle },
  { href: "/terms", label: "Terms & Conditions", icon: FileText },
];

function SidebarLink({
  link,
  pathname,
  isClientOnline,
  handleOfflineLinkClick,
  sidebarExpanded,
  onNavigate,
}) {
  const active = pathname === link.href;
  const Icon = link.icon;
  const isCloudDisabled = !isClientOnline && link.href !== "/local";

  return (
    <Link
      key={link.href}
      href={link.href}
      target={link.href === "/admin" ? "_blank" : undefined}
      rel={link.href === "/admin" ? "noopener noreferrer" : undefined}
      onClick={(event) => {
        handleOfflineLinkClick(event, link);
        if (!event.defaultPrevented) onNavigate?.();
      }}
      aria-current={active ? "page" : undefined}
      data-sidebar-item=""
      data-tour-nav={link.href}
      title={!sidebarExpanded ? link.label : undefined}
      className={`rounded-full py-2.5 text-sm font-bold transition-colors duration-200 ease-out flex items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-brand) ${sidebarExpanded ? "px-3 justify-between" : "px-0 justify-center"} ${isCloudDisabled ? "opacity-40 cursor-not-allowed text-(--pg-muted) bg-transparent hover:bg-transparent" : active ? "bg-(--pg-brand-faint) text-(--pg-brand) hover:bg-(--pg-brand-soft)" : "text-(--pg-navtext) bg-transparent hover:bg-(--pg-brand-faint) hover:text-(--pg-brand)"}`}
    >
      <div
        className={`flex items-center ${sidebarExpanded ? "gap-3" : "justify-center"}`}
      >
        <Icon size={16} className="stroke-[2.5px] shrink-0" />
        <span
          className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${sidebarExpanded ? "max-w-40 opacity-100" : "max-w-0 opacity-0"}`}
        >
          {link.label}
        </span>
      </div>
      {isCloudDisabled && sidebarExpanded && (
        <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-(--pg-error-faint) text-(--pg-error) border border-(--pg-error-line)">
          Offline
        </span>
      )}
    </Link>
  );
}

function SidebarSection({ label, links, ...props }) {
  return (
    <nav className="flex flex-col gap-1.5" aria-label={label}>
      {props.sidebarExpanded && (
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-(--pg-muted) px-2 mb-1">
          {label}
        </span>
      )}
      {links.map((link) => (
        <SidebarLink key={link.href} link={link} {...props} />
      ))}
    </nav>
  );
}

export default function NavbarSidebar({
  pathname,
  links,
  manageLinks,
  isClientOnline,
  handleOfflineLinkClick,
  sidebarPinned,
  sidebarLocalHover,
  toggleSidebarPinned,
  collapseSidebar,
  timezone,
  avatarUrl,
  fullName,
  initial,
  email,
}) {
  const sidebarExpanded = sidebarPinned || sidebarLocalHover;
  const navSlotRef = useRef(null);
  const navProbeRef = useRef(null);
  const probeMoreRef = useRef(null);
  const moreButtonRef = useRef(null);
  const morePanelRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(links.length + manageLinks.length + supportLinks.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePosition, setMorePosition] = useState({ top: 8, left: 72, pointerTop: 20 });
  const totalLinks = links.length + manageLinks.length + supportLinks.length;
  const shownCount = Math.min(visibleCount, totalLinks);
  const visibleMain = links.slice(0, shownCount);
  const visibleManage = manageLinks.slice(0, Math.max(0, shownCount - links.length));
  const visibleSupport = supportLinks.slice(0, Math.max(0, shownCount - links.length - manageLinks.length));
  const hiddenMain = links.slice(shownCount);
  const hiddenManage = manageLinks.slice(Math.max(0, shownCount - links.length));
  const hiddenSupport = supportLinks.slice(Math.max(0, shownCount - links.length - manageLinks.length));
  const hiddenLinks = [...hiddenMain, ...hiddenManage, ...hiddenSupport];

  useLayoutEffect(() => {
    const slot = navSlotRef.current;
    const probe = navProbeRef.current;
    if (!slot || !probe) return undefined;
    let active = true;

    const measure = () => {
      if (!active) return;
      const items = [...probe.querySelectorAll('[data-sidebar-item]')];
      const probeTop = probe.getBoundingClientRect().top;
      const moreHeight = probeMoreRef.current?.offsetHeight || 40;
      const available = slot.clientHeight - 2;
      for (let count = items.length; count >= 0; count -= 1) {
        const lastItemBottom = count ? items[count - 1].getBoundingClientRect().bottom - probeTop : 0;
        const required = count === items.length
          ? lastItemBottom
          : lastItemBottom + (count ? 16 : 0) + moreHeight;
        if (required <= available || count === 0) {
          setVisibleCount((current) => current === count ? current : count);
          break;
        }
      }
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(slot);
    observer?.observe(probe);
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sidebarExpanded, links.length, manageLinks.length]);

  useLayoutEffect(() => {
    if (!moreOpen || !hiddenLinks.length) return undefined;
    const updatePosition = () => {
      const rect = moreButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelHeight = Math.min(morePanelRef.current?.offsetHeight || 420, window.innerHeight - 16);
      const buttonMiddle = rect.top + rect.height / 2;
      const top = Math.max(8, Math.min(buttonMiddle - panelHeight / 2, window.innerHeight - panelHeight - 8));
      setMorePosition({
        top,
        left: Math.max(8, Math.min(rect.right + 12, window.innerWidth - 248)),
        pointerTop: Math.max(14, Math.min(buttonMiddle - top, panelHeight - 14)),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [moreOpen, shownCount, sidebarExpanded, hiddenLinks.length]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onPointerDown = (event) => {
      if (!moreButtonRef.current?.contains(event.target) && !morePanelRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!hiddenLinks.length) setMoreOpen(false);
  }, [hiddenLinks.length]);

  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden px-2 py-3 select-none"
    >
        <div
          className={`flex shrink-0 items-center ${sidebarExpanded ? "justify-between px-2" : "justify-center"}`}
        >
          <Link
            href="/"
            className="flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            aria-label="VikaTech home"
          >
            <span
              className={`flex h-10 items-center justify-center overflow-hidden ${sidebarExpanded ? "w-34" : "w-full"} rounded-full bg-white`}
            >
              <img
                src={
                  sidebarExpanded
                    ? "/vikatech_logo.png"
                    : "/vvikatech_logo_house.png"
                }
                alt="VikaTech"
                className={`h-full w-full ${sidebarExpanded ? "object-contain" : "object-cover p-1"}`}
              />
            </span>
          </Link>
          {sidebarExpanded && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSidebarPinned}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-(--pg-muted) transition-colors hover:bg-black/[0.06] hover:text-(--pg-deep)"
                title={sidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
                aria-label={sidebarPinned ? "Unpin sidebar" : "Pin sidebar"}
                aria-pressed={sidebarPinned}
              >
                {sidebarPinned ? <PinOff size={15} /> : <Pin size={15} />}
              </button>
              <button
                type="button"
                onClick={collapseSidebar}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-(--pg-muted) transition-colors hover:bg-black/[0.06] hover:text-(--pg-deep)"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
          )}
        </div>

      <div ref={navSlotRef} className="relative mt-3 min-h-0 flex-1 overflow-hidden">
        <div className="space-y-4">
          {visibleMain.length > 0 && <SidebarSection
            label="MAIN MENU" links={visibleMain} pathname={pathname}
            isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
            sidebarExpanded={sidebarExpanded}
          />}
          {visibleManage.length > 0 && <SidebarSection
            label="MANAGE" links={visibleManage} pathname={pathname}
            isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
            sidebarExpanded={sidebarExpanded}
          />}
          {visibleSupport.length > 0 && <SidebarSection
            label="SUPPORT & LEGAL" links={visibleSupport} pathname={pathname}
            isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
            sidebarExpanded={sidebarExpanded}
          />}
          {hiddenLinks.length > 0 && <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-controls="desktop-sidebar-more"
            className={`flex min-h-10 w-full items-center rounded-full py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-brand) ${sidebarExpanded ? "gap-3 px-3" : "justify-center"} ${moreOpen || hiddenLinks.some((link) => link.href === pathname) ? "bg-(--pg-brand-faint) text-(--pg-brand)" : "text-(--pg-navtext) hover:bg-(--pg-brand-faint) hover:text-(--pg-brand)"}`}
            title={!sidebarExpanded ? `More pages (${hiddenLinks.length})` : undefined}
          >
            <Ellipsis size={18} className="shrink-0 stroke-[2.5px]" />
            {sidebarExpanded && <span>More <span className="text-xs text-(--pg-muted)">({hiddenLinks.length})</span></span>}
          </button>}
        </div>

        <div ref={navProbeRef} inert aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 space-y-4 opacity-0">
          <SidebarSection label="MAIN MENU" links={links} pathname={pathname}
            isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
            sidebarExpanded={sidebarExpanded} />
          <SidebarSection label="MANAGE" links={manageLinks} pathname={pathname}
            isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
            sidebarExpanded={sidebarExpanded} />
          <SidebarSection label="SUPPORT & LEGAL" links={supportLinks} pathname={pathname}
            isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
            sidebarExpanded={sidebarExpanded} />
          <button ref={probeMoreRef} type="button" tabIndex={-1} className="min-h-10 w-full rounded-full py-2.5 text-sm font-bold">More</button>
        </div>
      </div>

      {moreOpen && hiddenLinks.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          ref={morePanelRef}
          className="fixed z-[80] w-60"
          style={{ top: morePosition.top, left: morePosition.left }}
        >
          <span aria-hidden="true" className="pointer-events-none absolute -left-[6px] z-10 h-3 w-3 rotate-45 border-b border-l border-(--pg-line) bg-(--pg-side)" style={{ top: morePosition.pointerTop - 6 }} />
          <nav id="desktop-sidebar-more" aria-label="More pages" className="max-h-[calc(100dvh-16px)] overflow-y-auto rounded-2xl border border-(--pg-line) bg-(--pg-side) p-2 shadow-2xl">
            <div className="space-y-3">
            {hiddenMain.length > 0 && <SidebarSection label="MAIN MENU" links={hiddenMain} pathname={pathname}
              isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
              sidebarExpanded onNavigate={() => setMoreOpen(false)} />}
            {hiddenManage.length > 0 && <SidebarSection label="MANAGE" links={hiddenManage} pathname={pathname}
              isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
              sidebarExpanded onNavigate={() => setMoreOpen(false)} />}
            {hiddenSupport.length > 0 && <SidebarSection label="SUPPORT & LEGAL" links={hiddenSupport} pathname={pathname}
              isClientOnline={isClientOnline} handleOfflineLinkClick={handleOfflineLinkClick}
              sidebarExpanded onNavigate={() => setMoreOpen(false)} />}
            </div>
          </nav>
        </div>,
        document.body,
      )}

      <div
        className={`flex shrink-0 flex-col gap-3 border-t border-(--pg-line) pt-3 ${sidebarExpanded ? "" : "items-center"}`}
      >
        <div
          className={`flex flex-col gap-0.5 px-2 ${sidebarExpanded ? "" : "hidden"}`}
        >
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-(--pg-muted) block">
            Timezone
          </span>
          <span
            className="text-[10px] font-bold text-(--pg-ink) truncate"
            title={timezone}
          >
            Auto ({timezone})
          </span>
        </div>
        <Link
          href="/profile"
          aria-current={pathname === "/profile" ? "page" : undefined}
          className={`flex items-center gap-3 p-2 rounded-xl border transition-colors ${pathname === "/profile" ? "border-(--pg-brand-line) bg-(--pg-brand-faint)" : "border-(--pg-line) bg-(--pg-card) hover:border-(--pg-brand-line) hover:bg-(--pg-brand-faint)"}`}
        >
          <div className="w-8 h-8 rounded-full border border-(--pg-line) bg-(--pg-brand-faint) flex items-center justify-center text-xs font-black text-(--pg-brand) overflow-hidden shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div
            className={`flex flex-col min-w-0 flex-1 ${sidebarExpanded ? "" : "hidden"}`}
          >
            <span className="text-xs font-black text-(--pg-ink) truncate leading-none mb-1">
              {fullName}
            </span>
            <span className="text-[10px] text-(--pg-muted) truncate leading-none">
              {email}
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
