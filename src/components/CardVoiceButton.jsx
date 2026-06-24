'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, X } from 'lucide-react';

export default function CardVoiceButton({ onCommand, onToast }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (onToast) onToast('Voice control is not supported in this browser');
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      if (event.error !== 'aborted' && onToast) {
        onToast('Voice recognition error. Please try again.');
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onCommand(transcript);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error(err);
      setListening(false);
      recognitionRef.current = null;
    }
  };

  const toggleListening = (e) => {
    e.stopPropagation();
    if (listening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      setListening(false);
    } else {
      startListening();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleListening}
        className={`inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition-all duration-250 cursor-pointer hover:scale-105 active:scale-95 ${
          listening
            ? 'border-red-500 bg-red-500/20 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse'
            : 'border-border bg-card text-text-muted hover:border-accent hover:text-accent hover:shadow-[0_0_12px_rgba(201,168,76,0.3)]'
        }`}
        title={listening ? 'Cancel Listening' : 'Control via Voice'}
      >
        {listening ? <X size={15} strokeWidth={2.5} /> : <Mic size={15} strokeWidth={2.5} />}
      </button>

      {listening && (
        <div className="absolute bottom-11 right-0 bg-card/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-border shadow-[0_4px_16px_rgba(0,0,0,0.5)] shadow-gold-glow z-[200] max-w-[180px] text-center select-none animate-scale-in">
          <p className="text-[10px] font-extrabold text-accent flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Listening...
          </p>
        </div>
      )}
    </div>
  );
}
