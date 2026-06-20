'use client';

import { useEffect } from 'react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  const isError = message.toLowerCase().includes('error') || message.toLowerCase().includes('fail') || message.toLowerCase().includes('invalid');
  const isSuccess = message.toLowerCase().includes('success') || message.toLowerCase().includes('created') || message.toLowerCase().includes('saved') || message.toLowerCase().includes('activated');

  let bgClass = 'bg-accent/90 border-accent/20';
  if (isError) {
    bgClass = 'bg-[rgba(160,50,50,0.92)] border-red-500/20';
  } else if (isSuccess) {
    bgClass = 'bg-[rgba(34,120,41,0.92)] border-green-500/20';
  }

  return (
    <div
      className={`fixed top-4 right-4 z-[9999] max-w-[360px] rounded-xl border px-5 py-3 text-xs font-semibold text-white shadow-2xl backdrop-blur-md animate-slide-down ${bgClass}`}
    >
      {message}
    </div>
  );
}
