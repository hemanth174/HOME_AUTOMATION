import Link from "next/link";
import {
  Download,
  FileText,
  HelpCircle,
  PanelLeftClose,
  Pin,
  PinOff,
} from "lucide-react";

function SidebarLink({
  link,
  pathname,
  isClientOnline,
  handleOfflineLinkClick,
  sidebarExpanded,
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
      onClick={(event) => handleOfflineLinkClick(event, link)}
      aria-current={active ? "page" : undefined}
      title={!sidebarExpanded ? link.label : undefined}
      className={`rounded-full py-2.5 text-sm font-bold transition-all duration-200 ease-out flex items-center ${sidebarExpanded ? "px-3 justify-between" : "px-0 justify-center"} ${isCloudDisabled ? "opacity-40 cursor-not-allowed text-(--pg-muted) bg-transparent hover:bg-transparent" : active ? (link.href === "/local" ? "bg-(--pg-faint) text-(--pg-ink) border border-(--pg-line)" : "bg-(--pg-faint) text-(--pg-ink)") : "text-(--pg-navtext) bg-transparent hover:bg-black/[0.04] hover:text-(--pg-deep)"}`}
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
  showInstallBtn,
  handleInstallClick,
  timezone,
  avatarUrl,
  fullName,
  initial,
  email,
}) {
  const sidebarExpanded = sidebarPinned || sidebarLocalHover;

  return (
    <div
      className={`flex flex-col h-full justify-between py-5 select-none ${sidebarExpanded ? "px-2" : "px-2"}`}
    >
      <div className="flex flex-col gap-4">
        <div
          className={`flex items-center ${sidebarExpanded ? "justify-between px-2" : "justify-center"}`}
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

        <SidebarSection
          label="MAIN MENU"
          links={links}
          pathname={pathname}
          isClientOnline={isClientOnline}
          handleOfflineLinkClick={handleOfflineLinkClick}
          sidebarExpanded={sidebarExpanded}
        />

        <SidebarSection
          label="MANAGE"
          links={manageLinks}
          pathname={pathname}
          isClientOnline={isClientOnline}
          handleOfflineLinkClick={handleOfflineLinkClick}
          sidebarExpanded={sidebarExpanded}
        />

        <div className="flex flex-col gap-1.5 mt-2">
          {sidebarExpanded && (
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-(--pg-muted) px-2 mb-1">
              SUPPORT &amp; LEGAL
            </span>
          )}
          <Link
            href="/faq"
            className={`rounded-xl py-2.5 text-sm font-bold transition-all duration-200 text-(--pg-navtext) hover:bg-black/[0.04] hover:text-(--pg-deep) flex items-center ${sidebarExpanded ? "px-3 gap-3" : "px-0 justify-center"}`}
          >
            <HelpCircle size={16} className="stroke-[2.5px]" />
            <span
              className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${sidebarExpanded ? "max-w-40 opacity-100" : "max-w-0 opacity-0"}`}
            >
              FAQ&apos;s
            </span>
          </Link>
          <Link
            href="/terms"
            className={`rounded-xl py-2.5 text-sm font-bold transition-all duration-200 text-(--pg-navtext) hover:bg-black/[0.04] hover:text-(--pg-deep) flex items-center ${sidebarExpanded ? "px-3 gap-3" : "px-0 justify-center"}`}
          >
            <FileText size={16} className="stroke-[2.5px]" />
            <span
              className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${sidebarExpanded ? "max-w-40 opacity-100" : "max-w-0 opacity-0"}`}
            >
              Terms &amp; Conditions
            </span>
          </Link>
        </div>
      </div>

      <div
        className={`flex flex-col gap-4 border-t border-(--pg-line) pt-4 ${sidebarExpanded ? "" : "items-center"}`}
      >
        {showInstallBtn && sidebarExpanded && (
          <button
            onClick={handleInstallClick}
            className="mx-2 px-3 py-2.5 rounded-xl text-xs font-extrabold bg-(--pg-brand) text-(--pg-onbrand) hover:bg-(--pg-brand-hover) cursor-pointer flex items-center justify-center gap-2 transition-colors"
          >
            <Download size={14} />
            <span>Install Web App</span>
          </button>
        )}
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
          className="flex items-center gap-3 p-2 rounded-xl bg-(--pg-card) border border-(--pg-line) hover:border-(--pg-brand-line) transition-all"
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
