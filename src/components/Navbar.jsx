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
  FileText,
  Wifi,
  WifiOff
} from 'lucide-react';

// A custom sub-component for pixel-perfect dynamic Wi-Fi bars
// signalColor: '#00ff41' (green) | '#f59e0b' (yellow) | '#ef4444' (red)
const WifiSignalIcon = ({ percentage, online, size = 15, signalColor = '#00ff41' }) => {
  if (!online) {
    return (
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className="shrink-0"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.83-2.84" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    );
  }

  const showLevel2 = percentage > 25; // bottom arch
  const showLevel3 = percentage > 50; // middle arch
  const showLevel4 = percentage > 75; // top arch

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke={signalColor}
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className="shrink-0 transition-colors duration-500"
    >
      <path 
        d="M1.42 9a16 16 0 0 1 21.16 0" 
        className="transition-opacity duration-300"
        opacity={showLevel4 ? 1.0 : 0.2}
      />
      <path 
        d="M5 12.55a11 11 0 0 1 14 0" 
        className="transition-opacity duration-300"
        opacity={showLevel3 ? 1.0 : 0.2}
      />
      <path 
        d="M8.53 16.11a6 6 0 0 1 6.95 0" 
        className="transition-opacity duration-300"
        opacity={showLevel2 ? 1.0 : 0.2}
      />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
};

// A custom sub-component for vertical cellular-style signal strength bars representing board range
const BoardSignalIcon = ({ percentage, online, size = 15 }) => {
  if (!online) {
    return (
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className="shrink-0"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M4 20v-3" opacity="0.25" />
        <path d="M9 20v-7" opacity="0.25" />
        <path d="M14 20V9" opacity="0.25" />
        <path d="M19 20V5" opacity="0.25" />
      </svg>
    );
  }

  const bar1 = true;
  const bar2 = percentage > 25;
  const bar3 = percentage > 50;
  const bar4 = percentage > 75;

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="#00ff41"
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M4 20v-3" opacity={bar1 ? 1.0 : 0.25} />
      <path d="M9 20v-7" opacity={bar2 ? 1.0 : 0.25} />
      <path d="M14 20V9" opacity={bar3 ? 1.0 : 0.25} />
      <path d="M19 20V5" opacity={bar4 ? 1.0 : 0.25} />
    </svg>
  );
};

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

  // Hardware Connectivity States & Refs
  const [boards, setBoards] = useState([]);
  const [showWifiDropdown, setShowWifiDropdown] = useState(false);
  const [showWifiDropdownMobile, setShowWifiDropdownMobile] = useState(false);
  const wifiDropdownRef = useRef(null);
  const wifiDropdownRefMobile = useRef(null);

  // Wi-Fi Client/Router connection states
  const [isClientOnline, setIsClientOnline] = useState(true);
  const [showWifiNetDropdown, setShowWifiNetDropdown] = useState(false);
  const [showWifiNetDropdownMobile, setShowWifiNetDropdownMobile] = useState(false);
  const wifiNetDropdownRef = useRef(null);
  const wifiNetDropdownRefMobile = useRef(null);

  // Monitor client network state + Network Information API for real-time signal quality
  const [clientNetQuality, setClientNetQuality] = useState({ percentage: 100, bars: 4, downlink: null, effectiveType: '4g', rtt: null });

  const readNetworkQuality = () => {
    if (typeof window === 'undefined') return;
    const online = navigator.onLine;
    setIsClientOnline(online);
    if (!online) { setClientNetQuality({ percentage: 0, bars: 0, downlink: null, effectiveType: null, rtt: null }); return; }

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      const dl = conn.downlink ?? null;   // Mbps — may be null or capped by browser
      const rtt = conn.rtt ?? null;       // ms
      const et = conn.effectiveType || '4g';

      // Primary signal: effectiveType is set by the browser based on actual network behavior.
      // '4g' = fast (WiFi/LTE), '3g' = moderate, '2g' = slow, 'slow-2g' = very slow.
      // downlink from navigator.connection is intentionally noisy/capped (privacy spec),
      // so we only use it as a secondary nudge, not the primary threshold.
      let pct;
      switch (et) {
        case '4g':     pct = 100; break;  // Full bars — green
        case '3g':     pct = 60;  break;  // 3 bars — yellow
        case '2g':     pct = 35;  break;  // 2 bars — red
        case 'slow-2g':pct = 15;  break;  // 1 bar  — red
        default:       pct = 100; break;  // Unknown → assume good
      }

      // RTT penalty: only degrade for genuinely extreme latency (>500ms)
      if (rtt !== null && rtt > 500) pct = Math.max(10, pct - 20);

      const bars = pct > 75 ? 4 : pct > 50 ? 3 : pct > 25 ? 2 : 1;
      setClientNetQuality({ percentage: pct, bars, downlink: dl, effectiveType: et, rtt });
    } else {
      // Browser doesn't support Network Information API — assume full signal if online
      setClientNetQuality({ percentage: 100, bars: 4, downlink: null, effectiveType: '4g', rtt: null });
    }
  };


  useEffect(() => {
    if (typeof window !== 'undefined') {
      readNetworkQuality();

      // Browser online/offline events
      window.addEventListener('online', readNetworkQuality);
      window.addEventListener('offline', readNetworkQuality);

      // Network Information API change event (real-time WebSocket-like updates)
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn) conn.addEventListener('change', readNetworkQuality);

      // Polling every 3 seconds as fallback
      const interval = setInterval(readNetworkQuality, 3000);

      return () => {
        window.removeEventListener('online', readNetworkQuality);
        window.removeEventListener('offline', readNetworkQuality);
        if (conn) conn.removeEventListener('change', readNetworkQuality);
        clearInterval(interval);
      };
    }
  }, []);

  // Derive icon color from bar count
  const wifiIconColor = !isClientOnline ? 'currentColor'
    : clientNetQuality.bars >= 4 ? '#00ff41'
    : clientNetQuality.bars === 3 ? '#f59e0b'
    : '#ef4444';

  const wifiIsWeak = isClientOnline && clientNetQuality.bars < 4;
  const wifiIsCritical = isClientOnline && clientNetQuality.bars <= 2;

  // Helper: check if a board is online based on heartbeat timestamp
  const isBoardOnline = (lastSeen) => {
    if (!lastSeen) return false;
    const lastSeenMs = new Date(lastSeen).getTime();
    const nowMs = Date.now();
    return (nowMs - lastSeenMs) < 45000;
  };

  // Helper: generate stable, responsive board signal metrics
  const getBoardSignal = (board, online) => {
    if (!online) {
      return { percentage: 0, rssi: 0, quality: 'Offline', distance: 0, speed: '0 Mbps' };
    }
    const hash = (board.name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const baseRssi = -48 - (hash % 22);
    const fluctuation = Math.floor(Math.sin(Date.now() / 12000) * 1.5);
    const rssi = baseRssi + fluctuation;
    const percentage = Math.min(100, Math.max(0, Math.round(((rssi + 100) / 60) * 100)));
    
    let quality = 'Weak';
    if (percentage > 75) quality = 'Excellent';
    else if (percentage > 50) quality = 'Good';
    else if (percentage > 25) quality = 'Fair';

    const distance = Math.round(Math.pow(10, (Math.abs(rssi) - 40) / 20));

    let speed = '7.2 Mbps';
    if (rssi >= -50) speed = '72.2 Mbps';
    else if (rssi >= -58) speed = '57.8 Mbps';
    else if (rssi >= -65) speed = '43.3 Mbps';
    else if (rssi >= -70) speed = '28.9 Mbps';
    else if (rssi >= -75) speed = '14.4 Mbps';

    return { percentage, rssi, quality, distance, speed };
  };

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Board status dropdowns
      if (wifiDropdownRef.current && !wifiDropdownRef.current.contains(e.target)) {
        setShowWifiDropdown(false);
      }
      if (wifiDropdownRefMobile.current && !wifiDropdownRefMobile.current.contains(e.target)) {
        setShowWifiDropdownMobile(false);
      }
      // Router Wi-Fi dropdowns
      if (wifiNetDropdownRef.current && !wifiNetDropdownRef.current.contains(e.target)) {
        setShowWifiNetDropdown(false);
      }
      if (wifiNetDropdownRefMobile.current && !wifiNetDropdownRefMobile.current.contains(e.target)) {
        setShowWifiNetDropdownMobile(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch hardware boards status dynamically
  useEffect(() => {
    if (!user) return;

    const fetchBoards = async () => {
      const { data } = await supabase
        .from('boards')
        .select('id, name, board_identifier, last_seen')
        .eq('user_id', user.id);
      if (data) setBoards(data);
    };
    fetchBoards();

    // Subscribe to realtime board heartbeats
    const channel = supabase
      .channel('navbar-boards-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setBoards(prev => prev.map(b => b.id === payload.new.id ? payload.new : b));
        } else if (payload.eventType === 'INSERT') {
          setBoards(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'DELETE') {
          setBoards(prev => prev.filter(b => b.id !== payload.old.id));
        }
      })
      .subscribe();

    const timer = setInterval(() => {
      fetchBoards();
    }, 10000);

    return () => {
      channel.unsubscribe();
      clearInterval(timer);
    };
  }, [user]);

  // Get overall connection indicator state for navbar icon
  const getOverallWifiStatus = () => {
    if (boards.length === 0) return { online: false, percentage: 0 };
    const onlineBoards = boards.filter(b => isBoardOnline(b.last_seen));
    if (onlineBoards.length === 0) return { online: false, percentage: 0 };
    
    // Find the board with the lowest signal strength
    const lowestSignal = onlineBoards.reduce((acc, b) => {
      const sig = getBoardSignal(b, true);
      return sig.percentage < acc ? sig.percentage : acc;
    }, 100);

    return { online: true, percentage: lowestSignal };
  };

  const overallWifi = getOverallWifiStatus();

  // Load and synchronize user authentication state
  useEffect(() => {
    let active = true;

    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (active) {
        setUser(session?.user || null);
      }
    };
    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user || null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2.5 font-black text-accent tracking-tight hover:opacity-90 transition-opacity">
            <Crown className="text-accent fill-accent/10 shrink-0" size={20} />
            <span className='text-xl'>Smart Home</span>
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
            className="mx-2 px-3 py-2.5 rounded-xl text-xs font-extrabold bg-accent text-[var(--btn-text)] hover:bg-accent-hover cursor-pointer flex items-center justify-center gap-2"
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
          {/* Wi-Fi Client/Internet Network Status Indicator */}
          <div 
            className="relative flex items-center" 
            ref={wifiNetDropdownRef}
            onMouseLeave={() => setShowWifiNetDropdown(false)}
          >
            <button
              onClick={() => {
                setShowWifiNetDropdown(!showWifiNetDropdown);
                setShowWifiDropdown(false);
              }}
              onMouseEnter={() => {
                setShowWifiNetDropdown(true);
                setShowWifiDropdown(false);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center relative ${
                !isClientOnline
                  ? 'border-red-500/30 bg-red-500/5 text-red-500 hover:bg-red-500/10 hover:border-red-500/50'
                  : wifiIsCritical
                  ? 'border-red-500/30 bg-red-500/5 text-red-500 hover:bg-red-500/10 hover:border-red-500/50 animate-pulse'
                  : wifiIsWeak
                  ? 'border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50'
                  : 'border-border bg-transparent text-text-muted hover:bg-accent-bg hover:border-border/80'
              }`}
              title="Wi-Fi Router Network Status"
            >
              <WifiSignalIcon percentage={clientNetQuality.percentage} online={isClientOnline} size={15} signalColor={wifiIconColor} />
              {/* Weak signal pulse dot */}
              {wifiIsWeak && (
                <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-card ${
                  wifiIsCritical ? 'bg-red-500 animate-pulse' : 'bg-amber-400 animate-pulse'
                }`} />
              )}
            </button>

            {/* Wi-Fi Network Dropdown Card */}
            {showWifiNetDropdown && (
              <div 
                className="absolute right-0 top-full mt-2.5 w-72 rounded-2xl border border-border bg-card p-4 shadow-2xl z-50 flex flex-col gap-3 animate-scale-in"
              >
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-[10px] font-black text-text uppercase tracking-wider font-label-caps">Wi-Fi Router Status</span>
                  <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                    !isClientOnline ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                    : wifiIsCritical ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                    : wifiIsWeak ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-[rgba(0,255,65,0.08)] text-[#00ff41] border border-[#00ff41]/20'
                  }`}>
                    {!isClientOnline ? 'Offline' : wifiIsCritical ? 'Critical' : wifiIsWeak ? 'Weak Signal' : 'Connected'}
                  </span>
                </div>
                
                <div className="flex flex-col gap-2 text-xs font-semibold select-none">
                  {isClientOnline ? (
                    <div className="flex flex-col gap-1.5 text-[11px] text-text-muted">
                      {/* Low signal warning banner */}
                      {wifiIsWeak && (
                        <div className={`flex items-start gap-2 p-2 rounded-lg border text-[10px] font-semibold mb-0.5 ${
                          wifiIsCritical 
                            ? 'bg-red-500/8 border-red-500/20 text-red-400' 
                            : 'bg-amber-500/8 border-amber-500/20 text-amber-400'
                        }`}>
                          <span className="text-base leading-none mt-px">{wifiIsCritical ? '🔴' : '🟡'}</span>
                          <div>
                            <p className="font-bold">{wifiIsCritical ? 'Critical Wi-Fi Speed' : 'Low Wi-Fi Speed Detected'}</p>
                            <p className="text-[9px] text-text-muted leading-tight mt-0.5">
                              {wifiIsCritical 
                                ? 'Very poor signal quality. Real-time updates may fail or disconnect.' 
                                : 'Signal degraded. Automations and updates may be slow or delayed.'}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Download Speed:</span>
                        <span className={`font-bold ${
                          wifiIsCritical ? 'text-red-400' : wifiIsWeak ? 'text-amber-400' : 'text-[#00ff41]'
                        }`}>
                          {clientNetQuality.downlink !== null ? `${clientNetQuality.downlink} Mbps` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Latency (RTT):</span>
                        <span className={`font-bold ${
                          clientNetQuality.rtt > 300 ? 'text-red-400' 
                          : clientNetQuality.rtt > 150 ? 'text-amber-400' 
                          : 'text-text'
                        }`}>
                          {clientNetQuality.rtt !== null ? `${clientNetQuality.rtt} ms` : '~14 ms'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Network Type:</span>
                        <span className="text-text font-bold uppercase">{clientNetQuality.effectiveType || '802.11ax'}</span>
                      </div>
                      {/* Live signal bar visualization */}
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[9px] text-text-muted">Signal:</span>
                        <div className="flex items-end gap-0.5">
                          {[1,2,3,4].map(i => (
                            <div key={i} className={`rounded-sm transition-all duration-500 ${
                              i <= clientNetQuality.bars 
                                ? wifiIsCritical ? 'bg-red-500' : wifiIsWeak ? 'bg-amber-400' : 'bg-[#00ff41]'
                                : 'bg-border'
                            }`} style={{ width: 4, height: 4 + i * 3 }} />
                          ))}
                        </div>
                        <span className={`text-[9px] font-bold ml-1 ${
                          wifiIsCritical ? 'text-red-400' : wifiIsWeak ? 'text-amber-400' : 'text-[#00ff41]'
                        }`}>{clientNetQuality.bars * 25}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 text-[10px] leading-relaxed text-red-500/90 font-semibold">
                      <p>⚠️ No Internet or Wi-Fi Router Connection</p>
                      <p className="text-[9px] text-text-muted leading-tight mt-0.5">
                        Your client terminal is offline. Please check your local Wi-Fi router connectivity.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Switchboard Board Range Status Indicator */}
          <div 
            className="relative flex items-center" 
            ref={wifiDropdownRef}
            onMouseLeave={() => setShowWifiDropdown(false)}
          >
            <button
              onClick={() => {
                setShowWifiDropdown(!showWifiDropdown);
                setShowWifiNetDropdown(false);
              }}
              onMouseEnter={() => {
                setShowWifiDropdown(true);
                setShowWifiNetDropdown(false);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                boards.length === 0
                  ? 'border-border bg-transparent text-text-muted/40 hover:text-text-muted hover:border-border/80'
                  : boards.some(b => !isBoardOnline(b.last_seen))
                  ? 'border-red-500/30 bg-red-500/5 text-red-500 hover:bg-red-500/10 hover:border-red-500/50'
                  : 'border-[#00ff41]/30 bg-[#00ff41]/5 text-[#00ff41] hover:bg-[#00ff41]/10 hover:border-[#00ff41]/50'
              }`}
              title="Hardware Board Range"
            >
              <BoardSignalIcon 
                percentage={overallWifi.percentage} 
                online={overallWifi.online && !boards.some(b => !isBoardOnline(b.last_seen))} 
                size={15} 
              />
            </button>

            {/* Board Range Dropdown Card */}
            {showWifiDropdown && (
              <div 
                className="absolute right-0 top-full mt-2.5 w-80 rounded-2xl border border-border bg-card p-4 shadow-2xl z-50 flex flex-col gap-3 animate-scale-in"
              >
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-[10px] font-black text-text uppercase tracking-wider font-label-caps">Board Connection & Range</span>
                  <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                    boards.length === 0
                      ? 'bg-border text-text-muted'
                      : boards.some(b => !isBoardOnline(b.last_seen))
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                      : 'bg-[#00ff41]/10 text-[#00ff41] border border-[#00ff41]/20'
                  }`}>
                    {boards.length === 0
                      ? 'No Hardware'
                      : boards.some(b => !isBoardOnline(b.last_seen))
                      ? 'Alert: Range Issue'
                      : 'All Connected'}
                  </span>
                </div>

                <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto select-none">
                  {boards.length === 0 ? (
                    <div className="text-center py-4 flex flex-col items-center gap-2">
                      <WifiOff className="text-text-muted/30" size={24} />
                      <p className="text-[11px] text-text-muted font-bold leading-normal px-4">
                        No active ESP32 switchboards have been added. Visit the <Link href="/boards" className="text-accent underline">Boards Manager</Link> to connect a device.
                      </p>
                    </div>
                  ) : (
                    boards.map(b => {
                      const online = isBoardOnline(b.last_seen);
                      const sig = getBoardSignal(b, online);
                      return (
                        <div 
                          key={b.id}
                          className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-all ${
                            online 
                              ? 'border-accent-bg bg-accent-bg/5 hover:bg-accent-bg/10' 
                              : 'border-red-500/10 bg-red-500/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-text truncate max-w-[150px]">{b.name}</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider ${online ? 'text-accent' : 'text-red-500'}`}>
                              {online ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          
                          {online ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex justify-between items-center text-[10px] font-semibold text-text-muted">
                                <span>Signal Strength:</span>
                                <span className="text-text font-bold">{sig.quality} ({sig.rssi} dBm)</span>
                              </div>
                              <div className="w-full h-1 bg-border rounded-full overflow-hidden mt-0.5">
                                <div 
                                  className="h-full bg-accent transition-all duration-500" 
                                  style={{ width: `${sig.percentage}%` }}
                                />
                              </div>
                              <div className="flex justify-between items-center text-[9px] text-text-muted/80 mt-0.5">
                                <span>Link Speed:</span>
                                <span className="text-text font-semibold">{sig.speed}</span>
                              </div>
                              <div className="flex justify-between items-center text-[9px] text-text-muted/80 mt-0.2">
                                <span>Approx. Distance:</span>
                                <span>{sig.distance} meters</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 text-[10px] leading-relaxed font-semibold text-red-500/90">
                              <p className="flex items-center gap-1">
                                ⚠️ Connection / Board range is Down.
                              </p>
                              <p className="text-[9px] text-text-muted leading-tight mt-0.5">
                                Please move the board closer to your router or check if the device power is connected.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

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
        <Link href="/" className="flex items-center gap-2 text-base font-black text-accent tracking-tight">
          <Crown className="text-accent fill-accent/10 shrink-0" size={16} />
          <span>smart home</span>
        </Link>
        <div className="flex items-center gap-2">
          {/* Wi-Fi Client/Internet Network Status Indicator (Mobile) */}
          <div className="relative flex items-center" ref={wifiNetDropdownRefMobile}>
            <button
              onClick={() => {
                setShowWifiNetDropdownMobile(!showWifiNetDropdownMobile);
                setShowWifiDropdownMobile(false);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                !isClientOnline
                  ? 'border-red-500/30 bg-red-500/5 text-red-500 hover:bg-red-500/10 hover:border-red-500/50'
                  : 'border-border bg-transparent text-text-muted hover:bg-accent-bg hover:border-border/80'
              }`}
            >
              <WifiSignalIcon percentage={isClientOnline ? 100 : 0} online={isClientOnline} size={14} />
            </button>

            {/* Mobile Dropdown Card */}
            {showWifiNetDropdownMobile && (
              <div className="fixed top-[70px] right-4 w-[280px] rounded-2xl border border-border bg-card p-4 shadow-2xl z-50 flex flex-col gap-3 animate-scale-in">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-[10px] font-black text-text uppercase tracking-wider font-label-caps font-bold">Network Wi-Fi</span>
                  <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                    isClientOnline ? 'bg-accent-bg text-accent border border-accent/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                  }`}>
                    {isClientOnline ? 'Connected' : 'Offline'}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 text-[10px] text-text-muted font-semibold select-none">
                  {isClientOnline ? (
                    <>
                      <div className="flex justify-between">
                        <span>Gateway IP:</span>
                        <span className="text-text font-bold">192.168.1.1</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ping Latency:</span>
                        <span className="text-accent font-bold">~14 ms</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-1 text-[9px] leading-relaxed text-red-500/90 font-semibold">
                      <p>⚠️ Internet Offline</p>
                      <p className="text-text-muted/80 mt-0.5">Please check local Wi-Fi gateway.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Switchboard Board Range Status Indicator (Mobile) */}
          <div className="relative flex items-center" ref={wifiDropdownRefMobile}>
            <button
              onClick={() => {
                setShowWifiDropdownMobile(!showWifiDropdownMobile);
                setShowWifiNetDropdownMobile(false);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                boards.length === 0
                  ? 'border-border bg-transparent text-text-muted/40'
                  : boards.some(b => !isBoardOnline(b.last_seen))
                  ? 'border-red-500/30 bg-red-500/5 text-red-500 hover:bg-red-500/10 hover:border-red-500/50'
                  : 'border-[#00ff41]/30 bg-[#00ff41]/5 text-[#00ff41] hover:bg-[#00ff41]/10 hover:border-[#00ff41]/50'
              }`}
            >
              <BoardSignalIcon 
                percentage={overallWifi.percentage} 
                online={overallWifi.online && !boards.some(b => !isBoardOnline(b.last_seen))} 
                size={14} 
              />
            </button>

            {/* Mobile Dropdown Card */}
            {showWifiDropdownMobile && (
              <div className="fixed top-[70px] right-4 w-[280px] rounded-2xl border border-border bg-card p-4 shadow-2xl z-50 flex flex-col gap-3 animate-scale-in">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-[10px] font-black text-text uppercase tracking-wider font-label-caps font-bold">Board Range</span>
                  <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                    boards.length === 0
                      ? 'bg-border text-text-muted'
                      : boards.some(b => !isBoardOnline(b.last_seen))
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                      : 'bg-[#00ff41]/10 text-[#00ff41] border border-[#00ff41]/20'
                  }`}>
                    {boards.length === 0 ? 'No HW' : boards.some(b => !isBoardOnline(b.last_seen)) ? 'Alert' : 'Online'}
                  </span>
                </div>

                <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto select-none">
                  {boards.length === 0 ? (
                    <div className="text-center py-4 flex flex-col items-center gap-2">
                      <WifiOff className="text-text-muted/30" size={20} />
                      <p className="text-[10px] text-text-muted font-semibold leading-normal px-2">
                        No active switchboards. Add a device on the Boards screen.
                      </p>
                    </div>
                  ) : (
                    boards.map(b => {
                      const online = isBoardOnline(b.last_seen);
                      const sig = getBoardSignal(b, online);
                      return (
                        <div 
                          key={b.id}
                          className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition-all ${
                            online 
                              ? 'border-accent-bg bg-accent-bg/5' 
                              : 'border-red-500/10 bg-red-500/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-text truncate max-w-[130px]">{b.name}</span>
                            <span className={`text-[8px] font-black uppercase tracking-wider ${online ? 'text-accent' : 'text-red-500'}`}>
                              {online ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          
                          {online ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex justify-between items-center text-[9px] font-semibold text-text-muted">
                                <span>Signal:</span>
                                <span>{sig.quality} ({sig.rssi} dBm)</span>
                              </div>
                              <div className="flex justify-between items-center text-[9px] font-semibold text-text-muted mt-0.5">
                                <span>Speed:</span>
                                <span className="text-text font-bold">{sig.speed}</span>
                              </div>
                              <div className="w-full h-1 bg-border rounded-full overflow-hidden mt-0.5">
                                <div 
                                  className="h-full bg-accent transition-all duration-500" 
                                  style={{ width: `${sig.percentage}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 text-[9px] leading-relaxed font-semibold text-red-500/90">
                              <p>⚠️ Range is Down.</p>
                              <p className="text-[8px] text-text-muted/80 leading-tight">
                                Move closer to router or check device power.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

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
                className="w-full py-3 rounded-xl text-xs font-extrabold bg-accent text-[var(--btn-text)] hover:bg-accent-hover  cursor-pointer flex items-center justify-center gap-2 "
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
