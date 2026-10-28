'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Dashboard from '@/components/Dashboard';
import LandingPage from '@/components/LandingPage';
import Loader from '@/components/Loader';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let sessionTimeout;

    const checkUser = async () => {
      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise((resolve) => {
            sessionTimeout = setTimeout(() => resolve({ data: { session: null } }), 8000);
          }),
        ]);

        if (!active) return;
        setUser(session?.user || null);
      } catch {
        if (!active) return;
        setUser(null);
      } finally {
        clearTimeout(sessionTimeout);
        if (active) setLoading(false);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user || null;
      setUser((previous) => (previous?.id === nextUser?.id ? previous : nextUser));
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <Loader message="Loading VikaTech..." />;
  }

  if (user) {
    return <Dashboard />;
  }

  return <LandingPage />;
}
