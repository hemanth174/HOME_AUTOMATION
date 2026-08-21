'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, ShieldCheck, WifiOff } from 'lucide-react';

export default function LocalModeBanner({ isClientOnline, isLocalConnected }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Prevent hydration mismatch — don't render until client is ready
  if (!mounted) return null;
  // Scenario 1: No Internet, but connected to ESP32 SoftAP (HOME-AUTO-LEADER)
  if (!isClientOnline && isLocalConnected) {
    return (
      <div className="pt-14 sm:pt-16 w-full">
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-2 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <div className="flex items-center gap-1.5 font-bold">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Offline Mode:</span>
            </div>
            <span className="text-amber-200/90 text-xs">
              Connected to ESP32 Wi-Fi. Use Local Control tab for sub-30ms hardware access.
            </span>
          </div>
          <Link
            href="/local"
            className="flex items-center gap-1 bg-amber-500/30 hover:bg-amber-500/40 text-amber-100 px-3 py-1 rounded-lg border border-amber-500/50 text-xs font-extrabold transition-all shrink-0"
          >
            <span>Open Local Control</span>
            <Zap className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Scenario 2: Internet active + ESP32 Local connected
  if (isClientOnline && isLocalConnected) {
    return (
      <div className="pt-14 sm:pt-16 w-full">
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-3 py-1.5 text-emerald-300 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs">
              ESP32 Local Mesh active & synced. Open Local Control for sub-30ms offline switching.
            </span>
          </div>
          <Link
            href="/local"
            className="flex items-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 px-2.5 py-1 rounded-lg border border-emerald-500/30 text-xs font-bold transition-all shrink-0"
          >
            <span>Local Control</span>
            <Zap className="w-3 h-3 text-emerald-400" />
          </Link>
        </div>
      </div>
    );
  }

  // Scenario 3: Internet is offline and NOT connected to ESP32
  if (!isClientOnline && !isLocalConnected) {
    return (
      <div className="pt-14 sm:pt-16 w-full">
        <div className="bg-red-500/15 border-b border-red-500/30 px-3 py-2 text-red-200 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              You are offline. Connect Wi-Fi to <strong>HOME-AUTO-LEADER</strong> for local hardware control.
            </span>
          </div>
          <Link
            href="/local"
            className="flex items-center gap-1 bg-red-500/20 hover:bg-red-500/30 text-red-100 px-2.5 py-1 rounded-lg border border-red-500/40 text-xs font-bold transition-all shrink-0"
          >
            <span>Local Tab</span>
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
