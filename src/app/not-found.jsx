'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto w-[min(100%-32px,620px)] flex flex-col items-center justify-center text-center py-20 px-4 animate-fade-up">
      {/* Visual Warning/Icon */}
      <div className="mb-6 relative flex items-center justify-center h-20 w-20 rounded-full bg-red border border-[red] text-[red] shadow-gold-glow animate-pulse">
        <AlertCircle size={40} className="stroke-[1.5]" />
      </div>

      {/* Large 404 Text */}
      <h1 className="text-6xl font-black text-[red] tracking-tighter mb-2">404</h1>
      
      {/* Title */}
      <h2 className="text-lg font-black uppercase tracking-widest text-text mb-4">
        Page Not Found
      </h2>

      {/* Description */}
      <p className="text-xs text-text-muted font-bold max-w-sm leading-relaxed mb-8">
        The page you are looking for does not exist, has been removed, or you do not have permission to access it.
      </p>

      {/* Return Button */}
      <Link 
        href="/"
        className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-xl bg-accent text-[var(--btn-text)] px-6 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent-hover active:scale-[0.98] transition-all cursor-pointer shadow-gold-glow"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
