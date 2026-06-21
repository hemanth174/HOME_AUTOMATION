'use client';

import { useState, useEffect, useRef } from 'react';

export default function Loader({ message = 'Loading...' }) {
  const [mounted, setMounted] = useState(false);
  const playerRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Lock body scrolling to prevent background rendering overhead on scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    
    const player = playerRef.current;
    if (!player) return;

    const startPlaying = () => {
      try {
        if (typeof player.setLoop === 'function') {
          player.setLoop(true);
        } else {
          player.setAttribute('loop', 'true');
        }
        if (typeof player.play === 'function') {
          player.play();
        }
      } catch (err) {
        console.warn('Lottie player action failed:', err);
      }
    };

    player.addEventListener('ready', startPlaying);
    player.addEventListener('load', startPlaying);

    // Run fallback in case it is already loaded/ready
    startPlaying();

    return () => {
      player.removeEventListener('ready', startPlaying);
      player.removeEventListener('load', startPlaying);
    };
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg text-center">
        <div className="text-sm font-semibold text-text-muted animate-pulse">{message}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg text-center select-none animate-fade-in">
      <div className="w-[180px] h-[180px] flex items-center justify-center">
        <dotlottie-player
          ref={playerRef}
          src="/Live chatbot.lottie"
          background="transparent"
          speed="1"
          loop
          autoplay
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div className="text-[11px] font-extrabold text-text-muted mt-2 tracking-widest uppercase">{message}</div>
    </div>
  );
}
