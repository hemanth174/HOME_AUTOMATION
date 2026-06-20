'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useState, useEffect, useRef } from 'react';
import {
  LayoutGrid,
  SlidersHorizontal,
  Cpu,
  CalendarDays,
  AlarmClock,
  TrendingUp,
  History
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [theme, setTheme] = useState('dark');
  const dropdownRef = useRef(null);

  // Load user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
  }, []);

  // Theme Sync
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentTheme = localStorage.getItem('theme') || 'dark';
      setTheme(currentTheme);
    }
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // If user is on the login page, we can hide the interactive navigation links and profile dropdown
  const isLoginPage = pathname === '/login';

  const links = [
    { href: '/', label: 'Devices', icon: LayoutGrid },
    { href: '/presets', label: 'Presets', icon: SlidersHorizontal },
    { href: '/boards', label: 'Boards', icon: Cpu },
    { href: '/schedules', label: 'Schedules', icon: CalendarDays },
    { href: '/alarms', label: 'Alarms', icon: AlarmClock },
    { href: '/analytics', label: 'Analytics', icon: TrendingUp },
    { href: '/logs', label: 'Logs', icon: History },
  ];

  // User metadata fallback info
  const metadata = user?.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';
  const avatarUrl = metadata.avatar_url;
  const initial = fullName.substring(0, 1).toUpperCase();
  const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Calcutta';

  return (
    <header className="w-full fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border bg-header px-6 py-3 shadow-lg backdrop-blur-md select-none">
      {/* Left: App Logo / Title */}
      <Link href="/" className="text-lg font-black text-accent tracking-tight hover:opacity-90 transition-opacity">
        Smart Home
      </Link>

      {/* Center: Navigation Links (hidden on login screen or if not logged in) */}
      {!isLoginPage && user && (
        <nav className="flex items-center gap-1.5 overflow-x-auto max-md:hidden">
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-xl bg-transparent px-3 py-1.5 text-center text-xs font-extrabold no-underline transition-all duration-200 ease-out hover:-translate-y-px hover:bg-accent-bg hover:text-accent hover:no-underline flex items-center gap-1.5 ${
                  active ? 'bg-accent-bg text-accent' : 'text-text-muted'
                }`}
              >
                <Icon size={14} className="stroke-[2.5px]" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Right: Profile Dropdown (or placeholder) */}
      {!isLoginPage && user ? (
        <div className="relative flex items-center" ref={dropdownRef}>
          {/* Profile Button */}
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-8 h-8 rounded-full border border-border bg-accent-bg flex items-center justify-center text-xs font-black text-accent cursor-pointer hover:border-accent hover:shadow-gold-glow transition-all overflow-hidden shrink-0"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span>{initial}</span>
            )}
          </button>

          {/* Profile Dropdown Card */}
          {dropdownOpen && (
            <div className="absolute right-0 top-10 w-64 bg-card border border-border rounded-xl shadow-2xl p-4 flex flex-col gap-3 z-[250] animate-scale-in text-left">
              {/* User details */}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black text-text truncate leading-none block mb-1">{fullName}</span>
                <span className="text-[10px] text-text-muted truncate leading-none block">{email}</span>
              </div>

              <div className="border-t border-border" />

              {/* Navigation Links for Mobile (visible only on small screens) */}
              <div className="md:hidden flex flex-col gap-2">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted block">Navigation</span>
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setDropdownOpen(false)}
                    className={`text-xs font-bold transition-all ${
                      pathname === link.href ? 'text-accent' : 'text-text hover:text-accent'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="border-t border-border my-1" />
              </div>

              {/* Account Links */}
              <div className="flex flex-col gap-2">
                <Link
                  href="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center text-xs font-bold text-text hover:text-accent transition-all cursor-pointer"
                >
                  Account
                </Link>
                <span className="text-xs font-bold text-text-muted/60 cursor-default">Feature previews</span>
                <span className="text-xs font-bold text-text-muted/60 cursor-default">Changelog</span>
              </div>

              <div className="border-t border-border" />

              {/* Theme select */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted block">Theme</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => changeTheme('dark')}
                    className={`flex-1 py-1 rounded-md text-[10px] font-black border transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'border-accent bg-accent-bg text-accent'
                        : 'border-border bg-input text-text-muted hover:text-text'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => changeTheme('light')}
                    className={`flex-1 py-1 rounded-md text-[10px] font-black border transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'border-accent bg-accent-bg text-accent'
                        : 'border-border bg-input text-text-muted hover:text-text'
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>



              {/* Timezone */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted block">Timezone</span>
                <span className="text-[10px] font-bold text-text truncate" title={timezone}>
                  Auto ({timezone})
                </span>
              </div>

              <div className="border-t border-border" />

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full py-1.5 rounded-lg text-xs font-extrabold border border-red-500/40 bg-red-500/10 text-red-500 transition-all hover:bg-red-500 hover:text-white cursor-pointer text-center"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-8 h-8" /> // Empty placeholder to keep layout balanced
      )}
    </header>
  );
}
