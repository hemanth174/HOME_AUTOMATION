'use client';

import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  const lower = message.toLowerCase();

  // Determine type from prefix symbols first, then keyword patterns
  const isErrorPrefix    = message.startsWith('⚠') || message.startsWith('❌');
  const isSuccessPrefix  = message.startsWith('✅');

  const isErrorKeyword   = !isSuccessPrefix && (
    lower.includes('error') ||
    lower.includes('fail') ||
    lower.includes('invalid') ||
    lower.includes("couldn't") ||
    lower.includes('could not') ||
    lower.includes('please try again') ||
    lower.includes('not found') ||
    lower.includes('no device')
  );

  const isDuplicateWarn  = !isSuccessPrefix && (
    lower.includes('duplicate') ||
    lower.includes('already exists') ||
    lower.includes('already has') ||
    lower.includes('only one alarm')
  );

  const isSuccessKeyword = !isErrorPrefix && !isDuplicateWarn && (
    lower.includes('set for') ||
    lower.includes('created for') ||
    lower.includes('deleted') ||
    lower.includes('cleared') ||
    lower.includes('enabled') ||
    lower.includes('disabled') ||
    lower.includes('turned on') ||
    lower.includes('turned off') ||
    lower.includes('saved') ||
    lower.includes('activated') ||
    lower.includes('success') ||
    lower.includes('alarm set') ||
    lower.includes('schedule set') ||
    lower.includes('schedules deleted') ||
    lower.includes('alarms deleted')
  );

  const isError   = isErrorPrefix || isErrorKeyword;
  const isSuccess = isSuccessPrefix || isSuccessKeyword;
  const isWarning = isDuplicateWarn;

  let containerClass, borderClass, Icon, iconColor, textColor;

  if (isError) {
    containerClass = 'bg-red-950/90 border-red-500/50';
    borderClass    = 'shadow-red-900/30';
    Icon           = AlertCircle;
    iconColor      = 'text-red-400';
    textColor      = 'text-red-100';
  } else if (isWarning) {
    containerClass = 'bg-amber-950/90 border-amber-500/50';
    borderClass    = 'shadow-amber-900/30';
    Icon           = AlertTriangle;
    iconColor      = 'text-amber-400';
    textColor      = 'text-amber-100';
  } else if (isSuccess) {
    containerClass = 'bg-green-950/90 border-green-500/50';
    borderClass    = 'shadow-green-900/30';
    Icon           = CheckCircle2;
    iconColor      = 'text-green-400';
    textColor      = 'text-green-100';
  } else {
    containerClass = 'bg-card/92 border-accent/40';
    borderClass    = 'shadow-gold-glow/10';
    Icon           = Info;
    iconColor      = 'text-accent';
    textColor      = 'text-text';
  }

  // Strip emoji prefix from displayed text for cleanliness
  const displayMessage = message.replace(/^[✅⚠❌]\s*/, '');

  return (
    <div
      role="alert"
      className={`fixed top-5 right-5 z-[9999] max-w-[400px] w-[calc(100%-40px)] rounded-2xl border p-4 text-xs font-bold shadow-2xl backdrop-blur-xl animate-slide-down flex items-start justify-between gap-3 select-none ${containerClass} ${borderClass}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <Icon size={16} className={`${iconColor} shrink-0 mt-0.5`} />
        <span className={`text-[12px] leading-snug font-semibold ${textColor}`}>{displayMessage}</span>
      </div>
      <button
        onClick={onClose}
        className={`p-1 rounded-lg ${iconColor} hover:opacity-70 transition-all cursor-pointer shrink-0 border-none bg-transparent mt-0.5`}
        title="Dismiss"
      >
        <X size={14} className="stroke-[2.5px]" />
      </button>
    </div>
  );
}
