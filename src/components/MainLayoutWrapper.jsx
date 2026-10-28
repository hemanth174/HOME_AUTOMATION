'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AlarmExecutor from './AlarmExecutor';
import NotificationEngine from './NotificationEngine';
import GlobalToast from './GlobalToast';
import Loader from './Loader';
import LocalModeBanner from './LocalModeBanner';
import AccessForbidden from './AccessForbidden';
import Navbar from './Navbar';
import useLocalConnection from '@/hooks/useLocalConnection';
import { checkInternet } from '@/lib/netCheck';
import { isAdminEmail } from '@/lib/adminEmails';

const OAUTH_FLAG_KEY = 'vt_oauth_started';

function consumeOAuthFlag() {
  try {
    const started = sessionStorage.getItem(OAUTH_FLAG_KEY) === '1';
    if (started) sessionStorage.removeItem(OAUTH_FLAG_KEY);
    return started;
  } catch {
    return false;
  }
}

export default function MainLayoutWrapper({ children, className = "" }) {
  const pathname = usePathname();
  const router = useRouter();
  const cleanPath = (pathname || '').split('?')[0].split('#')[0].toLowerCase().replace(/\/$/, '') || '/';
  const VALID_ROUTES = ['/', '/local', '/login', '/pending', '/denied', '/presets', '/boards', '/schedules', '/alarms', '/analytics', '/logs', '/profile', '/settings', '/faq', '/terms', '/privacy-policy', '/terms-of-service', '/partner-program', '/contact-sales', '/admin'];
  const PUBLIC_ROUTES = ['/privacy-policy', '/terms-of-service', '/partner-program', '/contact-sales'];
  const isTrackPage = cleanPath.startsWith('/track/');
  const isAdminDeviceRoute = cleanPath.startsWith('/admin/devices/') && cleanPath.endsWith('/update') && cleanPath.split('/').length === 5;
  const isPublicPage = PUBLIC_ROUTES.includes(cleanPath) || isTrackPage;
  const is404Page = !VALID_ROUTES.includes(cleanPath) && !isTrackPage && !isAdminDeviceRoute;
  const isLoginPage = cleanPath === '/login';
  const isPendingPage = cleanPath === '/pending';
  const isDeniedPage = cleanPath === '/denied';
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState('checking');
  const [accessPath, setAccessPath] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [authNonce, setAuthNonce] = useState(0);
  const userRef = useRef(null);
  const [isClientOnline, setIsClientOnline] = useState(true); // Always true initially to match SSR
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const { isLocalConnected, localUrl } = useLocalConnection();

  const requiresApproval =
    !isLoginPage &&
    !isPendingPage &&
    !isDeniedPage &&
    !isPublicPage &&
    !is404Page &&
    cleanPath !== '/admin' &&
    !isAdminDeviceRoute &&
    cleanPath !== '/local';

  const fullWidthPage = isLoginPage || isPendingPage || isDeniedPage || cleanPath === '/admin' || isAdminDeviceRoute || is404Page || isPublicPage || (!user && cleanPath === '/');
  const accessReady = sessionReady && accessPath === cleanPath;

  useEffect(() => {
    const syncSidebar = (event) => {
      setSidebarExpanded(Boolean(event.detail?.expanded));
    };

    setSidebarExpanded(
      localStorage.getItem('vikatech_sidebar_pinned') === 'true',
    );
    window.addEventListener('vikatech-sidebar-change', syncSidebar);
    return () => window.removeEventListener('vikatech-sidebar-change', syncSidebar);
  }, []);

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
    if (cleanPath === '/admin' || isAdminDeviceRoute || isPendingPage || isDeniedPage || isTrackPage) {
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
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') recheckSoon();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Slow background beat catches silent ISP drops/restore.
    pollTimer = setInterval(evaluate, 30000);

    return () => {
      cancelled = true;
      clearTimeout(navTimer);
      clearInterval(pollTimer);
      window.removeEventListener('online', recheckSoon);
      window.removeEventListener('offline', recheckSoon);
      window.removeEventListener('focus', recheckSoon);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cleanPath, isDeniedPage, router]);

  // Offline device control runs inside the cached VikaTech web app at /local.
  // Use a real document navigation here (not Next.js client routing) so the
  // service worker can serve the cached /local app shell while cloud hosting
  // is unreachable. The page then sends relay commands directly to the ESP32.
  useEffect(() => {
    if (!isClientOnline && cleanPath !== '/local' && typeof window !== 'undefined') {
      window.location.replace('/local');
    }
  }, [isLocalConnected, isClientOnline, cleanPath]);

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

  // Access gate: protected routes must not render (and therefore must not
  // fetch dashboard data) until the account is fully approved.
  useEffect(() => {
    let active = true;

    if (cleanPath === '/local') {
      setSessionReady(true);
      return undefined;
    }

    if (requiresApproval) setSessionReady(false);

    const checkAccess = async () => {
      let session = null;
      try {
        const { data } = await supabase.auth.getSession();
        session = data.session;
      } catch {
        session = null;
      }
      if (!active) return;

      const currentUser = session?.user || null;
      userRef.current = currentUser;
      setUser((previous) => (previous?.id === currentUser?.id ? previous : currentUser));

      if (!currentUser) {
        setAccess('guest');
        setAccessPath(cleanPath);
        setSessionReady(true);
        if (
          !isLoginPage &&
          !isPendingPage &&
          !isDeniedPage &&
          !isPublicPage &&
          !is404Page &&
          cleanPath !== '/' &&
          cleanPath !== '/admin' &&
          !isAdminDeviceRoute &&
          navigator.onLine
        ) {
          router.replace('/login');
        }
        return;
      }

      if (!requiresApproval) {
        setAccess('approved');
        setAccessPath(cleanPath);
        setSessionReady(true);
        return;
      }

      if (isAdminEmail(currentUser.email)) {
        setAccess('approved');
        setAccessPath(cleanPath);
        setSessionReady(true);
        return;
      }

      const oauthReturn = cleanPath === '/' ? consumeOAuthFlag() : false;

      try {
        const response = await fetch('/api/account/status', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!active) return;

        if (response.status === 401) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {}
          if (!active) return;
          setUser(null);
          setAccess('guest');
          setAccessPath(cleanPath);
          setSessionReady(true);
          router.replace('/login');
          return;
        }

        if (!response.ok) throw new Error('Could not verify account access');

        const payload = await response.json();
        const approval = payload.approval || {};
        const rejected = approval.account_status === 'rejected' || approval.account_status === 'revoked';
        const approved =
          approval.account_status === 'approved' &&
          Boolean(approval.admin_one_approved_at) &&
          Boolean(approval.admin_two_approved_at);

        if (approved) {
          setAccess('approved');
        } else if (rejected) {
          setAccess('denied');
          router.replace('/denied');
        } else if (oauthReturn) {
          setAccess('redirecting');
          router.replace('/pending');
        } else {
          setAccess('pending');
        }
        setAccessPath(cleanPath);
        setSessionReady(true);
      } catch {
        if (!active) return;
        // Fail closed: an unverifiable account never gets the dashboard.
        setAccess('pending');
        setAccessPath(cleanPath);
        setSessionReady(true);
      }
    };

    checkAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') {
        userRef.current = null;
        setUser(null);
        setAccess('guest');
        setAccessPath(cleanPath);
        setSessionReady(true);
        setAuthNonce((value) => value + 1);
        if (
          !isLoginPage &&
          !isPendingPage &&
          !isDeniedPage &&
          !isPublicPage &&
          cleanPath !== '/' &&
          cleanPath !== '/local' &&
          cleanPath !== '/admin' &&
          !isAdminDeviceRoute
        ) {
          router.replace('/login');
        }
      } else if (event === 'SIGNED_IN') {
        const nextUser = session?.user || null;
        const sameUser = Boolean(nextUser && userRef.current?.id === nextUser.id);
        userRef.current = nextUser;
        setUser((previous) => (previous?.id === nextUser?.id ? previous : nextUser));
        if (!sameUser) {
          setAccess('checking');
          setAccessPath(null);
          setAuthNonce((value) => value + 1);
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [
    cleanPath,
    isLoginPage,
    isPendingPage,
    isDeniedPage,
    isPublicPage,
    is404Page,
    isAdminDeviceRoute,
    requiresApproval,
    authNonce,
    router,
  ]);

  // Loading / access screens. Protected pages never render children until
  // the approval check has completed successfully. The server always renders
  // the loader for protected routes so hydration matches the client.
  if (requiresApproval && (typeof window === 'undefined' || !accessReady)) {
    return <Loader message="Checking access..." />;
  }
  if (requiresApproval && access === 'pending') {
    return <AccessForbidden email={user?.email} />;
  }
  if (requiresApproval && (access === 'denied' || access === 'redirecting')) {
    return <Loader message={access === 'denied' ? 'Redirecting...' : 'Opening approval status...'} />;
  }
  if (requiresApproval && access === 'guest' && cleanPath !== '/') {
    return <Loader message="Redirecting to login..." />;
  }
  if (!user && !isLoginPage && !isPendingPage && !isDeniedPage && !isPublicPage && !is404Page && cleanPath !== '/' && cleanPath !== '/local' && isClientOnline && !isLocalConnected) {
    return <Loader message="Redirecting to login..." />;
  }

  return (
    <div
      className={`${fullWidthPage ? "w-full min-h-screen" : "desktop-shell-content w-full min-h-screen pb-20 md:pb-8"} ${className}`}
      style={fullWidthPage ? undefined : { '--desktop-sidebar-width': sidebarExpanded ? '16rem' : '4rem' }}
    >
      {!fullWidthPage && <Navbar />}
      {!fullWidthPage && cleanPath !== '/local' && (
          <LocalModeBanner
            isClientOnline={isClientOnline}
            isLocalConnected={isLocalConnected}
            localUrl={localUrl}
        />
      )}
      {children}
      {!fullWidthPage && <AlarmExecutor user={user} />}
      {!fullWidthPage && <NotificationEngine user={user} />}
      <GlobalToast />
    </div>
  );
}
