'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ className, size = 15 }) {
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);

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

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
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
    <button
      onClick={toggle}
      className={className || "p-2 rounded-xl border border-border bg-accent-bg/5 hover:bg-accent-bg hover:text-accent hover:border-accent text-text-muted transition-all cursor-pointer flex items-center justify-center"}
      title="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
}
