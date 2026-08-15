'use client';

import { useEffect, useRef } from 'react';

export default function CursorGlow() {
  const glowRef = useRef(null);
  const dotRef = useRef(null);

  useEffect(() => {
    const glow = glowRef.current;
    const dot = dotRef.current;
    if (!glow || !dot || window.matchMedia('(pointer: coarse)').matches) return;

    let raf = null;
    let targetX = -9999;
    let targetY = -9999;

    const onMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          glow.style.setProperty('--cursor-x', `${targetX}px`);
          glow.style.setProperty('--cursor-y', `${targetY}px`);
          dot.style.setProperty('--cursor-x', `${targetX}px`);
          dot.style.setProperty('--cursor-y', `${targetY}px`);
          raf = null;
        });
      }
    };

    const onOver = (e) => {
      const interactive = e.target.closest('a, button, input, textarea, select, [role="button"]');
      dot.classList.toggle('lp-cursor-active', !!interactive);
    };

    const onLeave = () => {
      glow.style.setProperty('--cursor-x', '-9999px');
      glow.style.setProperty('--cursor-y', '-9999px');
      dot.style.setProperty('--cursor-x', '-9999px');
      dot.style.setProperty('--cursor-y', '-9999px');
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={glowRef} className="lp-cursor-glow" aria-hidden="true" />
      <div ref={dotRef} className="lp-cursor-dot" aria-hidden="true" />
    </>
  );
}