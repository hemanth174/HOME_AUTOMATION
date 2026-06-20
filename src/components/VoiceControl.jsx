'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Mic } from 'lucide-react';

// Number-word to digit map
const WORD_TO_NUM = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12',
  first: '1', second: '2', third: '3', fourth: '4',
  fifth: '5', sixth: '6', seventh: '7', eighth: '8',
  ninth: '9', tenth: '10',
};

/**
 * Normalise raw speech:
 * - lowercase, strip punctuation
 * - remove filler words
 * - convert number-words to digits  ("fan two" => "fan 2")
 * - collapse whitespace
 */
const normalizeText = (value) => {
  let s = value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|a|an|please|can|you|could|would|hey|ok|okay)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.split(' ').map(w => WORD_TO_NUM[w] ?? w).join(' ');
  return s.replace(/\s+/g, ' ').trim();
};

/**
 * Token-overlap fuzzy score between two normalised strings. Returns 0-1.
 */
const fuzzyScore = (query, target) => {
  if (!query || !target) return 0;
  if (target === query) return 1;
  if (target.includes(query) || query.includes(target)) return 0.9;
  const qTokens = query.split(' ').filter(Boolean);
  const tTokens = target.split(' ').filter(Boolean);
  let matches = 0;
  for (const qt of qTokens) {
    if (tTokens.some(tt => tt === qt || tt.startsWith(qt) || qt.startsWith(tt))) matches++;
  }
  return matches / Math.max(qTokens.length, 1);
};

/** Return the best-matching device for query, or null if below threshold. */
const findBestDevice = (query, list, threshold = 0.4) => {
  let best = null;
  let bestScore = -1;
  for (const device of list) {
    const score = fuzzyScore(query, normalizeText(device.name));
    if (score > bestScore) { bestScore = score; best = device; }
  }
  return bestScore >= threshold ? best : null;
};

