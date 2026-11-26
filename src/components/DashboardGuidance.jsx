'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Bell, CalendarDays, Cpu, SlidersHorizontal, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isPushEnabledForUser } from '@/lib/browserNotifications';

const tourKey = (userId) => `vikatech:dashboard-tour:v1:${userId}`;
const hintKey = (userId, feature) => `vikatech:feature-hint:${userId}:${feature}`;
const HINT_COOLDOWN = 7 * 24 * 60 * 60 * 1000;

function visibleTarget(selector) {
  return [...document.querySelectorAll(selector)].find((element) =>
    !element.closest('[inert]') && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden'
  );
}

function readSaved(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function save(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

function hintPosition(target) {
  const rect = target.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 24);
  const height = 112;
  const side = rect.top > window.innerHeight - 150 ? 'top'
    : rect.right < window.innerWidth * 0.38 && window.innerWidth >= 640 ? 'right' : 'bottom';
  const left = side === 'right'
    ? Math.min(window.innerWidth - width - 12, rect.right + 14)
    : Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
  const top = side === 'top'
    ? rect.top - 14
    : side === 'right'
      ? Math.max(12, Math.min(rect.top + rect.height / 2 - height / 2, window.innerHeight - height - 12))
      : Math.max(12, Math.min(rect.bottom + 14, window.innerHeight - height - 12));
  return { side, left, top, pointer: side === 'right'
    ? Math.max(16, Math.min(rect.top + rect.height / 2 - top, height - 16))
    : Math.max(16, Math.min(rect.left + rect.width / 2 - left, width - 16)) };
}

export default function DashboardGuidance({ userId, pathname }) {
  const router = useRouter();
  const [tourReady, setTourReady] = useState(false);
  const [hint, setHint] = useState(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const hideHintTimer = useRef(null);

  useEffect(() => {
    if (pathname !== '/' || !userId) { setTourReady(false); return undefined; }
    let cancelled = false;
    let tour = null;
    let tries = 0;
    let timer = null;
    const replay = (() => {
      try {
        const requested = sessionStorage.getItem('vikatech:replay-tour') === userId;
        if (requested) sessionStorage.removeItem('vikatech:replay-tour');
        return requested;
      } catch { return false; }
    })();
    if (readSaved(tourKey(userId)) && !replay) { setTourReady(true); return undefined; }

    const start = async () => {
      const overview = visibleTarget('[data-tour="overview"]');
      if (!overview) {
        if (++tries < 50) timer = window.setTimeout(start, 250);
        else setTourReady(true);
        return;
      }
      const steps = [
        { element: overview, popover: { title: 'Your home, at a glance', description: 'Check your board connection and device state here before sending a command.', side: 'bottom' } },
        { element: visibleTarget('[data-tour-nav="/boards"]'), popover: { title: 'Rooms and devices', description: 'Open your connected rooms and manage each board from here.', side: 'right' } },
        { element: visibleTarget('[data-tour="room-controls"]'), popover: { title: 'Control a room', description: 'Choose a room, then use its device controls. The dashboard shows when a board has checked in.', side: 'bottom' } },
        { element: visibleTarget('[data-tour="presets"]'), popover: { title: 'One tap presets', description: 'Save a group of device actions and run it from the dashboard.', side: 'right' } },
        { element: visibleTarget('[data-tour="notifications"]'), popover: { title: 'Stay informed', description: 'Open your alerts here. You can enable background alerts from this panel when you want them.', side: 'bottom' } },
        { element: visibleTarget('[data-tour="support"]'), popover: { title: 'Help is close by', description: 'Use Support whenever you need to open or follow a ticket.', side: 'top' } },
      ].filter((step) => step.element);
      if (cancelled) return;
      const { driver } = await import('driver.js');
      if (cancelled) return;
      tour = driver({
        steps, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        duration: 320, smoothScroll: true,
        overlayColor: '#080d0a', overlayOpacity: 0.64,
        stagePadding: 8, stageRadius: 14, popoverClass: 'vika-tour-popover',
        showProgress: true, progressText: '{{current}} of {{total}}',
        nextBtnText: 'Next', prevBtnText: 'Back', doneBtnText: 'Finish',
        closeBtnLabel: 'Skip walkthrough',
        allowKeyboardControl: true, overlayClickBehavior: 'close',
        disableActiveInteraction: true,
        onDestroyed: (_element, _step, { reason }) => {
          if (reason !== 'api' && reason !== 'replaced') save(tourKey(userId), '1');
          if (!cancelled) setTourReady(true);
        },
      });
      tour.drive();
    };
    timer = window.setTimeout(start, 650);
    return () => { cancelled = true; clearTimeout(timer); tour?.destroy(); };
  }, [pathname, userId]);

  useEffect(() => {
    if (pathname !== '/' || !userId || !tourReady) return undefined;
    let cancelled = false;
    let target = null;
    let peekTimer = null;
    let removeListeners = () => {};

    const prepare = async () => {
      let boards;
      let presets;
      let schedules;
      try {
        [boards, presets, schedules] = await Promise.all([
          supabase.from('boards').select('id').eq('user_id', userId).is('deleted_at', null).limit(1),
          supabase.from('presets').select('id').eq('user_id', userId).is('deleted_at', null).limit(1),
          supabase.from('schedules').select('id').eq('user_id', userId).is('deleted_at', null).limit(1),
        ]);
      } catch { return; }
      if (cancelled) return;
      const candidates = [
        {
          id: 'notifications', title: 'Turn on alerts',
          body: typeof Notification !== 'undefined' && Notification.permission === 'denied'
            ? 'Allow alerts in your browser settings.'
            : 'Get alerts even when the app is closed.',
          action: 'Open alerts', selector: '[data-tour="notifications"]', icon: Bell,
          eligible: typeof Notification !== 'undefined' && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
            (Notification.permission !== 'granted' || !isPushEnabledForUser(userId)),
        },
        {
          id: 'boards', title: 'Add your first board',
          body: 'Connect a board to control devices.',
          action: 'Open boards', selector: '[data-tour-nav="/boards"]', icon: Cpu,
          eligible: !boards.error && boards.data?.length === 0,
        },
        {
          id: 'presets', title: 'Try a preset',
          body: 'Run several device actions in one tap.',
          action: 'Create a preset', selector: '[data-tour-nav="/presets"]', icon: SlidersHorizontal,
          eligible: !boards.error && (boards.data?.length || 0) > 0 && !presets.error && presets.data?.length === 0,
        },
        {
          id: 'schedules', title: 'Schedule a device',
          body: 'Set a time for it to run automatically.',
          action: 'Open schedules', selector: '[data-tour-nav="/schedules"]', icon: CalendarDays,
          eligible: !boards.error && (boards.data?.length || 0) > 0 && !schedules.error && schedules.data?.length === 0,
        },
      ];
      const current = candidates.find((candidate) => {
        const saved = readSaved(hintKey(userId, candidate.id));
        if (!candidate.eligible || saved === 'dismissed' || (Number(saved) > Date.now() - HINT_COOLDOWN)) return false;
        const found = visibleTarget(candidate.selector);
        if (!found) return false;
        target = found;
        return true;
      });
      if (!current || !target) return;
      setHint(current);
      target.classList.add('vika-hint-anchor');
      const show = () => {
        save(hintKey(userId, current.id), Date.now());
        setPosition(hintPosition(target));
        setHintOpen(true);
        clearTimeout(hideHintTimer.current);
      };
      const hide = () => { hideHintTimer.current = window.setTimeout(() => setHintOpen(false), 300); };
      const reposition = () => setPosition(hintPosition(target));
      target.addEventListener('mouseenter', show);
      target.addEventListener('mouseleave', hide);
      target.addEventListener('focusin', show);
      target.addEventListener('focusout', hide);
      window.addEventListener('resize', reposition);
      window.addEventListener('scroll', reposition, true);
      const closeForVisit = () => {
        clearTimeout(peekTimer);
        clearTimeout(hideHintTimer.current);
        removeListeners();
        setHintOpen(false);
        setHint(null);
      };
      const closeWhenAlertsEnabled = (event) => {
        if (current.id === 'notifications' && event.detail?.userId === userId && event.detail?.enabled) closeForVisit();
      };
      window.addEventListener('vikatech:guidance-dismiss', closeForVisit);
      window.addEventListener('vikatech-push-preference-change', closeWhenAlertsEnabled);
      removeListeners = () => {
        target.classList.remove('vika-hint-anchor');
        target.removeEventListener('mouseenter', show);
        target.removeEventListener('mouseleave', hide);
        target.removeEventListener('focusin', show);
        target.removeEventListener('focusout', hide);
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('vikatech:guidance-dismiss', closeForVisit);
        window.removeEventListener('vikatech-push-preference-change', closeWhenAlertsEnabled);
      };
      peekTimer = window.setTimeout(() => {
        if (cancelled || document.hidden || document.querySelector('[aria-modal="true"], .driver-active')) return;
        show();
        hideHintTimer.current = window.setTimeout(() => setHintOpen(false), 6500);
      }, 18000);
    };
    void prepare();
    return () => {
      cancelled = true;
      clearTimeout(peekTimer);
      clearTimeout(hideHintTimer.current);
      removeListeners();
      setHintOpen(false);
    };
  }, [pathname, tourReady, userId]);

  if (!hint || !hintOpen || !position) return null;
  const Icon = hint.icon;
  const dismiss = () => {
    save(hintKey(userId, hint.id), 'dismissed');
    window.dispatchEvent(new Event('vikatech:guidance-dismiss'));
  };
  const openFeature = () => {
    save(hintKey(userId, hint.id), 'dismissed');
    window.dispatchEvent(new Event('vikatech:guidance-dismiss'));
    if (hint.id === 'notifications') visibleTarget(hint.selector)?.click();
    else router.push(hint.id === 'presets' ? '/presets' : hint.id === 'boards' ? '/boards' : '/schedules');
  };

  return <div role="dialog" aria-label={hint.title} className="vika-feature-hint fixed z-[1000] w-[min(280px,calc(100vw-24px))] rounded-xl border border-(--pg-line) bg-(--pg-card) p-3 text-(--pg-ink) shadow-[0_14px_36px_rgba(0,0,0,.2)]" style={{ left: position.left, top: position.top, translate: position.side === 'top' ? '0 -100%' : undefined }} onMouseEnter={() => clearTimeout(hideHintTimer.current)} onMouseLeave={() => { hideHintTimer.current = window.setTimeout(() => setHintOpen(false), 300); }}>
    <span aria-hidden="true" className={`absolute h-3 w-3 rotate-45 border-(--pg-line) bg-(--pg-card) ${position.side === 'top' ? '-bottom-[6px] border-b border-r' : position.side === 'right' ? '-left-[6px] border-b border-l' : '-top-[6px] border-l border-t'}`} style={position.side === 'right' ? { top: position.pointer - 6 } : { left: position.pointer - 6 }} />
    <div className="flex items-start gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--pg-brand-line) bg-(--pg-brand-faint) text-(--pg-brand)"><Icon size={16} strokeWidth={2.3} aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-xs font-extrabold leading-4">{hint.title}</p><p className="mt-0.5 text-[11px] leading-4 text-(--pg-muted)">{hint.body}</p></div><button type="button" onClick={dismiss} aria-label="Dismiss suggestion" className="rounded-md p-1 text-(--pg-muted) hover:bg-(--pg-faint) hover:text-(--pg-ink)"><X size={14} /></button></div>
    <button type="button" onClick={openFeature} className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-extrabold text-(--pg-brand) hover:underline focus-visible:outline-2 focus-visible:outline-(--pg-brand)">{hint.action}<ArrowUpRight size={14} aria-hidden="true" /></button>
  </div>;
}
