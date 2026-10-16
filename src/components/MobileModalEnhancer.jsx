'use client';

import { useEffect } from 'react';

// Form-style mobile sheets share this bottom-sheet class pattern. The gesture
// starts only in the top grab area so fields and scrollable content remain usable.
const PANEL_SELECTOR =
  'div.fixed[class*="bg-black/"] > div[class*="max-md:rounded-t"], div.fixed[class*="z-[1000]"] > div[class*="max-md:rounded-t"], div.fixed[class*="z-[10000]"] > div[class*="max-md:rounded-t"]';
const GRAB_ZONE_PX = 64;
const CLOSE_DISTANCE_PX = 96;
const CLOSE_VELOCITY_PX_MS = 0.55;

export default function MobileModalEnhancer() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const disposers = new Map();

    const enhance = (panel) => {
      if (!(panel instanceof HTMLElement) || panel.dataset.mobileModalDrag === '1') return;
      panel.dataset.mobileModalDrag = '1';

      const backdrop = panel.parentElement;
      const dismissTarget = backdrop?.querySelector('div.absolute.inset-0') || backdrop;
      const handle = panel.firstElementChild;
      if (handle instanceof HTMLElement) handle.style.touchAction = 'none';

      let dragging = false;
      let dragged = false;
      let pointerId = null;
      let startY = 0;
      let startTime = 0;

      const resetPanel = () => {
        panel.style.transition = '';
        panel.style.transform = '';
        panel.style.opacity = '';
        panel.style.willChange = '';
      };

      const inGrabZone = (clientY) => {
        const rect = panel.getBoundingClientRect();
        return clientY - rect.top <= GRAB_ZONE_PX;
      };

      const begin = (clientY) => {
        if (!mediaQuery.matches || !inGrabZone(clientY)) return false;
        dragging = true;
        dragged = false;
        startY = clientY;
        startTime = performance.now();
        panel.style.transition = 'none';
        panel.style.willChange = 'transform, opacity';
        return true;
      };

      const move = (clientY, event) => {
        if (!dragging) return;
        const distance = Math.max(0, clientY - startY);
        if (distance > 4) dragged = true;
        if (!dragged) return;
        event.preventDefault();
        panel.style.transform = `translate3d(0, ${distance}px, 0)`;
        panel.style.opacity = String(1 - Math.min(distance / 360, 0.32));
      };

      const finish = (clientY) => {
        if (!dragging) return;
        const distance = Math.max(0, clientY - startY);
        const elapsed = Math.max(1, performance.now() - startTime);
        const shouldClose = dragged && (
          distance >= Math.max(CLOSE_DISTANCE_PX, window.innerHeight * 0.18) ||
          distance / elapsed >= CLOSE_VELOCITY_PX_MS
        );
        dragging = false;
        pointerId = null;

        if (shouldClose && dismissTarget instanceof HTMLElement) {
          panel.style.transition = 'transform 180ms ease, opacity 180ms ease';
          panel.style.transform = 'translate3d(0, 100%, 0)';
          panel.style.opacity = '0';
          window.setTimeout(() => {
            resetPanel();
            dismissTarget.click();
          }, 180);
          return;
        }

        panel.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease';
        panel.style.transform = 'translate3d(0, 0, 0)';
        panel.style.opacity = '1';
        window.setTimeout(resetPanel, 220);
      };

      const onTouchStart = (event) => {
        if (event.touches.length !== 1) return;
        begin(event.touches[0].clientY);
      };

      const onTouchMove = (event) => {
        if (event.touches.length === 1) move(event.touches[0].clientY, event);
      };

      const onTouchEnd = (event) => {
        finish(event.changedTouches[0]?.clientY ?? startY);
      };

      const onPointerDown = (event) => {
        // Touch screens use the touch path above; pointer support remains for pens.
        if (event.pointerType === 'mouse' || event.pointerType === 'touch') return;
        if (begin(event.clientY)) {
          pointerId = event.pointerId;
          panel.setPointerCapture?.(pointerId);
        }
      };

      const onPointerMove = (event) => {
        if (event.pointerId === pointerId) move(event.clientY, event);
      };

      const onPointerUp = (event) => {
        if (event.pointerId !== pointerId) return;
        panel.releasePointerCapture?.(event.pointerId);
        finish(event.clientY);
      };

      const onPointerCancel = (event) => {
        if (event.pointerId !== pointerId) return;
        dragging = false;
        pointerId = null;
        resetPanel();
      };

      panel.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
      window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      window.addEventListener('touchend', onTouchEnd, { capture: true });
      window.addEventListener('touchcancel', onTouchEnd, { capture: true });
      panel.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);

      disposers.set(panel, () => {
        panel.removeEventListener('touchstart', onTouchStart, { capture: true });
        window.removeEventListener('touchmove', onTouchMove, { capture: true });
        window.removeEventListener('touchend', onTouchEnd, { capture: true });
        window.removeEventListener('touchcancel', onTouchEnd, { capture: true });
        panel.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        if (handle instanceof HTMLElement) handle.style.touchAction = '';
        delete panel.dataset.mobileModalDrag;
        resetPanel();
      });
    };

    const scan = () => {
      if (!mediaQuery.matches) return;
      document.querySelectorAll(PANEL_SELECTOR).forEach(enhance);
    };

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    mediaQuery.addEventListener('change', scan);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', scan);
      disposers.forEach((dispose) => dispose());
      disposers.clear();
    };
  }, []);

  return null;
}
