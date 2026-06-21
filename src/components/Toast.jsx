'use client';

import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  const isError = message.toLowerCase().includes('error') || message.toLowerCase().includes('fail') || message.toLowerCase().includes('invalid');
  const isSuccess = message.toLowerCase().includes('success') || message.toLowerCase().includes('created') || message.toLowerCase().includes('saved') || message.toLowerCase().includes('activated');

  let borderClass = 'border-accent/40 shadow-gold-glow/10';
  let Icon = Info;
  let iconColor = 'text-accent';

  if (isError) {
    borderClass = 'border-red-500/40 shadow-red-500/5';
    Icon = AlertCircle;
    iconColor = 'text-red-500';
  } else if (isSuccess) {
    borderClass = 'border-green-500/40 shadow-green-500/5';
    Icon = CheckCircle2;
    iconColor = 'text-green-500';
  }

  return (
    <div
      role="alert"
      className={`fixed top-5 right-5 z-[9999] max-w-[380px] w-[calc(100%-40px)] rounded-2xl border bg-card/92 p-4 text-xs font-bold text-text shadow-2xl backdrop-blur-xl animate-slide-down flex items-center justify-between gap-3 select-none ${borderClass}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon size={16} className={`${iconColor} shrink-0`} />
        <span className="truncate pr-1 text-text leading-tight">{message}</span>
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-accent-bg/10 transition-all cursor-pointer shrink-0 border-none bg-transparent"
        title="Dismiss"
      >
        <X size={14} className="stroke-[2.5px]" />
      </button>
    </div>
  );
}
