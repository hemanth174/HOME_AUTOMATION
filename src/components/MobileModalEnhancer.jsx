'use client';

import { useEffect } from 'react';

// Mobile sheets use the max-md:rounded-t panel pattern. This shared enhancer
// attaches one consistent drag gesture instead of every modal rolling its own.
const PANEL_SELECTOR = 'div.fixed.inset-0 > div[class*="max-md:rounded-t"]';
const HANDLE_SELECTOR = '[data-sheet-handle="1"]';
const DRAG_ZONE_SELECTOR = '[data-sheet-drag-zone="1"]';
const GRAB_ZONE_PX = 72;
const CLOSE_DISTANCE_PX = 64;
const CLOSE_VELOCITY_PX_MS = 0.35;
const INTERACTIVE_SELECTOR =
  'button,a,input,select,textarea,label,[role="button"],[role="switch"],[contenteditable="true"]';
const CLOSE_LABEL_PATTERN = /^(cancel|close|dismiss|done|back|not now|no,? thanks|no,? cancel)$/;

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findCloseControl(target) {
  if (!(target instanceof Element)) return null;
  const control = target.closest('button,a,[role="button"]');
  if (!control || control.disabled) return null;
  if (control.hasAttribute('data-sheet-close')) return control;
  const label = `${control.getAttribute('aria-label') || ''} ${
    control.textContent || ''
  }`
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return CLOSE_LABEL_PATTERN.test(label) || label.includes('close')
    ? control
    : null;
}

