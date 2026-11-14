import Link from "next/link";
import {
  Download,
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
  showInstallBtn,
  handleInstallClick,
  onRequestLogout,
  timezone,
}) {
  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-header/90 backdrop-blur-lg flex items-center justify-around px-2 z-40 md:hidden select-none">
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
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all ${isCloudDisabled ? "opacity-40 cursor-not-allowed" : active ? "text-accent" : "text-text-muted"}`}
            >
              <Icon size={18} className="stroke-[2.5px]" />
              <span className="text-[9px] font-black tracking-tight truncate px-0.5">
                {link.href === "/" ? "Home" : link.label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => {
            setCurrentY(0);
            setMobileOpen(!mobileOpen);
          }}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all cursor-pointer border-none bg-transparent ${mobileOpen ? "text-accent" : "text-text-muted"}`}
        >
          <Menu size={18} className="stroke-[2.5px]" />
          <span className="text-[9px] font-black tracking-tight">Menu</span>
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
        <div className="w-12 h-1 bg-border rounded-full mx-auto my-3.5 cursor-grab active:cursor-grabbing touch-none shrink-0" />
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
                  className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all flex items-center justify-between ${isCloudDisabled ? "opacity-40 cursor-not-allowed text-text-muted/60" : active ? "bg-accent-bg text-accent" : "text-text hover:bg-accent-bg/30"}`}
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
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className="rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all text-text hover:bg-accent-bg/30 flex items-center gap-3"
            >
              <HelpCircle size={16} className="stroke-[2.5px]" />
              <span>FAQ&apos;s</span>
            </Link>
            <Link
              href="/terms"
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className="rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all text-text hover:bg-accent-bg/30 flex items-center gap-3"
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
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-card-alt border border-border hover:border-accent/45 transition-all"
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

          {showInstallBtn && (
            <div className="px-2">
              <button
                onClick={handleInstallClick}
                className="w-full py-3 rounded-xl text-xs font-extrabold bg-accent text-[var(--btn-text)] hover:bg-accent-hover cursor-pointer flex items-center justify-center gap-2"
              >
                <Download size={15} />
                <span>Install Web App</span>
              </button>
            </div>
          )}

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
