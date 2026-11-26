'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUp, Copy, ExternalLink, Headset, Maximize2, Minimize2, Printer, RefreshCw, X } from 'lucide-react';
import { DASHBOARD_SHORTCUTS, readShortcuts } from '@/lib/dashboardShortcuts';

function isEditable(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable], [role="textbox"]'));
}

export default function DashboardTools({ userId, contextOnly = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const [shortcuts, setShortcuts] = useState(() => readShortcuts(userId));
  const [menu, setMenu] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (contextOnly) return undefined;
    const sync = (event) => {
      if (!event?.detail?.userId || event.detail.userId === userId) setShortcuts(readShortcuts(userId));
    };
    sync();
    window.addEventListener('vikatech-shortcuts-change', sync);
    return () => window.removeEventListener('vikatech-shortcuts-change', sync);
  }, [contextOnly, userId]);

  useEffect(() => {
    if (contextOnly) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || isEditable(event.target) || document.querySelector('[aria-modal="true"]') || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
      const key = /^Digit[1-9]$/.test(event.code) ? event.code.slice(-1) : '';
      const action = DASHBOARD_SHORTCUTS.find(({ id }) => key && shortcuts[id] === key);
      if (!action) return;
      event.preventDefault();
      setMenu(null);
      router.push(action.path);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextOnly, router, shortcuts]);

  useEffect(() => {
    const onContextMenu = (event) => {
      if (event.shiftKey || isEditable(event.target) || window.getSelection()?.toString()) return;
      event.preventDefault();
      const width = Math.min(252, window.innerWidth - 16);
      const height = Math.min(370, window.innerHeight - 16);
      setMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)) });
    };
    const onClose = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenu(null);
    };
    const onEscape = (event) => { if (event.key === 'Escape') setMenu(null); };
    const onScroll = () => setMenu(null);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointerdown', onClose);
    window.addEventListener('keydown', onEscape);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerdown', onClose);
      window.removeEventListener('keydown', onEscape);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  useEffect(() => { setMenu(null); }, [pathname]);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (menu) menuRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [menu]);

  const onMenuKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const notify = (message) => window.dispatchEvent(new CustomEvent('show-global-toast', { detail: message }));

  const copyPageLink = async () => {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify('Page link copied.');
    } catch {
      notify('Could not copy the link. Check browser clipboard access.');
    }
  };

  const toggleFullscreen = async () => {
    setMenu(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify('Full screen is unavailable in this browser.');
    }
  };

  const pageActions = [
    { label: 'Reload page', icon: RefreshCw, detail: 'Ctrl + R', run: () => window.location.reload() },
    { label: 'Copy page link', icon: Copy, run: copyPageLink },
    { label: 'Open in new tab', icon: ExternalLink, run: () => { setMenu(null); window.open(window.location.href, '_blank', 'noopener,noreferrer'); } },
    { label: 'Print page', icon: Printer, detail: 'Ctrl + P', run: () => { setMenu(null); window.requestAnimationFrame(() => window.print()); } },
    { label: fullscreen ? 'Exit full screen' : 'Full screen', icon: fullscreen ? Minimize2 : Maximize2, run: toggleFullscreen },
    { label: 'Back to top', icon: ArrowUp, run: () => { setMenu(null); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  ];

  return <>
    {!contextOnly && pathname !== '/support' && <button data-tour="support" type="button" onClick={() => router.push('/support')} aria-label="Open support" title="Support" className="group fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-5 z-[190] inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-xs font-extrabold text-[var(--btn-text)] shadow-[0_6px_18px_rgba(0,0,0,.14)] transition-[width,background-color] duration-200 hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:bottom-7 md:right-7 md:w-11 md:gap-0 md:px-0 md:hover:w-28 md:hover:gap-2 md:focus-visible:w-28 md:focus-visible:gap-2"><Headset size={17} className="shrink-0" aria-hidden="true" /><span className="whitespace-nowrap md:max-w-0 md:overflow-hidden md:opacity-0 md:transition-[max-width,opacity] md:duration-200 md:group-hover:max-w-16 md:group-hover:opacity-100 md:group-focus-visible:max-w-16 md:group-focus-visible:opacity-100">Support</span></button>}
    {menu && <div ref={menuRef} role="menu" aria-label="VikaTech page menu" onKeyDown={onMenuKeyDown} className={`fixed z-[10002] max-h-[calc(100dvh-16px)] w-[min(252px,calc(100vw-16px))] overflow-y-auto rounded-2xl border p-1.5 shadow-[0_16px_40px_rgba(0,0,0,.24)] ${contextOnly ? 'border-lp-outline-variant bg-lp-surface-low text-lp-on-surface' : 'border-border bg-card text-text'}`} style={{ left: menu.x, top: menu.y }}>
      <div className="flex items-center justify-between px-2.5 py-1.5"><span className={`text-[11px] font-black uppercase tracking-wider ${contextOnly ? 'text-lp-on-surface-variant' : 'text-text-muted'}`}>Page actions</span><button type="button" onClick={() => setMenu(null)} aria-label="Close menu" className={`rounded-md p-1 ${contextOnly ? 'text-lp-on-surface-variant hover:bg-lp-primary-container/10 hover:text-lp-primary' : 'text-text-muted hover:bg-card-alt hover:text-text'}`}><X size={15} /></button></div>
      {pageActions.map((action) => {
        const Icon = action.icon;
        return <button key={action.label} role="menuitem" type="button" onClick={action.run} className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-bold focus-visible:outline-none ${contextOnly ? 'hover:bg-lp-primary-container/10 hover:text-lp-primary focus-visible:bg-lp-primary-container/10' : 'hover:bg-accent-bg hover:text-accent focus-visible:bg-accent-bg'}`}><Icon size={15} aria-hidden="true" /><span className="flex-1">{action.label}</span>{action.detail && <span className={`text-[10px] font-semibold ${contextOnly ? 'text-lp-on-surface-variant' : 'text-text-muted'}`}>{action.detail}</span>}</button>;
      })}
      <p className={`border-t px-2.5 pb-1 pt-2 text-[10px] ${contextOnly ? 'border-lp-outline-variant text-lp-on-surface-variant' : 'border-border text-text-muted'}`}>Shift + right-click for browser options</p>
    </div>}
  </>;
}
