'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Sun, Moon } from 'lucide-react';

const THEME_TRANSITION_DURATION = 720;

export default function ThemeToggle({ className, size = 15 }) {
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Initialize theme from localStorage on client-mount to avoid SSR hydration mismatch
  useEffect(() => {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    setTheme(currentTheme);
    setMounted(true);
  }, []);

  // Update root attribute when theme state updates
  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme, mounted]);

  const toggle = (event) => {
    if (!mounted || isTransitioning) return;

    const next = theme === 'dark' ? 'light' : 'dark';
    const button = event.currentTarget;
    const bounds = button.getBoundingClientRect();
    const originX = bounds.left + bounds.width / 2;
    const originY = bounds.top + bounds.height / 2;
    const radius = Math.max(
      Math.hypot(originX, originY),
      Math.hypot(window.innerWidth - originX, originY),
      Math.hypot(originX, window.innerHeight - originY),
      Math.hypot(window.innerWidth - originX, window.innerHeight - originY),
    );

    const root = document.documentElement;
    root.style.setProperty('--theme-transition-x', `${originX}px`);
    root.style.setProperty('--theme-transition-y', `${originY}px`);
    root.style.setProperty('--theme-transition-radius', `${radius}px`);

    const applyTheme = (flush = false) => {
      root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      if (flush) {
        flushSync(() => setTheme(next));
      } else {
        setTheme(next);
      }
    };

    if (typeof document.startViewTransition !== 'function') {
      applyTheme();
      root.style.removeProperty('--theme-transition-x');
      root.style.removeProperty('--theme-transition-y');
      root.style.removeProperty('--theme-transition-radius');
      return;
    }

    setIsTransitioning(true);
    root.setAttribute('data-theme-transitioning', 'true');
    let transition;
    try {
      transition = document.startViewTransition(() => applyTheme(true));
    } catch {
      applyTheme();
      setIsTransitioning(false);
      root.removeAttribute('data-theme-transitioning');
      root.style.removeProperty('--theme-transition-x');
      root.style.removeProperty('--theme-transition-y');
      root.style.removeProperty('--theme-transition-radius');
      return;
    }

    const finishTransition = () => {
      setIsTransitioning(false);
      root.removeAttribute('data-theme-transitioning');
      root.style.removeProperty('--theme-transition-x');
      root.style.removeProperty('--theme-transition-y');
      root.style.removeProperty('--theme-transition-radius');
    };

    window.setTimeout(finishTransition, THEME_TRANSITION_DURATION);
    transition.finished.then(finishTransition, finishTransition);
  };

  // Render a placeholder matching the dimension until client mounts to prevent mismatch
  if (!mounted) {
    return (
      <div 
        className={className || "p-2 w-[34px] h-[34px] rounded-xl border border-border bg-accent-bg/5 text-text-muted/40 flex items-center justify-center"}
        style={{ width: `${size + 19}px`, height: `${size + 19}px` }}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={isTransitioning}
        className={className || "p-2 rounded-xl border border-border bg-accent-bg/5 hover:bg-accent-bg hover:text-accent hover:border-accent text-text-muted transition-all cursor-pointer flex items-center justify-center disabled:cursor-wait disabled:opacity-70"}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-busy={isTransitioning}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <Sun size={size} /> : <Moon size={size} />}
      </button>
    </>
  );
}