// ---------------------------------------------------------------------------
export default function VoiceControl({ devices: propDevices, boards: propBoards, onToast }) {
  const [listening, setListening] = useState(false);

  // Mutable refs so WS callbacks always see latest data without re-subscribing
  const devicesRef = useRef(propDevices ?? []);
  const boardsRef  = useRef(propBoards  ?? []);

  // Sync refs when parent state changes
  useEffect(() => { devicesRef.current = propDevices ?? []; }, [propDevices]);
  useEffect(() => { boardsRef.current  = propBoards  ?? []; }, [propBoards]);

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
            devicesRef.current = devicesRef.current.map(d => d.id === n.id ? { ...d, ...n } : d);
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

  // Fetch fresh devices (prefer live ref, DB fallback)
  const getLatestDevices = useCallback(async () => {
    if (devicesRef.current?.length) return devicesRef.current;
    const { data } = await supabase
      .from('devices')
      .select('id, name, is_on, board_id')
      .order('relay_index');
    return data ?? [];
  }, []);

  // Main command processor
  const processCommand = useCallback(async (transcript) => {
    const text           = normalizeText(transcript);
    const commandDevices = await getLatestDevices();
    const commandBoards  = boardsRef.current;

    onToast(`Heard: "${transcript}"`);

    // 1. Preset activation: "activate <name>"
    if (text.startsWith('activate ')) {
      const presetName = text.replace('activate ', '').trim();
      const { data: presets } = await supabase
        .from('presets')
        .select('id, name, actions')
        .ilike('name', `%${presetName}%`)
        .limit(1);
      if (presets?.length) {
        const preset = presets[0];
        await Promise.all(
          preset.actions.map(action =>
            supabase.from('devices')
              .update({ is_on: action.is_on, last_changed: new Date().toISOString() })
              .eq('id', action.device_id)
          )
        );
        onToast(`Activated preset: ${preset.name}`);
      } else {
        onToast(`Preset "${presetName}" not found`);
      }
      return;
    }

    // 2. All on / all off
    const allOnPhrases  = ['turn on all', 'all on', 'everything on', 'all lights on', 'all devices on'];
    const allOffPhrases = ['turn off all', 'all off', 'everything off', 'all lights off', 'all devices off'];

    if (allOnPhrases.some(p => text.includes(p))) {
      await Promise.all(commandDevices.map(d =>
        supabase.from('devices').update({ is_on: true,  last_changed: new Date().toISOString() }).eq('id', d.id)
      ));
      onToast('All devices turned ON');
      return;
    }
    if (allOffPhrases.some(p => text.includes(p))) {
      await Promise.all(commandDevices.map(d =>
        supabase.from('devices').update({ is_on: false, last_changed: new Date().toISOString() }).eq('id', d.id)
      ));
      onToast('All devices turned OFF');
      return;
    }

    // 3. Turn on/off a target (board name or device name)
    const turnOnMatch  = text.match(/(?:turn|switch|put)\s+on\s+(.+)/);
    const turnOffMatch = text.match(/(?:turn|switch|put)\s+off\s+(.+)/);

    if (turnOnMatch || turnOffMatch) {
      const isOn      = !!turnOnMatch;
      const rawTarget = normalizeText((turnOnMatch ?? turnOffMatch)[1]);

      // Try board name first
      let matchedBoard   = null;
      let bestBoardScore = -1;
      for (const board of commandBoards) {
        const score = fuzzyScore(rawTarget, normalizeText(board.name));
        if (score > bestBoardScore) { bestBoardScore = score; matchedBoard = board; }
      }

      if (bestBoardScore >= 0.6 && matchedBoard) {
        const boardDevices = commandDevices.filter(d => d.board_id === matchedBoard.id);
        if (!boardDevices.length) {
          onToast(`No devices found on board "${matchedBoard.name}"`);
          return;
        }
        await Promise.all(boardDevices.map(d =>
          supabase.from('devices').update({ is_on: isOn, last_changed: new Date().toISOString() }).eq('id', d.id)
        ));
        onToast(`All devices on "${matchedBoard.name}" turned ${isOn ? 'ON' : 'OFF'}`);
        return;
      }

      // Fall back to fuzzy device match
      const matchedDevice = findBestDevice(rawTarget, commandDevices);
      if (matchedDevice) {
        await supabase.from('devices')
          .update({ is_on: isOn, last_changed: new Date().toISOString() })
          .eq('id', matchedDevice.id);
        onToast(`${matchedDevice.name} turned ${isOn ? 'ON' : 'OFF'}`);
      } else {
        onToast(`Could not find a device or board matching "${rawTarget}"`);
      }
      return;
    }

    onToast('Command not recognised. Try: "turn on fan 2", "turn off living room", "activate party mode", or "all off"');
  }, [getLatestDevices, onToast]);

  // Speech Recognition
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onToast('Voice control is not supported in this browser');
      return;
    }
    const recognition      = new SpeechRecognition();
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.lang           = 'en-US';
    recognition.onstart  = () => setListening(true);
    recognition.onend    = () => setListening(false);
    recognition.onerror  = () => { setListening(false); onToast('Voice recognition error. Please try again.'); };
    recognition.onresult = (event) => { processCommand(event.results[0][0].transcript); };
    recognition.start();
  };

  return (
    <>
      {listening && (
        <div className="fixed bottom-36 max-md:bottom-36 right-7 bg-card/90 backdrop-blur-md px-5 py-3.5 rounded-xl border border-border shadow-[0_8px_32px_rgba(0,0,0,0.5)] shadow-gold-glow z-[200] max-w-[300px] animate-scale-in flex flex-col gap-1.5 select-none">
          <strong className="text-sm text-text font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Listening...
          </strong>
          <span className="text-[11px] leading-snug text-text-muted">
            Try: "turn on fan 2" · "turn off living room" · "activate party mode" · "all off"
          </span>
        </div>
      )}
      <button
        onClick={startListening}
        className={`fixed bottom-7 right-7 max-md:bottom-20 max-md:right-6 w-14 h-14 rounded-full border-none bg-gradient-to-tr from-accent to-[#e2cc89] text-[#0a0800] cursor-pointer z-[200] shadow-[0_6px_24px_var(--accent-glow)] shadow-gold-glow hover:scale-[1.08] active:scale-100 transition-all duration-300 flex items-center justify-center select-none group`}
        title="Voice Control"
      >
        {listening ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Listening Ripple Waves */}
            <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping [animation-duration:1.2s]" />
            <span className="absolute inset-[-6px] rounded-full bg-accent/25 animate-ping [animation-duration:1.6s]" />
            <span className="absolute inset-[-12px] rounded-full bg-accent/10 animate-ping [animation-duration:2s]" />
            
            {/* Mic Icon */}
            <Mic size={20} className="stroke-[2.5px] relative z-10 animate-pulse text-[#0a0800]" />
          </div>
        ) : (
          <Mic size={20} className="stroke-[2.5px] group-hover:scale-110 transition-transform text-[#0a0800]" />
        )}
      </button>
    </>
  );
}
