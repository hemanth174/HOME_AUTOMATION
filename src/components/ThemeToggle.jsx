'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Sun, Moon } from 'lucide-react';

const THEME_TRANSITION_DURATION = 720;

export default function ThemeToggle({ className, size = 15, variant = "button" }) {
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
      document.documentElement.classList.toggle('dark', theme === 'dark');
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
      root.classList.toggle('dark', next === 'dark');
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
    if (variant === "switch") {
      return (
        <div 
          className={`h-7 w-12 rounded-full border border-border/80 bg-slate-200/80 dark:bg-zinc-800 ${className || ""}`}
        />
      );
    }
    return (
      <div 
        className={className || "p-2 w-[34px] h-[34px] rounded-full border border-border bg-accent-bg/5 text-text-muted/40 flex items-center justify-center"}
        style={{ width: `${size + 19}px`, height: `${size + 19}px` }}
      />
    );
  }

  if (variant === "switch") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isTransitioning}
        role="switch"
        aria-checked={theme === 'dark'}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-border/80 bg-slate-200/90 p-0.5 transition-colors duration-300 dark:bg-zinc-800 focus:outline-none disabled:cursor-wait disabled:opacity-70 ${className || ""}`}
      >
        <span
          className={`flex h-5.5 w-5.5 transform items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 ease-out dark:bg-zinc-950 ${
            theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
          }`}
        >
          {theme === 'dark' ? (
            <Moon size={11} className="text-cyan-300 stroke-[2.5]" />
          ) : (
            <Sun size={12} className="text-amber-500 stroke-[2.5]" />
          )}
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={isTransitioning}
        className={`${className || "p-2 rounded-full border border-border bg-accent-bg/5 hover:bg-accent-bg hover:text-accent hover:border-accent text-text-muted transition-all cursor-pointer flex items-center justify-center disabled:cursor-wait disabled:opacity-70"} header-icon-sweep`}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-busy={isTransitioning}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <Sun size={size} /> : <Moon size={size} />}
      </button>
    </>
  );
}
