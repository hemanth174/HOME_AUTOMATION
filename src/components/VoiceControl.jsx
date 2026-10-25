'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Mic } from 'lucide-react';
import { useVoiceAgentVisible } from '@/lib/agentVisibility';
import { useVoiceCommandProcessor } from './voiceCommandProcessor';

// ---------------------------------------------------------------------------
export default function VoiceControl({ devices: propDevices, boards: propBoards, presets: propPresets, applyPreset, controlDevice, controlAll, onToast }) {
  const router = useRouter();
  const [selectedLang, setSelectedLang] = useState('en-US');
  const [listening, setListening] = useState(false);
  const [agentState, setAgentState] = useState('idle');
  const agentVisible = useVoiceAgentVisible();
  const [voicePosition, setVoicePosition] = useState(null);
  const [voiceDragging, setVoiceDragging] = useState(false);
  const voiceDragRef = useRef(null);
  const voiceButtonRef = useRef(null);
  const voiceDraggedRef = useRef(false);

  // If the user hides the agent mid-listen, stop recognition immediately.
  useEffect(() => {
    if (!agentVisible) {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
        recognitionRef.current = null;
      }
      setListening(false);
    }
  }, [agentVisible]);

  useEffect(() => {
    const moveVoiceAgent = (event) => {
      const drag = voiceDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      const moved = Math.abs(event.clientX - drag.startX) > 4 ||
        Math.abs(event.clientY - drag.startY) > 4;
      if (moved) voiceDraggedRef.current = true;
      if (!voiceDraggedRef.current) return;

      const left = Math.max(8, Math.min(window.innerWidth - 64, event.clientX - drag.offsetX));
      const top = Math.max(8, Math.min(window.innerHeight - 64, event.clientY - drag.offsetY));
      setVoicePosition({ left, top });
    };

    const stopVoiceDrag = (event) => {
      if (voiceDragRef.current?.pointerId !== event.pointerId) return;
      voiceDragRef.current = null;
      setVoiceDragging(false);
    };

    window.addEventListener('pointermove', moveVoiceAgent);
    window.addEventListener('pointerup', stopVoiceDrag);
    window.addEventListener('pointercancel', stopVoiceDrag);
    return () => {
      window.removeEventListener('pointermove', moveVoiceAgent);
      window.removeEventListener('pointerup', stopVoiceDrag);
      window.removeEventListener('pointercancel', stopVoiceDrag);
    };
  }, []);

  const startVoiceDrag = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = voiceButtonRef.current?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    voiceDraggedRef.current = false;
    setVoiceDragging(true);
    voiceDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const voiceFloatingStyle = voicePosition
    ? {
        left: `${Math.max(8, Math.min(
          (typeof window !== 'undefined' ? window.innerWidth : 360) - 120,
          voicePosition.left - 20,
        ))}px`,
        top: `${Math.max(8, voicePosition.top - 48)}px`,
        right: 'auto',
        bottom: 'auto',
      }
    : undefined;

  // Mutable refs so WS callbacks always see latest data without re-subscribing
  const devicesRef = useRef(propDevices ?? []);
  const boardsRef = useRef(propBoards ?? []);
  const presetsRef = useRef(propPresets ?? []);
  const recognitionRef = useRef(null);
  const pendingActionRef = useRef(null);
  const conversationRef = useRef([]);

  // Sync refs when parent state changes
  useEffect(() => { devicesRef.current = propDevices ?? []; }, [propDevices]);
  useEffect(() => { boardsRef.current = propBoards ?? []; }, [propBoards]);
  useEffect(() => { presetsRef.current = propPresets ?? []; }, [propPresets]);

  // Fetch missing prop data on mount if self-contained
  useEffect(() => {
    const fetchMissingData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!propDevices || propDevices.length === 0) {
        const { data: devs, error } = await supabase
          .from('devices')
          .select('id, name, is_on, board_id, relay_index, boards(name, board_identifier)')
          .eq('user_id', user.id)
          .order('relay_index');
        if (!error && devs) {
          devicesRef.current = devs.map((device) => ({
            ...device,
            board_name: device.boards?.name || '',
            node_id: device.boards?.board_identifier || null,
          }));
        }
      }
      if (!propBoards || propBoards.length === 0) {
        const { data: bds, error } = await supabase
          .from('boards')
          .select('id, name, board_identifier')
          .eq('user_id', user.id);
        if (!error && bds) {
          boardsRef.current = bds;
        }
      }
      if (!propPresets || propPresets.length === 0) {
        const { data: prs, error } = await supabase
          .from('presets')
          .select('id, name, actions')
          .eq('user_id', user.id);
        if (!error && prs) {
          presetsRef.current = prs.map((preset) => {
            let actions = preset.actions;
            if (typeof actions === 'string') {
              try { actions = JSON.parse(actions); } catch { actions = []; }
            }
            return { ...preset, actions: Array.isArray(actions) ? actions : [] };
          });
        }
      }
    };
    fetchMissingData();
  }, [propDevices, propBoards, propPresets]);

  // The 'speak' function is now imported from @/utils/voice to guarantee the exact same voice globally

  // Realtime WebSocket: devices + boards
  useEffect(() => {
    const deviceCh = supabase
      .channel('vc-devices-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            if (!devicesRef.current.find(d => d.id === n.id))
              devicesRef.current = [...devicesRef.current, n];
          } else if (eventType === 'UPDATE') {
            devicesRef.current = devicesRef.current.map((device) => {
              if (device.id !== n.id) return device;
              const board = boardsRef.current.find((item) => item.id === n.board_id);
              return {
                ...device,
                ...n,
                board_name: board?.name || device.board_name || device.boards?.name || '',
                node_id: board?.board_identifier || device.node_id || device.boards?.board_identifier || null,
              };
            });
          } else if (eventType === 'DELETE') {
            devicesRef.current = devicesRef.current.filter(d => d.id !== o.id);
          }
        })
      .subscribe();

    const boardCh = supabase
      .channel('vc-boards-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') {
            if (!boardsRef.current.find(b => b.id === n.id))
              boardsRef.current = [...boardsRef.current, n];
          } else if (eventType === 'UPDATE') {
            boardsRef.current = boardsRef.current.map(b => b.id === n.id ? { ...b, ...n } : b);
          } else if (eventType === 'DELETE') {
            boardsRef.current = boardsRef.current.filter(b => b.id !== o.id);
          }
        })
      .subscribe();

    return () => {
      supabase.removeChannel(deviceCh);
      supabase.removeChannel(boardCh);
    };
  }, []); // mount-once; refs stay current via sync effects above

  // Enrich the device rows with board identity so local commands are routed
  // to the owning ESP32, not just to a relay number shared by every board.
  const enrichDevices = useCallback((items) => (items || []).map((device) => {
    const board = boardsRef.current.find((item) => item.id === device.board_id);
    return {
      ...device,
      board_name: device.board_name || device.boards?.name || board?.name || '',
      node_id: device.node_id || device.boards?.board_identifier || board?.board_identifier || null,
    };
  }), []);

  // Fetch fresh devices (prefer live refs, DB fallback).
  const getLatestDevices = useCallback(async () => {
    if (devicesRef.current?.length) return enrichDevices(devicesRef.current);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('devices')
      .select('id, name, is_on, board_id, relay_index, boards(name, board_identifier)')
      .eq('user_id', user.id)
      .order('relay_index');
    if (error) return [];
    const enriched = enrichDevices(data || []);
    devicesRef.current = enriched;
    return enriched;
  }, [enrichDevices]);

  const processCommand = useVoiceCommandProcessor({
    getLatestDevices,
    onToast,
    applyPreset,
    controlDevice,
    controlAll,
    selectedLang,
    presetsRef,
    pendingActionRef,
    conversationRef,
    router,
    setAgentState,
  });

  // Browser recognition uses the browser's free speech provider and requires no API key.
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onToast('Voice control is not supported in this browser');
      return;
    }

    // Abort any active recognition first
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) { }
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = selectedLang;
     recognition.onstart = () => {
       setListening(true);
       setAgentState('listening');
     };
    recognition.onend = () => {
       setListening(false);
       setAgentState((current) => current === 'listening' ? 'idle' : current);
      recognitionRef.current = null;
    };
    recognition.onerror = (event) => {
       setListening(false);
       setAgentState('error');
      recognitionRef.current = null;
      if (event.error !== 'aborted') {
        onToast('Voice recognition error. Please try again.');
      }
    };
    recognition.onresult = (event) => {
      processCommand(event.results[0][0].transcript);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error(err);
      setListening(false);
      recognitionRef.current = null;
    }
  };

  const startSarvamListening = async () => {

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        onToast('Please sign in before using voice control.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      setListening(true);

      const recorder = new MediaRecorder(stream);

      const chunks = [];

      recorder.ondataavailable = (e) => {

        chunks.push(e.data);

      };

      recorder.onstop = async () => {

        setListening(false);

        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(chunks, {
          type: "audio/webm"
        });
        const formData = new FormData();

        formData.append("audio", audioBlob, "voice.webm");

        const response = await fetch("/api/sarvam/stt", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.transcript) {
          throw new Error(data.error || "Speech transcription failed");
        }

        await processCommand(data.transcript);

      };

      recorder.start();

      setTimeout(() => {

        recorder.stop();

      }, 5000);

    } catch (err) {

      console.error(err);

      setListening(false);

      onToast("Microphone permission denied");

    }

  }
  const toggleListening = async () => {
    if (listening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
      }
      setListening(false);
      setAgentState('idle');
      recognitionRef.current = null;
    } else {
      const hasIntroduced = localStorage.getItem('auraIntroPlayed');
      if (!hasIntroduced) {
        localStorage.setItem('auraIntroPlayed', 'true');
        onToast(selectedLang === 'te-IN' ? 'ఆరా మాట్లాడుతోంది...' : selectedLang === 'hi-IN' ? 'ऑरा बोल रही है...' : 'Aura is speaking...');
        let introText = "Hello, I am Aura, your Electric Warriors AI assistant. How can I help you?";
        if (selectedLang === 'te-IN') introText = "నమస్కారం, నేను ఆరా, మీ సహాయకురాలిని. మీకు ఎలా సహాయపడగలను?";
        else if (selectedLang === 'hi-IN') introText = "नमस्ते, मैं ऑरा हूँ, आपकी स्मार्ट होम सहायक। मैं आपकी क्या मदद कर सकती हूँ?";
        await speak(introText, selectedLang);
      } if (selectedLang === "te-IN") {

        await startSarvamListening();

      } else {

        startListening();

      }

    }
  };

  // Hidden via Profile → Voice Agent setting.
  if (!agentVisible) return null;

  return (
    <>
      {/* Language Selector Pill */}
      <div onPointerDown={startVoiceDrag} style={voiceFloatingStyle} className={`fixed bottom-[92px] right-7 max-md:bottom-[148px] max-md:right-6 bg-card/85 backdrop-blur-md px-2 py-1 rounded-full border border-border shadow-[0_4px_16px_rgba(0,0,0,0.3)] z-[200] flex gap-1 items-center select-none font-bold text-[10px] tracking-wider touch-none ${voiceDragging ? 'transition-none' : 'transition-all duration-300'}`}>
        <button
          onClick={() => setSelectedLang('en-US')}
          aria-label="Use English"
          className={`px-2 py-0.5 rounded-full border-none cursor-pointer transition-all duration-300 ${selectedLang === 'en-US' ? 'bg-accent text-[var(--btn-text)] shadow-[0_0_12px_var(--accent-glow)]' : 'text-text-muted hover:text-accent hover:bg-accent-bg bg-transparent'}`}
        >
          EN
        </button>
        <div className="w-[1px] h-3 bg-border" />
        <button
          onClick={() => setSelectedLang('te-IN')}
          aria-label="Use Telugu"
          className={`px-2 py-0.5 rounded-full border-none cursor-pointer transition-all duration-300 ${selectedLang === 'te-IN' ? 'bg-accent text-[var(--btn-text)] shadow-[0_0_12px_var(--accent-glow)]' : 'text-text-muted hover:text-accent hover:bg-accent-bg bg-transparent'}`}
        >
          తె
        </button>
        <div className="w-[1px] h-3 bg-border" />
        <button
          onClick={() => setSelectedLang('hi-IN')}
          aria-label="Use Hindi"
          className={`px-2 py-0.5 rounded-full border-none cursor-pointer transition-all duration-300 ${selectedLang === 'hi-IN' ? 'bg-accent text-[var(--btn-text)] shadow-[0_0_12px_var(--accent-glow)]' : 'text-text-muted hover:text-accent hover:bg-accent-bg bg-transparent'}`}
        >
          हि
        </button>
      </div>

      {listening && (
        <div onPointerDown={startVoiceDrag} style={voiceFloatingStyle} className={`fixed bottom-36 max-md:bottom-36 right-7 bg-card/90 backdrop-blur-md px-5 py-3.5 rounded-xl border border-border shadow-[0_8px_32px_rgba(0,0,0,0.5)] shadow-gold-glow z-[200] max-w-[300px] animate-scale-in flex flex-col gap-1.5 select-none touch-none ${voiceDragging ? 'transition-none' : 'transition-all duration-300'}`}>
          <strong className="text-sm text-text font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {selectedLang === 'te-IN' ? 'వింటున్నాను...' : selectedLang === 'hi-IN' ? 'सुन रहा हूँ...' : 'Listening...'}
          </strong>
          <span className="text-[11px] leading-snug text-text-muted">
            {selectedLang === 'te-IN'
              ? 'ప్రయత్నించండి: "ఫ్యాన్ 2 ఆన్ చేయి" · "రూమ్ ఆఫ్ చేయి" · "సహాయం చేయి"'
              : selectedLang === 'hi-IN'
                ? 'कोशिश करें: "पंख 2 चालू करें" · "लिविंग रूम बंद करें" · "मदद करें"'
                : 'Try: "turn on fan 2" · "turn off living room" · "activate party mode"'}
          </span>
        </div>
      )}
      {agentState !== 'idle' && agentState !== 'listening' && agentState !== 'error' && (
        <div onPointerDown={startVoiceDrag} style={voiceFloatingStyle} className={`fixed bottom-36 max-md:bottom-36 right-7 bg-card/90 backdrop-blur-md px-5 py-3 rounded-xl border border-border shadow-lg z-[200] text-sm text-text touch-none ${voiceDragging ? 'transition-none' : 'transition-all duration-300'}`}>
          {agentState === 'transcribing' ? 'Transcribing...' : 'Processing command...'}
        </div>
      )}
      <button
        id="voice-control-mic-btn"
        ref={voiceButtonRef}
        onPointerDown={startVoiceDrag}
        onClick={() => {
          if (voiceDraggedRef.current) {
            voiceDraggedRef.current = false;
            return;
          }
          toggleListening();
        }}
        style={voicePosition ? { left: `${voicePosition.left}px`, top: `${voicePosition.top}px`, right: 'auto', bottom: 'auto', touchAction: 'none' } : { touchAction: 'none' }}
        className={`fixed bottom-7 right-7 max-md:bottom-20 max-md:right-6 w-14 h-14 rounded-full border-none bg-gradient-to-tr from-accent to-[#e2cc89] text-[var(--btn-text)] cursor-grab active:cursor-grabbing z-[200] shadow-[0_6px_24px_var(--accent-glow)] shadow-gold-glow flex items-center justify-center select-none group ${listening ? 'text-[var(--btn-text)]' : 'voice-agent-idle'}`}
        title="Voice Control"
      >
        {listening ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Listening Ripple Waves */}
            <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping [animation-duration:1.2s]" />
            <span className="absolute inset-[-6px] rounded-full bg-accent/25 animate-ping [animation-duration:1.6s]" />
            <span className="absolute inset-[-12px] rounded-full bg-accent/10 animate-ping [animation-duration:2s]" />

            {/* Cross Icon */}
            <div className="relative z-10 flex items-center gap-1">
              <div className="voice-agent-bars" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              {/* <X size={18} className="stroke-[2.5px] animate-pulse text-[var(--btn-text)]" /> */}
            </div>
          </div>
        ) : (
          <Mic size={20} className="stroke-[2.5px] group-hover:scale-110 transition-transform text-[var(--btn-text)]" />
        )}
      </button>
    </>
  );
}
