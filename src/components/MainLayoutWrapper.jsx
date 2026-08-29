'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import AlarmExecutor from './AlarmExecutor';
import GlobalToast from './GlobalToast';
import Loader from './Loader';
import LocalModeBanner from './LocalModeBanner';
import useLocalConnection from '@/hooks/useLocalConnection';
import { checkInternet } from '@/lib/netCheck';

export default function MainLayoutWrapper({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const cleanPath = (pathname || '').split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, '') || '/';
  const VALID_ROUTES = ['/', '/local', '/login', '/presets', '/boards', '/schedules', '/alarms', '/analytics', '/logs', '/profile', '/faq', '/terms', '/privacy-policy', '/terms-of-service', '/partner-program', '/contact-sales', '/admin'];
  const PUBLIC_ROUTES = ['/privacy-policy', '/terms-of-service', '/partner-program', '/contact-sales', '/terms'];
  const isTrackPage = cleanPath.startsWith('/track/');
  const isPublicPage = PUBLIC_ROUTES.includes(cleanPath) || isTrackPage;
  const is404Page = !VALID_ROUTES.includes(cleanPath) && !isTrackPage;
  const isLoginPage = cleanPath === '/login';
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(true);
  const [isClientOnline, setIsClientOnline] = useState(true); // Always true initially to match SSR
  // Tracks that WE auto-sent the user to /local due to a real outage.
  // Only then are we allowed to bounce them back to the dashboard when
  // internet returns (never yank a user who opened /local themselves).
  const autoSentToLocalRef = useRef(false);
  const { isLocalConnected, localUrl } = useLocalConnection();

  const fullWidthPage = isLoginPage || is404Page || isPublicPage || (!user && cleanPath === '/');

  // Real connectivity monitor.
  //
  // CRITICAL: navigator.onLine / the browser "online" event only mean a
  // network INTERFACE is attached. Connecting the phone to the ESP32
  // SoftAP (HOME-AUTO-LEADER) fires "online" even with ZERO internet,
  // which used to wrongly flip the app online and navigate users away
  // from /local. Every decision below goes through checkInternet(),
  // which verifies actual reachability before acting.
  useEffect(() => {
    // Admin and public tracking pages are cloud-only views. Do not run the
    // local-mode connectivity probe here; its timeout intentionally appears
    // as a cancelled generate_204 request in browser DevTools.
    if (cleanPath === '/admin' || isTrackPage) {
      setIsClientOnline(true);
      return undefined;
    }
    let cancelled = false;
    let navTimer = null;
    let pollTimer = null;

    const evaluate = async () => {
      const up = await checkInternet();
      if (cancelled) return;
      setIsClientOnline(up);

      if (!up) {
        // True outage: no reachable internet on the current network
        // (Wi-Fi may still be attached - e.g. ESP32 SoftAP or dead router).
        if (cleanPath !== '/local' && !autoSentToLocalRef.current) {
          autoSentToLocalRef.current = true;
          router.push('/local');
        }
      } else if (autoSentToLocalRef.current && cleanPath === '/local') {
        // Internet genuinely restored AND we were the ones who sent the
        // user to /local -> return them to the main dashboard.
        autoSentToLocalRef.current = false;
        router.push('/');
      } else if (up) {
        autoSentToLocalRef.current = false;
      }
    };

    evaluate();

    // Connectivity transition events only TRIGGER a verified re-check -
    // they never set state directly (the SoftAP "online" trap).
    const recheckSoon = () => {
      clearTimeout(navTimer);
      navTimer = setTimeout(evaluate, 400);
    };
    window.addEventListener('online', recheckSoon);
    window.addEventListener('offline', recheckSoon);
    window.addEventListener('focus', recheckSoon);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') recheckSoon();
    });

    // Slow background beat catches silent ISP drops/restore.
    pollTimer = setInterval(evaluate, 10000);

    return () => {
      cancelled = true;
      clearTimeout(navTimer);
      clearInterval(pollTimer);
      window.removeEventListener('online', recheckSoon);
      window.removeEventListener('offline', recheckSoon);
      window.removeEventListener('focus', recheckSoon);
    };
  }, [cleanPath, router]);

  // Disable console logs in production mode
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      console.log = () => {};
      console.info = () => {};
      console.debug = () => {};
    }
  }, []);

  // Clear authentication tokens from URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.includes('access_token') || hash.includes('refresh_token') || hash.includes('error=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, [pathname]);

  // Non-blocking background auth session check
  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        if (cleanPath === '/local') return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;

        const currentUser = session?.user || null;
        setUser(currentUser);

        if (!currentUser && !isLoginPage && !isPublicPage && cleanPath !== '/' && navigator.onLine) {
          router.push('/login');
        } else if (currentUser && isLoginPage) {
          router.push('/');
        }
      } catch (err) {
        // Silent catch for offline / AP mode
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const currentUser = session?.user || null;
      setUser(currentUser);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isLoginPage, cleanPath, router, isPublicPage]);

  // Loading screens to prevent UI flashes
  // Redirecting loading screen if accessing unauthorized areas while online
  if (!user && !isLoginPage && !isPublicPage && cleanPath !== '/' && cleanPath !== '/local' && isClientOnline && !isLocalConnected) {
    return <Loader message="Redirecting to login..." />;
  }
  if (user && isLoginPage) {
    return <Loader message="Redirecting to dashboard..." />;
  }

  return (
    <div className={fullWidthPage ? "w-full min-h-screen" : "w-full min-h-screen md:pl-64 pb-20 md:pb-8 transition-all duration-300"}>
      {!fullWidthPage && (
        <LocalModeBanner
          isClientOnline={isClientOnline}
          isLocalConnected={isLocalConnected}
          localUrl={localUrl}
        />
      )}
      {children}
      {!fullWidthPage && <AlarmExecutor />}
      <GlobalToast />
    </div>
  );
}
