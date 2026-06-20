'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const normalizeCommandText = (value) => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|a|an|please)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

export default function VoiceControl({ devices, onToast }) {
  const [listening, setListening] = useState(false);

  const getLatestDevices = useCallback(async () => {
    const { data } = await supabase
      .from('devices')
      .select('id, name, is_on')
      .order('relay_index');
    return data?.length ? data : devices;
  }, [devices]);

  const processCommand = useCallback(async (transcript) => {
    const text = normalizeCommandText(transcript);
    const commandDevices = await getLatestDevices();
    onToast(`Heard: "${transcript}"`);

    // Check for preset activation: "activate <preset name>"
    if (text.startsWith('activate ')) {
      const presetName = text.replace('activate ', '').trim();
      const { data: presets } = await supabase
        .from('presets')
        .select('id, name, actions')
        .ilike('name', `%${presetName}%`)
        .limit(1);
      
      if (presets && presets.length > 0) {
        const preset = presets[0];
        const actions = preset.actions;
        for (const action of actions) {
          await supabase
            .from('devices')
            .update({ is_on: action.is_on, last_changed: new Date().toISOString() })
            .eq('id', action.device_id);
        }
        onToast(`Activated preset: ${preset.name}`);
        return;
      }
    }

    // Check for "turn on/off all"
    if (text.includes('turn on all') || text.includes('all on')) {
      for (const device of commandDevices) {
        await supabase
          .from('devices')
          .update({ is_on: true, last_changed: new Date().toISOString() })
          .eq('id', device.id);
      }
      onToast('All devices turned ON');
      return;
    }

    if (text.includes('turn off all') || text.includes('all off')) {
      for (const device of commandDevices) {
        await supabase
          .from('devices')
          .update({ is_on: false, last_changed: new Date().toISOString() })
          .eq('id', device.id);
      }
      onToast('All devices turned OFF');
      return;
    }

    // Check for "turn on/off <device name>"
    const turnOnMatch = text.match(/(?:turn|switch) on (.+)/);
    const turnOffMatch = text.match(/(?:turn|switch) off (.+)/);
    
    if (turnOnMatch || turnOffMatch) {
      const isOn = !!turnOnMatch;
      const deviceName = normalizeCommandText((turnOnMatch || turnOffMatch)[1]);
      
      const matchedDevice = commandDevices.find(d => {
        const normalizedName = normalizeCommandText(d.name);
        return normalizedName.includes(deviceName) || deviceName.includes(normalizedName);
      });
      
      if (matchedDevice) {
        await supabase
          .from('devices')
          .update({ is_on: isOn, last_changed: new Date().toISOString() })
          .eq('id', matchedDevice.id);
        onToast(`${matchedDevice.name} turned ${isOn ? 'ON' : 'OFF'}`);
      } else {
        onToast(`Device "${deviceName}" not found`);
      }
      return;
    }

    onToast('Command not recognized. Try: "turn on [device]" or "activate [preset]"');
  }, [getLatestDevices, onToast]);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onToast('Voice control is not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      onToast('Voice recognition error. Please try again.');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      processCommand(transcript);
    };

    recognition.start();
  };

  return (
    <>
      {listening && (
        <div className="fixed bottom-24 right-5 bg-card px-5 py-3.5 rounded-xl border border-border shadow-[0_8px_32px_rgba(0,0,0,0.5)] shadow-gold-glow z-[200] max-w-[280px] animate-scale-in backdrop-blur-md flex flex-col gap-1 select-none">
          <strong className="text-sm text-text font-bold">Listening...</strong>
          <span className="text-[11px] leading-snug text-text-muted">Say: "turn on living room" or "activate party mode"</span>
        </div>
      )}
      <button
        className={`fixed bottom-7 right-7 w-14 h-14 rounded-full border-none bg-accent text-[#0a0800] text-[10px] font-extrabold tracking-wider cursor-pointer z-[200] shadow-[0_6px_24px_var(--accent-glow)] shadow-gold-glow hover:scale-[1.08] active:scale-100 hover:shadow-[0_8px_32px_var(--accent-glow)] transition-all duration-300 flex items-center justify-center uppercase select-none ${
          listening ? 'animate-pulse-ring scale-105 bg-accent-hover' : ''
        }`}
        onClick={startListening}
        title="Voice Control"
      >
        VOICE
      </button>
    </>
  );
}
