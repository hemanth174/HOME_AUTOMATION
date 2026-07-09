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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-[22px] backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div 
        className="w-[min(100%,460px)] overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_12px_40px_rgba(0,0,0,0.6)] shadow-gold-glow flex flex-col relative select-none animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-text-muted hover:text-accent transition-colors cursor-pointer border-none bg-transparent p-1.5 rounded-lg hover:bg-white/5"
          title="Skip Guide"
        >
          <X size={16} />
        </button>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-border/40 flex">
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
        <div className="p-6 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow mt-2">
            <IconComponent size={24} className="stroke-[2.5px]" />
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-base font-extrabold text-text tracking-tight">{currentStep.title}</h3>
            <p className="text-xs text-text-muted font-semibold leading-relaxed px-2">
              {currentStep.description}
            </p>
          </div>

          {/* Bullet Tips */}
          <div className="w-full bg-white/[0.02] border border-border/60 rounded-2xl p-4 text-left flex flex-col gap-2.5 mt-2">
            {currentStep.tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                <span className="text-[11px] font-bold text-text leading-snug">{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="border-t border-border/80 px-6 py-4 flex items-center justify-between bg-card-alt/30">
          <button
            onClick={handlePrev}
            disabled={step === 0}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-xs font-extrabold text-text transition-all hover:bg-card-alt disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
            Back
          </button>

          <span className="text-[10px] font-extrabold text-text-muted tracking-wider">
            STEP {step + 1} OF {steps.length}
          </span>

          <button
            onClick={handleNext}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-extrabold text-[var(--btn-text)] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer"
          >
            {step === steps.length - 1 ? 'Get Started' : 'Next'}
            {step !== steps.length - 1 && <ChevronRight size={14} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  );
}
