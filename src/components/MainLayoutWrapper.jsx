'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AlarmExecutor from './AlarmExecutor';
import GlobalToast from './GlobalToast';
import Loader from './Loader';

export default function MainLayoutWrapper({ children }) {
  const pathname = usePathname();
  const cleanPath = (pathname || '').split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, '') || '/';
  const VALID_ROUTES = ['/', '/login', '/presets', '/boards', '/schedules', '/alarms', '/analytics', '/logs', '/profile', '/faq', '/terms'];
  const is404Page = !VALID_ROUTES.includes(cleanPath);
  const isLoginPage = cleanPath === '/login';
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const fullWidthPage = isLoginPage || is404Page || (!user && cleanPath === '/');

  // Clear authentication tokens from the URL immediately on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.includes('access_token') || hash.includes('refresh_token') || hash.includes('error=')) {
        // Clear the hash parameters without reloading the page or losing current pathname/search query
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  // Monitor auth state and enforce route protection centrally
  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      
      const currentUser = session?.user || null;
      setUser(currentUser);
      setAuthChecked(true);

      // Route protection redirects
      if (!currentUser && !isLoginPage && cleanPath !== '/') {
        window.location.href = '/login';
      } else if (currentUser && isLoginPage) {
        window.location.href = '/';
      }
    };

    checkSession();

    // Subscribe to real-time auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const currentUser = session?.user || null;
      setUser(currentUser);
      setAuthChecked(true);

      if (!currentUser && !isLoginPage && cleanPath !== '/') {
        window.location.href = '/login';
      } else if (currentUser && isLoginPage) {
        window.location.href = '/';
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isLoginPage, cleanPath]);

  // Loading screens to prevent UI flashes
  if (!authChecked) {
    return <Loader message="Verifying authentication..." />;
  }

  // Redirecting loading screen if accessing unauthorized areas
  if (!user && !isLoginPage && cleanPath !== '/') {
    return <Loader message="Redirecting to login..." />;
  }
  if (user && isLoginPage) {
    return <Loader message="Redirecting to dashboard..." />;
  }

  return (
    <div className={fullWidthPage ? "w-full min-h-screen" : "w-full min-h-screen md:pl-64 pb-20 md:pb-8 transition-all duration-300"}>
      {children}
      {!fullWidthPage && <AlarmExecutor />}
      <GlobalToast />
    </div>
  );
}
