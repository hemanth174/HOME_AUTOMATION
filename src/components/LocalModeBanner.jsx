'use client';

import { Zap, WifiOff, ExternalLink, ShieldCheck, Wifi } from 'lucide-react';

export default function LocalModeBanner({ isClientOnline, isLocalConnected, localUrl = 'http://192.168.4.1' }) {
  // Scenario 1: Router/Internet is dead, but connected to ESP32 SoftAP
  if (!isClientOnline && isLocalConnected) {
    return (
      <div className="pt-16 max-md:pt-14">
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 text-amber-200 text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-between gap-2 transition-all">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <div className="flex items-center gap-1.5 font-medium">
              <Zap className="w-4 h-4 text-amber-400 " />
              <span>Local Autonomous Mode:</span>
            </div>
            <span className="text-amber-300/80 hidden sm:inline">
              Internet offline. Controlling devices directly via ESP32 local server (192.168.4.1).
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={localUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2.5 py-1 rounded-md border border-amber-500/40 text-xs transition-colors font-mono"
            >
              <span>Open ESP32 AP Panel</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Scenario 2: Mobile Data active (Internet online) + ESP32 Local connected concurrently
  if (isClientOnline && isLocalConnected) {
    return (
      <div className="pt-16 max-md:pt-14">
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-1.5 text-emerald-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Dual-Plane Active: Connected to ESP32 Local Server & Cloud Sync synchronized.
            </span>
          </div>
          <a
            href={localUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 underline underline-offset-2 text-[11px]"
          >
            <span>ESP32 AP (192.168.4.1)</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    );
  }

  return null;
}
