'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AlarmExecutor from './AlarmExecutor';
import GlobalToast from './GlobalToast';
import Loader from './Loader';
import LocalModeBanner from './LocalModeBanner';
import useLocalConnection from '@/hooks/useLocalConnection';

export default function MainLayoutWrapper({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const cleanPath = (pathname || '').split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, '') || '/';
  const VALID_ROUTES = ['/', '/local', '/login', '/presets', '/boards', '/schedules', '/alarms', '/analytics', '/logs', '/profile', '/faq', '/terms', '/privacy-policy', '/terms-of-service', '/partner-program', '/contact-sales'];
  const PUBLIC_ROUTES = ['/local', '/privacy-policy', '/terms-of-service', '/partner-program', '/contact-sales', '/terms'];
  const isTrackPage = cleanPath.startsWith('/track/');
  const isPublicPage = PUBLIC_ROUTES.includes(cleanPath) || isTrackPage;
  const is404Page = !VALID_ROUTES.includes(cleanPath) && !isTrackPage;
  const isLoginPage = cleanPath === '/login';
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(true);
  const [isClientOnline, setIsClientOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const { isLocalConnected, localUrl } = useLocalConnection();

  const fullWidthPage = isLoginPage || is404Page || isPublicPage || (!user && cleanPath === '/');

  // Monitor client online/offline status
  useEffect(() => {
    const handleOnline = () => setIsClientOnline(true);
    const handleOffline = () => setIsClientOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
  if (!user && !isLoginPage && !isPublicPage && cleanPath !== '/' && isClientOnline && !isLocalConnected) {
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
