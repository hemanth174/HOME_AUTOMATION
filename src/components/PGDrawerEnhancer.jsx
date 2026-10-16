'use client';

import { useEffect } from 'react';

/**
 * Desktop drawer drag-to-close (reference: right-side sheet with a top
 * grabber pill, which is rendered by pure CSS ::before so it is always
 * visible). The drag starts from the panel's top strip (the grabber
 * zone, 40px) so form fields, buttons and scrolling inside the panel
 * are untouched. Dragging RIGHT or DOWN past the threshold closes the
 * dialog by triggering the backdrop's own click-to-close handler, which
 * every dialog already implements; shorter drags snap back.
 * Mobile (<1024px) is ignored: bottom-sheets keep their own gestures.
 */
const PANEL_SELECTOR =
  'div.fixed[class*="bg-black/"] > div:first-child, div.fixed[class*="z-[10000]"] > div:first-child';
const GRAB_ZONE_PX = 40;
const CLOSE_X = 120;
const CLOSE_Y = 140;

export default function PGDrawerEnhancer() {
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const disposers = new Map();

    const enhance = (panel) => {
      if (!(panel instanceof HTMLElement)) return;
      if (panel.dataset.pgDrawer === '1') return;
      panel.dataset.pgDrawer = '1';

      const backdrop = panel.parentElement;
      let dragging = false;
      let startX = 0;
      let startY = 0;

      const inGrabZone = (e) => {
        const rect = panel.getBoundingClientRect();
        return e.clientY - rect.top <= GRAB_ZONE_PX;
      };

      const onDown = (e) => {
        if (!mq.matches) return;
        if (e.button !== undefined && e.button !== 0) return;
        if (!inGrabZone(e)) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        panel.style.transition = 'none';
        // No preventDefault here: a plain click on the grab zone must
        // still work (e.g. focus), only a real drag moves the panel.
      };
      const onMove = (e) => {
        if (!dragging) return;
        const dx = Math.max(0, e.clientX - startX);
        const dy = Math.max(0, e.clientY - startY);
        panel.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      const onUp = (e) => {
        if (!dragging) return;
        dragging = false;
        const dx = Math.max(0, e.clientX - startX);
        const dy = Math.max(0, e.clientY - startY);
        panel.style.transition = '';
        panel.style.transform = '';
        // Every dialog closes on backdrop click — reuse it, add nothing.
        if ((dx > CLOSE_X || dy > CLOSE_Y) && backdrop instanceof HTMLElement) {
          backdrop.click();
        }
      };

      panel.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);

      disposers.set(panel, () => {
        panel.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        delete panel.dataset.pgDrawer;
      });
    };

    const scan = () => {
      if (!mq.matches) return;
      document.querySelectorAll(PANEL_SELECTOR).forEach(enhance);
    };

    const obs = new MutationObserver(scan);
    obs.observe(document.body, { childList: true, subtree: true });
    scan();
    mq.addEventListener('change', scan);

    return () => {
      obs.disconnect();
      mq.removeEventListener('change', scan);
      disposers.forEach((dispose) => dispose());
      disposers.clear();
    };
  }, []);
  return null;
}
