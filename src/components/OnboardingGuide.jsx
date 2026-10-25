'use client';

import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Crown, SlidersHorizontal, Mic, CalendarDays, Lightbulb } from 'lucide-react';

export default function OnboardingGuide({ isOpen, onClose }) {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      title: "Welcome to Smart Home",
      icon: Crown,
      description: "Experience premium home automation with real-time status updates, scheduling, alarms, and voice commands.",
      tips: [
        "Monitor your connected boards and active relays",
        "Observe instant feedback when AC current is detected",
        "Control devices globally, by board, or individually"
      ]
    },
    {
      title: "Dual Control (XOR Logic)",
      icon: Lightbulb,
      description: "Our system separates the command (the app toggle) from the reality (the physical light status).",
      tips: [
        "The Toggle switch controls the database command state",
        "The Lightbulb icon represents actual current flow in the room",
        "Manual Override: Flipping your wall switch toggles the light status instantly without app interference"
      ]
    },
    {
      title: "Schedules & Alarms",
      icon: CalendarDays,
      description: "Automate your devices by scheduling recurring events or setting one-time triggers.",
      tips: [
        "Schedules: Configure weekly repeats for specific days and times",
        "Alarms: Set one-time future actions to automatically toggle relays",
        "Conflict Prevention: The system alerts you if schedules or alarms overlap"
      ]
    },
    {
      title: "Voice Controls & Presets",
      icon: Mic,
      description: "Interact with your home hands-free using natural English speech commands.",
      tips: [
        "Global Mic: Tap the bottom-right microphone and speak commands",
        "Presets: Create customized device combinations like 'Party Mode'",
        "Say: 'activate Party Mode', 'turn off Living Room', or 'deactive fan 2'"
      ]
    }
  ];

  const currentStep = steps[step];
  const IconComponent = currentStep.icon;

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div 
        className="relative flex max-h-[calc(100dvh-24px)] w-full max-w-[460px] flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_12px_40px_rgba(0,0,0,0.6)] shadow-gold-glow select-none animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-3 right-3 z-10 rounded-lg border-none bg-transparent p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-accent cursor-pointer sm:top-4 sm:right-4"
          title="Skip Guide"
          aria-label="Close guide"
        >
          <X size={16} />
        </button>

        {/* Progress Bar */}
        <div className="flex h-1 w-full shrink-0 bg-border/40">
          {steps.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-full flex-1 transition-all duration-300 ${
                idx <= step ? 'bg-accent shadow-[0_0_8px_var(--accent)]' : 'bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Content Area */}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto overscroll-contain p-4 text-center sm:gap-4 sm:p-6">
          <div className="w-12 h-12 rounded-2xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow mt-2">
            <IconComponent size={24} className="stroke-[2.5px]" />
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-base font-extrabold text-text tracking-tight">{currentStep.title}</h3>
            <p className="px-0 text-[11px] font-semibold leading-relaxed text-text-muted sm:px-2 sm:text-xs">
              {currentStep.description}
            </p>
          </div>

          {/* Bullet Tips */}
          <div className="mt-1 flex w-full flex-col gap-2.5 rounded-2xl border border-border/60 bg-white/[0.02] p-3 text-left sm:mt-2 sm:p-4">
            {currentStep.tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                <span className="text-[10px] font-bold leading-snug text-text sm:text-[11px]">{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-t border-border/80 bg-card-alt/30 px-3 py-3 sm:px-6 sm:py-4">
          <button
            onClick={handlePrev}
            disabled={step === 0}
            className="inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap rounded-xl border border-border bg-card px-3 text-[11px] font-extrabold text-text transition-all hover:bg-card-alt disabled:pointer-events-none disabled:opacity-30 cursor-pointer sm:gap-1.5 sm:px-4 sm:text-xs"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
            Back
          </button>

          <span className="text-center text-[9px] font-extrabold tracking-wider text-text-muted sm:text-[10px]">
            STEP {step + 1} OF {steps.length}
          </span>

          <button
            onClick={handleNext}
            className="inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap rounded-xl bg-accent px-3 text-[11px] font-extrabold text-[var(--btn-text)] shadow-gold-glow transition-all hover:bg-accent-hover cursor-pointer sm:gap-1.5 sm:px-4 sm:text-xs"
          >
            {step === steps.length - 1 ? 'Get Started' : 'Next'}
            {step !== steps.length - 1 && <ChevronRight size={14} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  );
}