export default function MobileModalEnhancer() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const disposers = new Map();
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyOverscroll = document.body.style.overscrollBehavior;

    const syncBodyLock = () => {
      const hasSheet =
        mediaQuery.matches &&
        Array.from(document.querySelectorAll(PANEL_SELECTOR)).some(isVisible);
      document.body.style.overflow = hasSheet ? 'hidden' : originalBodyOverflow;
      document.body.style.overscrollBehavior = hasSheet
        ? 'none'
        : originalBodyOverscroll;
    };

    const enhance = (panel) => {
      if (!(panel instanceof HTMLElement) || panel.dataset.mobileModalDrag === '1') {
        return;
      }
      if (panel.dataset.sheetDragOwner === '1') return;

      const handle = panel.querySelector(HANDLE_SELECTOR);
      const dragZone = panel.querySelector(DRAG_ZONE_SELECTOR);
      const originalHandleCursor = handle?.style.cursor || '';
      const originalHandleTouchAction = handle?.style.touchAction || '';
      const originalDragZoneCursor = dragZone?.style.cursor || '';
      const originalDragZoneTouchAction = dragZone?.style.touchAction || '';

      if (handle) {
        handle.style.cursor = 'grab';
        handle.style.touchAction = 'none';
      }
      if (dragZone) {
        dragZone.style.cursor = 'grab';
        dragZone.style.touchAction = 'none';
      }

      panel.dataset.mobileModalDrag = '1';
      panel.dataset.mobileSheet = '1';

      const backdrop = panel.parentElement;
      const dismissTarget =
        backdrop?.querySelector(':scope > div.absolute.inset-0') || backdrop;

      let dragging = false;
      let closing = false;
      let suppressNextClick = false;
      let suppressNextKey = false;
      let dragged = false;
      let startY = 0;
      let startX = 0;
      let lastY = 0;
      let startTime = 0;

      const resetPanel = () => {
        panel.style.transition = '';
        panel.style.transform = '';
        panel.style.opacity = '';
        panel.style.animation = 'none';
        panel.style.willChange = '';
        delete panel.dataset.mobileSheetDragging;
        delete panel.dataset.mobileSheetClosing;
        closing = false;
        if (handle) handle.style.cursor = 'grab';
        if (dragZone) dragZone.style.cursor = 'grab';
      };

      const cancelDrag = () => {
        if (!dragging) return;
        dragging = false;
        resetPanel();
      };

      const slideOut = (done) => {
        if (closing) return;
        closing = true;
        dragging = false;
        panel.dataset.mobileSheetClosing = '1';
        panel.style.animation = 'none';
        panel.style.transition = 'transform 220ms ease-in, opacity 220ms ease-in';
        panel.style.transform = 'translate3d(0, 100%, 0)';
        panel.style.opacity = '0';
        if (handle) handle.style.cursor = 'grab';

        window.setTimeout(() => {
          done();
          window.setTimeout(() => {
            if (panel.isConnected && isVisible(panel)) resetPanel();
          }, 120);
        }, 220);
      };

      const begin = (clientX, clientY, target) => {
        if (!mediaQuery.matches) return false;
        if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) {
          return false;
        }

        const rect = panel.getBoundingClientRect();

        const insideDragZone =
          dragZone && target instanceof Node && dragZone.contains(target);
        if (
          panel.scrollTop > 0 ||
          (!insideDragZone && clientY - rect.top > GRAB_ZONE_PX)
        ) {
          return false;
        }

        dragging = true;
        dragged = false;
        startY = clientY;
        startX = clientX;
        lastY = clientY;
        startTime = performance.now();
        panel.dataset.mobileSheetDragging = '1';
        panel.style.animation = 'none';
        panel.style.transition = 'none';
        panel.style.willChange = 'transform, opacity';
        if (handle) handle.style.cursor = 'grabbing';
        if (dragZone) dragZone.style.cursor = 'grabbing';
        return true;
      };

      const move = (clientX, clientY, event) => {
        if (!dragging) return;

        lastY = clientY;
        const distanceY = clientY - startY;
        const distanceX = clientX - startX;

        if (!dragged) {
          if (Math.abs(distanceY) <= 4) return;
          if (Math.abs(distanceX) > Math.abs(distanceY)) return;
          dragged = true;
        }

        const offsetY = Math.max(0, distanceY);
        if (event.cancelable) event.preventDefault();
        panel.style.transform = `translate3d(0, ${offsetY}px, 0)`;
        panel.style.opacity = String(1 - Math.min(offsetY / 360, 0.32));
      };

      const finish = () => {
        if (!dragging) return;

        const distance = Math.max(0, lastY - startY);
        const elapsed = Math.max(1, performance.now() - startTime);
        const shouldClose =
          dragged &&
          (distance >= CLOSE_DISTANCE_PX ||
            distance / elapsed >= CLOSE_VELOCITY_PX_MS);
        dragging = false;
        delete panel.dataset.mobileSheetDragging;
        if (handle) handle.style.cursor = 'grab';
        if (dragZone) dragZone.style.cursor = 'grab';

        if (shouldClose) {
          slideOut(() => {
            if (dismissTarget instanceof HTMLElement) {
              suppressNextClick = true;
              dismissTarget.click();
            }
            window.setTimeout(() => {
              if (!panel.isConnected) return;
              suppressNextKey = true;
              panel.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: 'Escape',
                  code: 'Escape',
                  bubbles: true,
                }),
              );
            }, 80);
          });
          return;
        }

        panel.style.transition =
          'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease';
        panel.style.transform = 'translate3d(0, 0, 0)';
        panel.style.opacity = '1';
        window.setTimeout(resetPanel, 220);
      };

      const onPointerDown = (event) => {
        if (!event.isPrimary) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (begin(event.clientX, event.clientY, event.target) && event.cancelable) {
          event.preventDefault();
        }
      };

      const onPointerMove = (event) => {
        if (!dragging) return;
        move(event.clientX, event.clientY, event);
      };

      const onPointerUp = () => finish();
      const onPointerCancel = () => cancelDrag();

      const onClickCapture = (event) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        if (closing || !mediaQuery.matches || !isVisible(panel)) return;

        const target = event.target;
        const control = findCloseControl(target);
        const isOutside =
          target instanceof Node &&
          !panel.contains(target) &&
          backdrop?.contains(target);
        if (!control && !isOutside) return;

        if (isOutside) {
          const cancel = panel.querySelector('[data-sheet-close="1"]');
          if (cancel instanceof HTMLButtonElement && cancel.disabled) return;
        }

        const dispatchTarget = isOutside ? dismissTarget : control;
        if (!(dispatchTarget instanceof HTMLElement)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        slideOut(() => {
          suppressNextClick = true;
          dispatchTarget.click();
        });
      };

      const onKeyDownCapture = (event) => {
        if (event.key !== 'Escape') return;
        if (suppressNextKey) {
          suppressNextKey = false;
          return;
        }
        if (closing || !mediaQuery.matches || !isVisible(panel)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        slideOut(() => {
          suppressNextKey = true;
          panel.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              bubbles: true,
            }),
          );
        });
      };

      backdrop?.addEventListener('click', onClickCapture, { capture: true });
      window.addEventListener('keydown', onKeyDownCapture, { capture: true });

      panel.addEventListener('pointerdown', onPointerDown, {
        capture: true,
      });
      window.addEventListener('pointermove', onPointerMove, {
        capture: true,
        passive: false,
      });
      window.addEventListener('pointerup', onPointerUp, { capture: true });
      window.addEventListener('pointercancel', onPointerCancel, {
        capture: true,
      });

      disposers.set(panel, () => {
        backdrop?.removeEventListener('click', onClickCapture, {
          capture: true,
        });
        window.removeEventListener('keydown', onKeyDownCapture, {
          capture: true,
        });
        panel.removeEventListener('pointerdown', onPointerDown, {
          capture: true,
        });
        window.removeEventListener('pointermove', onPointerMove, {
          capture: true,
        });
        window.removeEventListener('pointerup', onPointerUp, { capture: true });
        window.removeEventListener('pointercancel', onPointerCancel, {
          capture: true,
        });
        delete panel.dataset.mobileModalDrag;
        delete panel.dataset.mobileSheet;
        delete panel.dataset.mobileSheetDragging;
        delete panel.dataset.mobileSheetClosing;
        resetPanel();
        if (handle && handle.isConnected) {
          handle.style.cursor = originalHandleCursor;
          handle.style.touchAction = originalHandleTouchAction;
        }
        if (dragZone && dragZone.isConnected) {
          dragZone.style.cursor = originalDragZoneCursor;
          dragZone.style.touchAction = originalDragZoneTouchAction;
        }
        disposers.delete(panel);
      });
    };

    const scan = () => {
      disposers.forEach((dispose, panel) => {
        if (!panel.isConnected) dispose();
      });
      if (mediaQuery.matches) {
        const panels = new Set(document.querySelectorAll(PANEL_SELECTOR));
        document.querySelectorAll(HANDLE_SELECTOR).forEach((handle) => {
          const panel = handle.closest('div.fixed.inset-0 > div');
          if (panel) panels.add(panel);
        });
        panels.forEach(enhance);
      }
      syncBodyLock();
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
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.overscrollBehavior = originalBodyOverscroll;
    };
  }, []);

  return null;
}
