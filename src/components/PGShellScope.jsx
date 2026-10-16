'use client';

import { useEffect } from 'react';

/**
 * Viewport-scoped themes: `pg-shell` on desktop (>=1024px, green PG
 * design in light/dark variants) and `m-shell` on smaller screens
 * (warm minimal mobile design, always bright per the mobile brief).
 * Phones keep a coherent designed experience; desktop is untouched by
 * mobile rules and vice versa.
 */
export default function PGShellScope() {
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => {
      document.body.classList.toggle('pg-shell', mq.matches);
      document.body.classList.toggle('m-shell', !mq.matches);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
    };
  }, []);
  return null;
}
