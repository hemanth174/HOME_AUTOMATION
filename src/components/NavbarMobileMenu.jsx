import Link from "next/link";
import {
  FileText,
  HelpCircle,
  LogOut,
  Menu,
} from "lucide-react";

export default function NavbarMobileMenu({
  pathname,
  bottomBarLinks,
  sheetLinks,
  isClientOnline,
  mobileOpen,
  setMobileOpen,
  handleOfflineLinkClick,
  currentY,
  setCurrentY,
  handlePointerDown,
  handlePointerMove,
  handlePointerEnd,
  isDragging,
  sheetContentRef,
  fullName,
  email,
  avatarUrl,
  initial,
  onRequestLogout,
  timezone,
}) {
  return (
    <>
      <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center gap-1 border-t border-border bg-header/90 px-2 backdrop-blur-lg select-none md:hidden">
        {bottomBarLinks.map((link) => {
          const active = pathname === link.href && !mobileOpen;
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
                setMobileOpen(false);
              }}
              aria-current={active ? "page" : undefined}
              data-tour-nav={link.href}
              className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${isCloudDisabled ? "cursor-not-allowed opacity-40" : active ? "bg-accent-bg text-accent" : "text-text-muted hover:bg-accent-bg/70 hover:text-accent active:bg-accent-bg active:text-accent"}`}
            >
              <span className="flex h-6 w-6 items-center justify-center"><Icon size={20} strokeWidth={2.25} aria-hidden="true" /></span>
              <span className="max-w-full truncate px-0.5 text-[10px] font-black leading-tight tracking-tight">
                {link.href === "/" ? "Home" : link.label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation-sheet"
          onClick={() => {
            setCurrentY(0);
            setMobileOpen(!mobileOpen);
          }}
          className={`flex min-h-[52px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-none transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${mobileOpen ? "bg-accent-bg text-accent" : "bg-transparent text-text-muted hover:bg-accent-bg/70 hover:text-accent active:bg-accent-bg active:text-accent"}`}
        >
          <span className="flex h-6 w-6 items-center justify-center"><Menu size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span className="text-[10px] font-black leading-tight tracking-tight">Menu</span>
        </button>
      </nav>

      <div
        onClick={() => {
          setMobileOpen(false);
          setCurrentY(0);
        }}
        className={`fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300 ${mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      />
      <div
        id="mobile-navigation-sheet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{
          transform: `translateY(${mobileOpen ? `${currentY}px` : "100%"})`,
          transition: isDragging
            ? "none"
            : "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className="fixed bottom-0 left-0 right-0 max-h-[80vh] border-t border-border bg-card rounded-t-[24px] z-50 md:hidden flex flex-col select-none overflow-hidden"
      >
        <div data-sheet-handle="1" className="flex h-9 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing" aria-label="Drag down to close menu">
          <span className="h-1 w-12 rounded-full bg-border" aria-hidden="true" />
        </div>
        <div
          ref={sheetContentRef}
          className="overflow-y-auto px-4 pb-8 flex flex-col gap-5"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-text-muted px-2">
              More Options
            </span>
            {sheetLinks.map((link) => {
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
                    setMobileOpen(false);
                    setCurrentY(0);
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition-colors flex items-center justify-between ${isCloudDisabled ? "opacity-40 cursor-not-allowed text-text-muted/60" : active ? "bg-accent-bg text-accent" : "text-text hover:bg-accent-bg/70 hover:text-accent"}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} className="stroke-[2.5px]" />
                    <span>{link.label}</span>
                  </div>
                  {isCloudDisabled && (
                    <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                      Offline
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-text-muted px-2">
              Support &amp; Legal
            </span>
            <Link
              href="/faq"
              aria-current={pathname === "/faq" ? "page" : undefined}
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition-colors flex items-center gap-3 ${pathname === "/faq" ? "bg-accent-bg text-accent" : "text-text hover:bg-accent-bg/70 hover:text-accent"}`}
            >
              <HelpCircle size={16} className="stroke-[2.5px]" />
              <span>FAQ&apos;s</span>
            </Link>
            <Link
              href="/terms"
              aria-current={pathname === "/terms" ? "page" : undefined}
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition-colors flex items-center gap-3 ${pathname === "/terms" ? "bg-accent-bg text-accent" : "text-text hover:bg-accent-bg/70 hover:text-accent"}`}
            >
              <FileText size={16} className="stroke-[2.5px]" />
              <span>Terms &amp; Conditions</span>
            </Link>
          </div>

          <div className="flex flex-col gap-1.5 px-2">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-text-muted">
              Account Profile
            </span>
            <Link
              href="/profile"
              aria-current={pathname === "/profile" ? "page" : undefined}
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${pathname === "/profile" ? "border-accent/45 bg-accent-bg" : "border-border bg-card-alt hover:border-accent/45 hover:bg-accent-bg/70"}`}
            >
              <div className="w-8 h-8 rounded-full border border-border bg-accent-bg flex items-center justify-center text-xs font-black text-accent overflow-hidden shrink-0">
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
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-black text-text truncate leading-none mb-1">
                  {fullName}
                </span>
                <span className="text-[10px] text-text-muted truncate leading-none">
                  {email}
                </span>
              </div>
            </Link>
          </div>


          <div className="px-2">
            <button
              onClick={() => {
                setMobileOpen(false);
                onRequestLogout();
              }}
              className="w-full py-3 rounded-xl text-xs font-extrabold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <LogOut size={16} className="stroke-[2.5px]" />
              <span>Log Out</span>
            </button>
          </div>

          <div className="flex flex-col gap-0.5 px-2">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted block">
              Timezone
            </span>
            <span
              className="text-[10px] font-bold text-text truncate leading-none"
              title={timezone}
            >
              Auto ({timezone})
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
