'use client';

import { useEffect } from 'react';

const OVERLAY_SELECTOR = 'div.fixed.inset-0';
const DRAG_ZONE_SELECTOR = '[data-sheet-drag-zone="1"]';
const PANEL_MATCH_SELECTOR = [
  '[role="dialog"]',
  'aside',
  'div[class*="bg-card"]',
  'div[class*="max-md:rounded-t"]',
  'div[class*="shadow-2xl"]',
].join(',');
const GRAB_ZONE_PX = 96;
const CLOSE_X = 120;
const CLOSE_Y = 140;
const INTERACTIVE_SELECTOR =
  'button,a,input,select,textarea,label,[role="button"],[role="switch"],[contenteditable="true"]';

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isBackdrop(element) {
  return element.classList.contains('absolute') && element.classList.contains('inset-0');
}

function findPanel(overlay) {
  if (!(overlay instanceof HTMLElement)) return null;
  const explicit = overlay.querySelector(':scope > [role="dialog"], :scope > aside');
  if (explicit instanceof HTMLElement) return explicit;
  return (
    Array.from(overlay.children).find(
      (child) =>
        child instanceof HTMLElement &&
        !isBackdrop(child) &&
        isVisible(child) &&
        child.matches(PANEL_MATCH_SELECTOR),
    ) || null
  );
}

export default function PGDrawerEnhancer() {
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const disposers = new Map();
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyOverscroll = document.body.style.overscrollBehavior;

    const syncBodyLock = () => {
      const hasDrawer =
        mq.matches &&
        Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).some((overlay) => {
          const panel = findPanel(overlay);
          return panel && isVisible(panel);
        });
      document.body.style.overflow = hasDrawer ? 'hidden' : originalBodyOverflow;
      document.body.style.overscrollBehavior = hasDrawer
        ? 'none'
        : originalBodyOverscroll;
    };

    const closePanel = (overlay, panel) => {
      const backdrop = overlay.querySelector(':scope > .absolute.inset-0');
      const target = backdrop instanceof HTMLElement ? backdrop : overlay;
      target.click();
      window.setTimeout(() => {
        if (!panel.isConnected) return;
        const control = panel.querySelector(
          '[data-sheet-close="1"], [aria-label*="close" i], [title*="close" i]',
        );
        if (control instanceof HTMLElement) {
          control.click();
          return;
        }
        panel.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
          }),
        );
      }, 80);
    };

    const enhance = (overlay, panel) => {
      if (!(panel instanceof HTMLElement)) return;
      if (panel.dataset.pgDrawer === '1') return;
      if (panel.dataset.sheetDragOwner === '1') return;
      panel.dataset.pgDrawer = '1';
      const dragZone = panel.querySelector(DRAG_ZONE_SELECTOR);
      const originalDragZoneCursor = dragZone?.style.cursor || '';
      const originalDragZoneTouchAction = dragZone?.style.touchAction || '';
      if (dragZone) {
        dragZone.style.cursor = 'grab';
        dragZone.style.touchAction = 'none';
      }

      let dragging = false;
      let sideDrawer = false;
      let startX = 0;
      let startY = 0;
      let lastX = 0;
      let lastY = 0;

      const resetPanel = () => {
        panel.style.transition = '';
        panel.style.transform = '';
        panel.style.opacity = '';
        panel.style.willChange = '';
        delete panel.dataset.pgDrawerDragging;
        delete panel.dataset.pgDrawerClosing;
        dragging = false;
        if (dragZone) dragZone.style.cursor = 'grab';
      };

      const begin = (event) => {
        if (!mq.matches) return;
        if (!event.isPrimary) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) {
          return;
        }
        if (!isVisible(panel) || panel.scrollTop > 0) return;

        const rect = panel.getBoundingClientRect();
        const insideDragZone =
          dragZone && event.target instanceof Node && dragZone.contains(event.target);
        if (!insideDragZone && event.clientY - rect.top > GRAB_ZONE_PX) return;

        sideDrawer =
          rect.height >= window.innerHeight * 0.8 &&
          rect.right >= window.innerWidth - 4;
        dragging = true;
        startX = lastX = event.clientX;
        startY = lastY = event.clientY;
        panel.dataset.pgDrawerDragging = '1';
        panel.style.transition = 'none';
        panel.style.willChange = 'transform, opacity';
        if (dragZone) dragZone.style.cursor = 'grabbing';
      };

      const move = (event) => {
        if (!dragging) return;
        lastX = event.clientX;
        lastY = event.clientY;
        const dx = Math.max(0, lastX - startX);
        const dy = Math.max(0, lastY - startY);
        if (dx <= 4 && dy <= 4) return;
        if (event.cancelable) event.preventDefault();
        panel.style.transform = sideDrawer
          ? `translate3d(${dx}px, ${dy}px, 0)`
          : `translate3d(0, ${dy}px, 0)`;
        panel.style.opacity = String(
          1 - Math.min(Math.max(dx, dy) / 360, 0.32),
        );
      };

      const finish = () => {
        if (!dragging) return;
        const dx = Math.max(0, lastX - startX);
        const dy = Math.max(0, lastY - startY);
        const shouldClose = sideDrawer
          ? dx > CLOSE_X || dy > CLOSE_Y
          : dy > CLOSE_Y;
        dragging = false;
        delete panel.dataset.pgDrawerDragging;
        if (dragZone) dragZone.style.cursor = 'grab';

        if (shouldClose) {
          panel.dataset.pgDrawerClosing = '1';
          panel.style.transition =
            'transform 220ms ease-in, opacity 220ms ease-in';
          panel.style.transform = sideDrawer
            ? 'translate3d(100%, 0, 0)'
            : 'translate3d(0, 100%, 0)';
          panel.style.opacity = '0';
          window.setTimeout(() => closePanel(overlay, panel), 220);
          return;
        }

        panel.style.transition =
          'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease';
        panel.style.transform = 'translate3d(0, 0, 0)';
        panel.style.opacity = '1';
        window.setTimeout(resetPanel, 220);
      };

      const cancel = () => {
        if (!dragging) return;
        dragging = false;
        resetPanel();
      };

      panel.addEventListener('pointerdown', begin);
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);

      disposers.set(panel, () => {
        panel.removeEventListener('pointerdown', begin);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        delete panel.dataset.pgDrawer;
        resetPanel();
        if (dragZone && dragZone.isConnected) {
          dragZone.style.cursor = originalDragZoneCursor;
          dragZone.style.touchAction = originalDragZoneTouchAction;
        }
      });
    };

    const scan = () => {
      disposers.forEach((dispose, panel) => {
        if (!panel.isConnected) dispose();
      });
      if (mq.matches) {
        document.querySelectorAll(OVERLAY_SELECTOR).forEach((overlay) => {
          const panel = findPanel(overlay);
          if (panel) enhance(overlay, panel);
        });
      }
      syncBodyLock();
    };

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    mq.addEventListener('change', scan);

    return () => {
      observer.disconnect();
      mq.removeEventListener('change', scan);
      disposers.forEach((dispose) => dispose());
      disposers.clear();
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.overscrollBehavior = originalBodyOverscroll;
    };
  }, []);

  return null;
}
