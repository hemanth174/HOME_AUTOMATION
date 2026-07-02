'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Mic, X } from 'lucide-react';

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

/**
 * Parse time string (e.g. "9:30 pm", "8 am", "14:00") into hour and minute.
 */
const parseTime = (timeStr) => {
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3] ? match[3].toLowerCase() : null;

  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  return { hour, minute };
};

// ---------------------------------------------------------------------------
export default function VoiceControl({ devices: propDevices, boards: propBoards, presets: propPresets, applyPreset, onToast }) {
  const [listening, setListening] = useState(false);

  // Mutable refs so WS callbacks always see latest data without re-subscribing
  const devicesRef = useRef(propDevices ?? []);
  const boardsRef = useRef(propBoards ?? []);
  const presetsRef = useRef(propPresets ?? []);
  const recognitionRef = useRef(null);

  // Sync refs when parent state changes
  useEffect(() => { devicesRef.current = propDevices ?? []; }, [propDevices]);
  useEffect(() => { boardsRef.current = propBoards ?? []; }, [propBoards]);
  useEffect(() => { presetsRef.current = propPresets ?? []; }, [propPresets]);

  // Fetch missing prop data on mount if self-contained
  useEffect(() => {
    const fetchMissingData = async () => {
      if (!propDevices || propDevices.length === 0) {
        const { data: devs } = await supabase
          .from('devices')
          .select('id, name, is_on, board_id')
          .order('relay_index');
        if (devs) {
          devicesRef.current = devs;
        }
      }
      if (!propBoards || propBoards.length === 0) {
        const { data: bds } = await supabase
          .from('boards')
          .select('id, name');
        if (bds) {
          boardsRef.current = bds;
        }
      }
      if (!propPresets || propPresets.length === 0) {
        const { data: prs } = await supabase
          .from('presets')
          .select('id, name, actions');
        if (prs) {
          presetsRef.current = prs;
        }
      }
    };
    fetchMissingData();
  }, [propDevices, propBoards, propPresets]);

  // Speak confirmation using high-quality male voices
  const speak = useCallback((textToSpeak) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // 1. Cancel any ongoing speech immediately to prevent overlapping/queueing
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // 2. Get available voices
    let voices = window.speechSynthesis.getVoices();

    const findBestVoice = () => {
      // Filter for English voices
      const englishVoices = voices.filter(v => v.lang.startsWith('en'));
      if (englishVoices.length === 0) return voices[0]; // Fallback to system default

      // Target Premium/Natural/Google voices first (Regardless of gender, for ultimate quality)
      const premiumVoice = englishVoices.find(v =>
        v.name.toLowerCase().includes('natural') ||
        v.name.toLowerCase().includes('online') ||
        v.name.toLowerCase().includes('google') ||
        v.name.toLowerCase().includes('premium')
      );

      if (premiumVoice) return premiumVoice;

      // Secondary choice: Enhanced Apple voices if on iOS/Mac (e.g., "Daniel (Enhanced)")
      const enhancedVoice = englishVoices.find(v => v.name.toLowerCase().includes('enhanced'));
      if (enhancedVoice) return enhancedVoice;

      // Fallback to the first available English voice
      return englishVoices[0];
    };

    const selectedVoice = findBestVoice();
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // 3. Perfect Tone Sweet Spots (Do not exceed 0.5 - 2.0 range)
    // If the chosen voice is male, a pitch of 0.9 or 1.0 is best. 
    // Lowering pitch to 0.6 on female or standard voices makes them sound like slowed-down robots.

    const voiceName = selectedVoice ? selectedVoice.name.toLowerCase() : '';
    const isMale = ['male', 'david', 'daniel', 'google uk english male'].some(k => voiceName.includes(k));

    if (isMale) {
      utterance.pitch = 0.9; // Smooth, deeper male tone without sounding glitchy
      utterance.rate = 0.95; // Just a tiny bit slower than normal for ultimate clarity
    } else {
      utterance.pitch = 0.75; // Perfect natural pitch for high-quality female/neutral voices
      utterance.rate = 0.90;  // Normal human conversational speed
    }

    window.speechSynthesis.speak(utterance);
  }, []);

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

  // Execute structured action returned by the LLM
  const executeLLMAction = useCallback(async (result, safeToast) => {
    const { actionType, deviceId, isOn, deviceName, presetId, presetName, triggerAt, time, days } = result;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    switch (actionType) {
      case 'TOGGLE_DEVICE': {
        await supabase.from('devices')
          .update({ is_on: isOn, last_changed: new Date().toISOString() })
          .eq('id', deviceId);
        
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          device_id: deviceId,
          device_name: deviceName,
          action: isOn ? 'turned ON' : 'turned OFF',
          triggered_by: 'Voice Command (AI)'
        });
        
        const feedbackMsg = `${deviceName} turned ${isOn ? 'on' : 'off'}`;
        safeToast(feedbackMsg);
        speak(feedbackMsg);
        break;
      }

      case 'TOGGLE_ALL': {
        const latestDevices = await getLatestDevices();
        const devicesToUpdate = latestDevices.filter(d => d.is_on !== isOn);
        if (devicesToUpdate.length > 0) {
          await supabase.from('devices')
            .update({ is_on: isOn, last_changed: new Date().toISOString() })
            .eq('user_id', user.id);
          
          await Promise.all(devicesToUpdate.map(async (d) => {
            await supabase.from('activity_logs').insert({
              user_id: user.id,
              device_id: d.id,
              device_name: d.name,
              action: isOn ? 'turned ON' : 'turned OFF',
              triggered_by: 'Voice Command (AI)'
            });
          }));
        }
        const feedbackMsg = `All devices turned ${isOn ? 'on' : 'off'}`;
        safeToast(feedbackMsg);
        speak(feedbackMsg);
        break;
      }

      case 'APPLY_PRESET': {
        const preset = presetsRef.current.find(p => p.id === presetId);
        if (preset) {
          await applyPreset(preset, result.deactivate || false);
          const feedbackMsg = `${result.deactivate ? 'Deactivated' : 'Activated'} preset: ${presetName}`;
          safeToast(feedbackMsg);
          speak(feedbackMsg);
        }
        break;
      }

      case 'CREATE_ALARM': {
        const latestDevices = await getLatestDevices();
        const device = latestDevices.find(d => d.id === deviceId);
        if (device) {
          await supabase.from('alarms').insert({
            user_id: user.id,
            device_id: deviceId,
            action: isOn,
            trigger_at: triggerAt,
            fired: false
          });
          const displayTime = new Date(triggerAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const feedbackMsg = `Alarm set for ${device.name} to turn ${isOn ? 'on' : 'off'} at ${displayTime}`;
          safeToast(feedbackMsg);
          speak(feedbackMsg);
        }
        break;
      }

      case 'CREATE_SCHEDULE': {
        const latestDevices = await getLatestDevices();
        const device = latestDevices.find(d => d.id === deviceId);
        if (device) {
          await supabase.from('schedules').insert({
            user_id: user.id,
            device_id: deviceId,
            action: isOn,
            time: time,
            days: days,
            enabled: true
          });
          const feedbackMsg = `Schedule created for ${device.name}`;
          safeToast(feedbackMsg);
          speak(feedbackMsg);
        }
        break;
      }

      case 'DELETE_ALL_ALARMS': {
        await supabase.from('alarms').delete().eq('user_id', user.id);
        const feedbackMsg = 'All alarms cleared';
        safeToast(feedbackMsg);
        speak(feedbackMsg);
        break;
      }

      case 'DELETE_ALL_SCHEDULES': {
        await supabase.from('schedules').delete().eq('user_id', user.id);
        const feedbackMsg = 'All schedules cleared';
        safeToast(feedbackMsg);
        speak(feedbackMsg);
        break;
      }

      default:
        break;
    }
  }, [getLatestDevices, speak, applyPreset]);

  // Main command processor
  const processCommand = useCallback(async (transcript) => {
    const text = normalizeText(transcript);
    const commandDevices = await getLatestDevices();
    const commandBoards = boardsRef.current;
    const safeToast = onToast || ((msg) => console.log(msg));

    safeToast(`Heard: "${transcript}"`);

    if (commandDevices.length === 0) {
      safeToast('No devices found. Please add a board first.');
      speak('No devices found. Please add a board first.');
      return;
    }

    // Try OpenRouter AI Voice Command route first
    try {
      const response = await fetch('/api/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript,
          devices: commandDevices,
          presets: presetsRef.current,
          currentTime: new Date().toISOString()
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result && result.actionType && result.actionType !== 'UNKNOWN') {
          await executeLLMAction(result, safeToast);
          return;
        } else if (result && result.actionType === 'UNKNOWN') {
          console.log('OpenRouter returned UNKNOWN action:', result.message);
          const clarifyMsg = result.message || 'Could not understand voice command.';
          safeToast(clarifyMsg);
          speak(clarifyMsg);
          return;
        }
      } else {
        const errResult = await response.json().catch(() => ({}));
        console.warn(`Voice Command API failed with status ${response.status}:`, errResult.message || 'Unknown error');
      }
    } catch (e) {
      console.warn('AI voice command failed, falling back to local parser:', e);
    }

    // 1. All on / all off
    const allOnPhrases = ['turn on all', 'all on', 'everything on', 'all lights on', 'all devices on'];
    const allOffPhrases = ['turn off all', 'all off', 'everything off', 'all lights off', 'all devices off'];

    if (allOnPhrases.some(p => text.includes(p))) {
      await Promise.all(commandDevices.map(d =>
        supabase.from('devices').update({ is_on: true, last_changed: new Date().toISOString() }).eq('id', d.id)
      ));
      safeToast('All devices turned ON');
      speak('All devices turned on');
      return;
    }
    if (allOffPhrases.some(p => text.includes(p))) {
      await Promise.all(commandDevices.map(d =>
        supabase.from('devices').update({ is_on: false, last_changed: new Date().toISOString() }).eq('id', d.id)
      ));
      safeToast('All devices turned OFF');
      speak('All devices turned off');
      return;
    }

    // 2. Clear/Delete All Alarms or Schedules
    if (text === 'delete all alarms' || text === 'clear all alarms') {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('alarms').delete().eq('user_id', user.id);
        safeToast('All alarms deleted');
        speak('All alarms deleted');
      }
      return;
    }
    if (text === 'delete all schedules' || text === 'clear all schedules') {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('schedules').delete().eq('user_id', user.id);
        safeToast('All schedules deleted');
        speak('All schedules deleted');
      }
      return;
    }

    // 3. Create Alarm: e.g. "set alarm for fan 2 to turn off at 9:30 pm"
    const alarmCreateMatch = text.match(/^(?:set|create)\s+alarm\s+for\s+(.+?)\s+(?:to\s+turn\s+(on|off)\s+)?at\s+(.+)$/);
    if (alarmCreateMatch) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const deviceQuery = normalizeText(alarmCreateMatch[1]);
      const actionWord = alarmCreateMatch[2]; // "on" or "off"
      const timeStr = alarmCreateMatch[3];

      const matchedDevice = findBestDevice(deviceQuery, commandDevices);
      if (!matchedDevice) {
        safeToast(`Device "${deviceQuery}" not found for alarm`);
        speak(`Device ${deviceQuery} not found`);
        return;
      }

      const parsedTime = parseTime(timeStr);
      if (!parsedTime) {
        safeToast(`Could not parse time "${timeStr}"`);
        speak(`Could not parse time ${timeStr}`);
        return;
      }

      const now = new Date();
      const alarmDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsedTime.hour, parsedTime.minute, 0);
      if (alarmDate <= now) {
        alarmDate.setDate(alarmDate.getDate() + 1); // Set for tomorrow
      }

      const isAlarmOn = actionWord ? actionWord === 'on' : true;
      const { error } = await supabase.from('alarms').insert({
        user_id: user.id,
        device_id: matchedDevice.id,
        action: isAlarmOn,
        trigger_at: alarmDate.toISOString(),
        fired: false
      });

      if (error) {
        safeToast(error.message);
      } else {
        const timeDisplay = alarmDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const dateDisplay = alarmDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        safeToast(`Alarm set for ${matchedDevice.name} on ${dateDisplay} at ${timeDisplay}`);
        speak(`Alarm set for ${matchedDevice.name} on ${dateDisplay} at ${timeDisplay}`);
      }
      return;
    }

    // 4. Create Schedule: e.g. "set schedule for fan 2 to turn off at 8:00 am on weekdays"
    const scheduleCreateMatch = text.match(/^(?:set|create)\s+schedule\s+for\s+(.+?)\s+(?:to\s+turn\s+(on|off)\s+)?at\s+(.+ ?)(?:\s+on\s+(.+))?$/);
    if (scheduleCreateMatch) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const deviceQuery = normalizeText(scheduleCreateMatch[1]);
      const actionWord = scheduleCreateMatch[2]; // "on" or "off"
      const timeStr = scheduleCreateMatch[3];
      const daysStr = scheduleCreateMatch[4] ? normalizeText(scheduleCreateMatch[4]) : 'everyday';

      const matchedDevice = findBestDevice(deviceQuery, commandDevices);
      if (!matchedDevice) {
        safeToast(`Device "${deviceQuery}" not found for schedule`);
        speak(`Device ${deviceQuery} not found`);
        return;
      }

      const parsedTime = parseTime(timeStr);
      if (!parsedTime) {
        safeToast(`Could not parse time "${timeStr}"`);
        speak(`Could not parse time ${timeStr}`);
        return;
      }

      // Parse days
      let days = [0, 1, 2, 3, 4, 5, 6]; // default everyday
      if (daysStr.includes('weekday') || daysStr.includes('work day') || daysStr.includes('working day')) {
        days = [1, 2, 3, 4, 5];
      } else if (daysStr.includes('weekend')) {
        days = [0, 6];
      } else if (daysStr !== 'everyday' && daysStr !== 'every day' && daysStr !== 'all days') {
        const daysMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        const matchedDays = [];
        for (const [dayName, dayCode] of Object.entries(daysMap)) {
          if (daysStr.includes(dayName) || daysStr.includes(dayName.slice(0, 3))) {
            matchedDays.push(dayCode);
          }
        }
        if (matchedDays.length > 0) {
          days = matchedDays.sort();
        }
      }

      const isScheduleOn = actionWord ? actionWord === 'on' : true;
      const formattedTime = `${String(parsedTime.hour).padStart(2, '0')}:${String(parsedTime.minute).padStart(2, '0')}`;
      
      const { error } = await supabase.from('schedules').insert({
        user_id: user.id,
        device_id: matchedDevice.id,
        action: isScheduleOn,
        time: formattedTime,
        days: days,
        enabled: true
      });

      if (error) {
        safeToast(error.message);
      } else {
        const timeDisplay = `${parsedTime.hour % 12 || 12}:${String(parsedTime.minute).padStart(2, '0')} ${parsedTime.hour >= 12 ? 'PM' : 'AM'}`;
        const daysDisplay = days.length === 7 ? 'every day' : days.length === 5 && days.includes(1) && !days.includes(0) ? 'weekdays' : 'selected days';
        safeToast(`Schedule set for ${matchedDevice.name} at ${timeDisplay} on ${daysDisplay}`);
        speak(`Schedule set for ${matchedDevice.name} at ${timeDisplay} on ${daysDisplay}`);
      }
      return;
    }

    // 5. Delete single alarm/schedule for device
    const deleteMatch = text.match(/^(?:delete|cancel|remove)\s+(alarm|schedule)\s+for\s+(.+)$/);
    if (deleteMatch) {
      const type = deleteMatch[1]; // "alarm" or "schedule"
      const deviceQuery = normalizeText(deleteMatch[2]);

      const matchedDevice = findBestDevice(deviceQuery, commandDevices);
      if (!matchedDevice) {
        safeToast(`Device "${deviceQuery}" not found`);
        speak(`Device ${deviceQuery} not found`);
        return;
      }

      if (type === 'alarm') {
        const { error } = await supabase.from('alarms').delete().eq('device_id', matchedDevice.id);
        if (error) safeToast(error.message);
        else {
          safeToast(`Alarms deleted for ${matchedDevice.name}`);
          speak(`Alarms deleted for ${matchedDevice.name}`);
        }
      } else {
        const { error } = await supabase.from('schedules').delete().eq('device_id', matchedDevice.id);
        if (error) safeToast(error.message);
        else {
          safeToast(`Schedules deleted for ${matchedDevice.name}`);
          speak(`Schedules deleted for ${matchedDevice.name}`);
        }
      }
      return;
    }

    // 6. Enable/disable schedules
    const scheduleToggleMatch = text.match(/^(enable|disable|activate|deactivate|deactive)\s+schedule\s+for\s+(.+)$/);
    if (scheduleToggleMatch) {
      const action = scheduleToggleMatch[1]; // "enable", "disable", "deactivate", etc.
      const deviceQuery = normalizeText(scheduleToggleMatch[2]);

      const matchedDevice = findBestDevice(deviceQuery, commandDevices);
      if (!matchedDevice) {
        safeToast(`Device "${deviceQuery}" not found`);
        speak(`Device ${deviceQuery} not found`);
        return;
      }

      const enableVal = (action === 'enable' || action === 'activate');
      const { error } = await supabase.from('schedules').update({ enabled: enableVal }).eq('device_id', matchedDevice.id);
      if (error) safeToast(error.message);
      else {
        safeToast(`Schedules ${enableVal ? 'enabled' : 'disabled'} for ${matchedDevice.name}`);
        speak(`Schedules ${enableVal ? 'enabled' : 'disabled'} for ${matchedDevice.name}`);
      }
      return;
    }

    // 7. Parse action (activate/deactivate) and target for presets/boards/devices
    let isDeactivate = false;
    let isActivate = false;
    let target = '';

    const deactPrefixes = [
      'deactivate preset ', 'deactivate ', 'deactive preset ', 'deactive ',
      'turn off preset ', 'turn off ', 'switch off ', 'put off ',
      'disable preset ', 'disable ', 'stop '
    ];

    const actPrefixes = [
      'activate preset ', 'activate ', 'turn on preset ', 'turn on ',
      'switch on ', 'put on ', 'enable preset ', 'enable ', 'start '
    ];

    for (const prefix of deactPrefixes) {
      if (text.startsWith(prefix)) {
        isDeactivate = true;
        target = text.substring(prefix.length).trim();
        break;
      }
    }

    if (!isDeactivate) {
      for (const prefix of actPrefixes) {
        if (text.startsWith(prefix)) {
          isActivate = true;
          target = text.substring(prefix.length).trim();
          break;
        }
      }
    }

    const isOn = isActivate ? true : (isDeactivate ? false : null);

    // If an action is specified (either activate or deactivate)
    if (isOn !== null) {
      // A. Try preset matching first
      const matchedPreset = presetsRef.current.find(p =>
        normalizeText(p.name).includes(target) || target.includes(normalizeText(p.name))
      );

      if (matchedPreset) {
        if (applyPreset) {
          await applyPreset(matchedPreset, isDeactivate);
        } else {
          await Promise.all(
            matchedPreset.actions.map(action => {
              const targetState = isDeactivate ? !action.is_on : action.is_on;
              return supabase.from('devices')
                .update({ is_on: targetState, last_changed: new Date().toISOString() })
                .eq('id', action.device_id);
            })
          );
        }
        safeToast(`${isDeactivate ? 'Deactivated' : 'Activated'} preset: ${matchedPreset.name}`);
        speak(`${isDeactivate ? 'Deactivated' : 'Activated'} preset ${matchedPreset.name}`);
        return;
      }

      // Check DB presets if not found locally
      try {
        const { data: dbPresets } = await supabase
          .from('presets')
          .select('id, name, actions')
          .ilike('name', `%${target}%`)
          .limit(1);

        if (dbPresets?.length) {
          const preset = dbPresets[0];
          if (applyPreset) {
            await applyPreset(preset, isDeactivate);
          } else {
            await Promise.all(
              preset.actions.map(action => {
                const targetState = isDeactivate ? !action.is_on : action.is_on;
                return supabase.from('devices')
                  .update({ is_on: targetState, last_changed: new Date().toISOString() })
                  .eq('id', action.device_id);
              })
            );
          }
          safeToast(`${isDeactivate ? 'Deactivated' : 'Activated'} preset: ${preset.name}`);
          speak(`${isDeactivate ? 'Deactivated' : 'Activated'} preset ${preset.name}`);
          return;
        }
      } catch (err) {
        console.error('Error fetching preset from DB:', err);
      }

      // B. Try board name matching next
      let matchedBoard = null;
      let bestBoardScore = -1;
      for (const board of commandBoards) {
        const score = fuzzyScore(target, normalizeText(board.name));
        if (score > bestBoardScore) { bestBoardScore = score; matchedBoard = board; }
      }

      if (bestBoardScore >= 0.6 && matchedBoard) {
        const boardDevices = commandDevices.filter(d => d.board_id === matchedBoard.id);
        if (!boardDevices.length) {
          safeToast(`No devices found on board "${matchedBoard.name}"`);
          speak(`No devices found on board ${matchedBoard.name}`);
          return;
        }
        await Promise.all(boardDevices.map(d =>
          supabase.from('devices').update({ is_on: isOn, last_changed: new Date().toISOString() }).eq('id', d.id)
        ));
        safeToast(`All devices on "${matchedBoard.name}" turned ${isOn ? 'ON' : 'OFF'}`);
        speak(`All devices on ${matchedBoard.name} turned ${isOn ? 'on' : 'off'}`);
        return;
      }

      // C. Try device name matching last
      const matchedDevice = findBestDevice(target, commandDevices);
      if (matchedDevice) {
        await supabase.from('devices')
          .update({ is_on: isOn, last_changed: new Date().toISOString() })
          .eq('id', matchedDevice.id);
        safeToast(`${matchedDevice.name} turned ${isOn ? 'ON' : 'OFF'}`);
        speak(`${matchedDevice.name} turned ${isOn ? 'on' : 'off'}`);
        return;
      }

      // Not found
      safeToast(`Could not find preset, board, or device matching "${target}"`);
      speak(`Could not find any match for ${target}`);
      return;
    }

    // 8. Fallback: If no activation/deactivation prefix, check direct preset name match (assumes activation)
    const matchedPresetDirect = presetsRef.current.find(p => 
      normalizeText(p.name) === text || fuzzyScore(text, normalizeText(p.name)) >= 0.8
    );
    if (matchedPresetDirect) {
      if (applyPreset) {
        await applyPreset(matchedPresetDirect);
      } else {
        await Promise.all(
          matchedPresetDirect.actions.map(action =>
            supabase.from('devices')
              .update({ is_on: action.is_on, last_changed: new Date().toISOString() })
              .eq('id', action.device_id)
          )
        );
      }
      safeToast(`Activated preset: ${matchedPresetDirect.name}`);
      speak(`Activated preset ${matchedPresetDirect.name}`);
      return;
    }

    safeToast('Command not recognised. Try: "turn on fan 2", "turn off living room", "activate party mode", or "all off"');
    speak('Command not recognized');
  }, [getLatestDevices, onToast, speak, applyPreset]);

  // Speech Recognition
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
    recognition.lang = 'en-US';
    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (event) => {
      setListening(false);
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

  const toggleListening = () => {
    if (listening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
      }
      setListening(false);
    } else {
      startListening();
    }
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
        id="voice-control-mic-btn"
        onClick={toggleListening}
        className={`fixed bottom-7 right-7 max-md:bottom-20 max-md:right-6 w-14 h-14 rounded-full border-none bg-gradient-to-tr from-accent to-[#e2cc89] text-[#0a0800] cursor-pointer z-[200] shadow-[0_6px_24px_var(--accent-glow)] shadow-gold-glow hover:scale-[1.08] active:scale-100 transition-all duration-300 flex items-center justify-center select-none group`}
        title="Voice Control"
      >
        {listening ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Listening Ripple Waves */}
            <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping [animation-duration:1.2s]" />
            <span className="absolute inset-[-6px] rounded-full bg-accent/25 animate-ping [animation-duration:1.6s]" />
            <span className="absolute inset-[-12px] rounded-full bg-accent/10 animate-ping [animation-duration:2s]" />

            {/* Cross Icon */}
            <X size={20} className="stroke-[2.5px] relative z-10 animate-pulse text-[#0a0800]" />
          </div>
        ) : (
          <Mic size={20} className="stroke-[2.5px] group-hover:scale-110 transition-transform text-[#0a0800]" />
        )}
      </button>
    </>
  );
}
