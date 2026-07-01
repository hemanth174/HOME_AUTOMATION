'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useState, useEffect, useRef } from 'react';
import ThemeToggle from './ThemeToggle';
import {
  LayoutGrid,
  SlidersHorizontal,
  Cpu,
  CalendarDays,
  AlarmClock,
  TrendingUp,
  History,
  Menu,
  X,
  LogOut,
  Moon,
  Sun,
  Bell,
  Crown,
  Download,
  HelpCircle,
  FileText
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Touch gesture state for drag-to-close bottom sheet
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sheetContentRef = useRef(null);

  // PWA Install States
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  // Load user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
  }, []);

  // Listen to beforeinstallprompt event for PWA installation
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowInstallBtn(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBtn(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA installation outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const cleanPath = (pathname || '').split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, '') || '/';
  const VALID_ROUTES = ['/', '/login', '/presets', '/boards', '/schedules', '/alarms', '/analytics', '/logs', '/profile', '/faq', '/terms'];
  const is404Page = !VALID_ROUTES.includes(cleanPath);
  const isLoginPage = cleanPath === '/login';

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutGrid },
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

  const getPageTitle = () => {
    const pathMap = {
      '/': 'Dashboard - Overview',
      '/presets': 'Presets - Overview',
      '/boards': 'Boards - Overview',
      '/schedules': 'Schedules - Overview',
      '/alarms': 'Alarms - Overview',
      '/analytics': 'Analytics - Overview',
      '/logs': 'Logs - Overview',
      '/profile': 'Profile - Account',
    };
    return pathMap[pathname] || 'Dashboard - Admin Overview';
  };

  // Touch gesture handlers for mobile bottom sheet
  const handleTouchStart = (e) => {
    setStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    // If the inner content is scrolled, only allow drag-to-close if we are scrolled to the top
    if (sheetContentRef.current && sheetContentRef.current.scrollTop > 0) {
      return;
    }
    const deltaY = e.touches[0].clientY - startY;
    if (deltaY > 0) {
      setCurrentY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (currentY > 80) {
      setMobileOpen(false);
    }
    setCurrentY(0);
  };

  // If on login page, 404 page, or not authenticated, hide navigation completely
  if (isLoginPage || is404Page || !user) {
    return null;
  }

  // First 4 links go to bottom navigation bar on mobile
  const bottomBarLinks = links.slice(0, 4);
  // Rest of the links go to bottom sheet menu
  const sheetLinks = links.slice(4);

  // Sidebar contents (desktop only)
  const SidebarContent = () => (
    <div className="flex flex-col h-full justify-between py-6 px-4 select-none">
      {/* Top: Branding & Navigation */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2 text-xl font-black text-accent tracking-tight hover:opacity-90 transition-opacity">
            <Crown className="text-accent fill-accent/10" size={20} />
            <span>Smart Home</span>
          </Link>
        </div>

        {/* Links */}
        <nav className="flex flex-col gap-1.5">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-text-muted px-2 mb-1">MAIN MENU</span>
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all duration-200 ease-out hover:-translate-y-px hover:bg-accent-bg hover:text-accent flex items-center gap-3 ${
                  active ? 'bg-accent-bg text-accent' : 'text-text-muted bg-transparent'
                }`}
              >
                <Icon size={16} className="stroke-[2.5px]" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Support & Legal Section */}
        <div className="flex flex-col gap-1.5 mt-2">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-text-muted px-2 mb-1">SUPPORT & LEGAL</span>
          <Link
            href="/faq"
            className="rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all duration-200 text-text-muted hover:bg-accent-bg hover:text-accent flex items-center gap-3"
          >
            <HelpCircle size={16} className="stroke-[2.5px]" />
            <span>FAQ's</span>
          </Link>
          <Link
            href="/terms"
            className="rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all duration-200 text-text-muted hover:bg-accent-bg hover:text-accent flex items-center gap-3"
          >
            <FileText size={16} className="stroke-[2.5px]" />
            <span>Terms & Conditions</span>
          </Link>
        </div>
      </div>

      {/* Bottom: User & Info */}
      <div className="flex flex-col gap-4 border-t border-border pt-4">
        {/* Install Web App */}
        {showInstallBtn && (
          <button
            onClick={handleInstallClick}
            className="mx-2 px-3 py-2.5 rounded-xl text-xs font-extrabold bg-accent text-[#0a0800] hover:bg-accent-hover cursor-pointer flex items-center justify-center gap-2"
          >
            <Download size={14} />
            <span>Install Web App</span>
          </button>
        )}

        {/* Timezone */}
        <div className="flex flex-col gap-0.5 px-2">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted block">Timezone</span>
          <span className="text-[10px] font-bold text-text truncate" title={timezone}>
            Auto ({timezone})
          </span>
        </div>

        {/* User Card */}
        <Link 
          href="/profile" 
          className="flex items-center gap-3 p-2 rounded-xl bg-card-alt/50 border border-border hover:border-accent/40 transition-all"
        >
          <div className="w-8 h-8 rounded-full border border-border bg-accent-bg flex items-center justify-center text-xs font-black text-accent overflow-hidden shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-black text-text truncate leading-none mb-1">{fullName}</span>
            <span className="text-[10px] text-text-muted truncate leading-none">{email}</span>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="w-64 fixed left-0 top-0 bottom-0 h-screen border-r border-border bg-card/50 backdrop-blur-md z-50 max-md:hidden">
        <SidebarContent />
      </aside>

      {/* Desktop Content Header */}
      <header className="fixed top-0 right-0 left-0 md:left-64 h-16 border-b border-border bg-header/90 backdrop-blur-md flex items-center justify-between px-6 z-40 max-md:hidden select-none">
        {/* Left: Page Title */}
        <div className="flex items-center gap-2">
          <Crown className="text-accent" size={16} />
          <span className="text-sm font-black text-text tracking-tight">
            {getPageTitle()}
          </span>
        </div>

        {/* Right: Theme Toggle, Notifications, Logout */}
        <div className="flex items-center gap-3">
          <ThemeToggle size={15} />

          <button
            className="p-2 rounded-xl border border-border bg-accent-bg/5 hover:bg-accent-bg hover:text-accent hover:border-accent text-text-muted transition-all cursor-pointer flex items-center justify-center"
            title="Notifications"
          >
            <Bell size={15} />
          </button>

          <button
            onClick={() => setShowLogoutModal(true)}
            className="px-4 py-1.5 rounded-xl text-xs font-extrabold border border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-200 cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </header>

      {/* Mobile Top Header */}
      <header className="fixed top-0 left-0 right-0 h-14 border-b border-border bg-header/90 backdrop-blur-md flex items-center justify-between px-4 z-40 md:hidden select-none">
        <Link href="/" className="text-base font-black text-accent tracking-tight">
          smart home
        </Link>
        <div className="flex items-center gap-2">
          {/* Theme switcher directly in mobile header */}
          <ThemeToggle size={14} />
          
          {/* Logout button directly in mobile header */}
          <button
            onClick={() => setShowLogoutModal(true)}
            className="px-3 py-1.5 rounded-xl text-[10px] font-extrabold border border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-150 cursor-pointer"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-header/90 backdrop-blur-lg flex items-center justify-around px-2 z-40 md:hidden select-none">
        {bottomBarLinks.map((link) => {
          const active = pathname === link.href && !mobileOpen;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all ${
                active ? 'text-accent' : 'text-text-muted'
              }`}
            >
              <Icon size={18} className="stroke-[2.5px]" />
              <span className="text-[9px] font-black tracking-tight">{link.label}</span>
            </Link>
          );
        })}
        {/* 5th Item: Menu button to toggle the bottom sheet */}
        <button
          onClick={() => {
            setCurrentY(0);
            setMobileOpen(!mobileOpen);
          }}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all cursor-pointer border-none bg-transparent ${
            mobileOpen ? 'text-accent' : 'text-text-muted'
          }`}
        >
          <Menu size={18} className="stroke-[2.5px]" />
          <span className="text-[9px] font-black tracking-tight">Menu</span>
        </button>
      </nav>

      {/* Mobile Bottom Sheet Drawer Menu (kept in DOM for exit animations & touch events) */}
      <div 
        onClick={() => {
          setMobileOpen(false);
          setCurrentY(0);
        }}
        className={`fixed inset-0 bg-black/70 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateY(${mobileOpen ? `${currentY}px` : '100%'})`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className="fixed bottom-0 left-0 right-0 max-h-[80vh] border-t border-border bg-card rounded-t-[24px] z-50 md:hidden flex flex-col select-none overflow-hidden"
      >
        {/* Drag Handle */}
        <div className="w-12 h-1 bg-border rounded-full mx-auto my-3.5 cursor-grab active:cursor-grabbing shrink-0" />
        
        <div 
          ref={sheetContentRef}
          className="overflow-y-auto px-4 pb-8 flex flex-col gap-5"
        >
          {/* Sheet Links */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-text-muted px-2">More Options</span>
            {sheetLinks.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => {
                    setMobileOpen(false);
                    setCurrentY(0);
                  }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all flex items-center gap-3 ${
                    active ? 'bg-accent-bg text-accent' : 'text-text hover:bg-accent-bg/30'
                  }`}
                >
                  <Icon size={16} className="stroke-[2.5px]" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Support & Legal inside mobile drawer */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-text-muted px-2">Support & Legal</span>
            <Link
              href="/faq"
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className="rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all text-text hover:bg-accent-bg/30 flex items-center gap-3"
            >
              <HelpCircle size={16} className="stroke-[2.5px]" />
              <span>FAQ's</span>
            </Link>
            <Link
              href="/terms"
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className="rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all text-text hover:bg-accent-bg/30 flex items-center gap-3"
            >
              <FileText size={16} className="stroke-[2.5px]" />
              <span>Terms & Conditions</span>
            </Link>
          </div>

          {/* User Profile Info Card inside bottom drawer */}
          <div className="flex flex-col gap-1.5 px-2">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-text-muted">Account Profile</span>
            <Link 
              href="/profile" 
              onClick={() => {
                setMobileOpen(false);
                setCurrentY(0);
              }}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-card-alt border border-border hover:border-accent/45 transition-all"
            >
              <div className="w-8 h-8 rounded-full border border-border bg-accent-bg flex items-center justify-center text-xs font-black text-accent overflow-hidden shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-black text-text truncate leading-none mb-1">{fullName}</span>
                <span className="text-[10px] text-text-muted truncate leading-none">{email}</span>
              </div>
            </Link>
          </div>

          {/* Mobile Install App Button */}
          {showInstallBtn && (
            <div className="px-2">
              <button
                onClick={handleInstallClick}
                className="w-full py-3 rounded-xl text-xs font-extrabold bg-accent text-[#0a0800] hover:bg-accent-hover  cursor-pointer flex items-center justify-center gap-2 "
              >
                <Download size={15} className="stroke-[2.5px]" />
                <span>Install Web App</span>
              </button>
            </div>
          )}

          {/* Timezone */}
          <div className="flex flex-col gap-0.5 px-2">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted block">Timezone</span>
            <span className="text-[10px] font-bold text-text truncate" title={timezone}>
              Auto ({timezone})
            </span>
          </div>
        </div>
      </div>
      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowLogoutModal(false)}
        >
          <div
            className="bg-card border border-border rounded-[18px] p-6 w-[min(100%-40px,360px)] shadow-2xl flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-extrabold text-text">Log out?</h3>
              <p className="text-xs text-text-muted font-semibold leading-relaxed">
                Are you sure you want to log out of your Smart Home account?
              </p>
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-text hover:bg-card-alt cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex min-h-[34px] items-center justify-center rounded-lg bg-red-500 px-4 text-xs font-extrabold text-white hover:bg-red-600 cursor-pointer transition-all"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
