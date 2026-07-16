'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Mic, X, LayoutGrid, List } from 'lucide-react';
import { speak } from '@/utils/voice';

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
const getLocalISOString = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
  const offsetMinutes = (new Date()).getTimezoneOffset();
  const absOffset = Math.abs(offsetMinutes);
  const sign = offsetMinutes > 0 ? "-" : "+";
  const pad = (n) => String(n).padStart(2, "0");
  const offsetStr = `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
  return `${localISOTime}${offsetStr}`;
};

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
          // ── Guard 1: Reject past timestamps immediately ──────────────────
          const triggerDate = new Date(triggerAt);
          if (isNaN(triggerDate.getTime()) || triggerDate.getTime() <= Date.now()) {
            const pastMsg = `Cannot set an alarm in the past. Please provide a future date and time.`;
            safeToast(`⚠ ${pastMsg}`);
            speak(pastMsg);
            break;
          }

          // ── Guard 2: Deduplication — unfired alarm within 1-minute window ─
          const triggerMs   = triggerDate.getTime();
          const windowMs    = 60 * 1000;
          const actionBool  = isOn === true || isOn === 'true';
          const { data: existingAlarms } = await supabase
            .from('alarms')
            .select('id, trigger_at, action')
            .eq('device_id', deviceId)
            .eq('user_id', user.id)
            .eq('fired', false);

          const duplicate = (existingAlarms || []).find(a => {
            const diff = Math.abs(new Date(a.trigger_at).getTime() - triggerMs);
            return diff <= windowMs && !!a.action === actionBool;
          });

          if (duplicate) {
            const displayTime = new Date(duplicate.trigger_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const displayDate = new Date(duplicate.trigger_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const msg = `${device.name} already has an alarm at ${displayTime} on ${displayDate}. Duplicate not created.`;
            safeToast(msg);
            speak(`Duplicate alarm skipped for ${device.name}`);
          } else {
            const { error } = await supabase.from('alarms').insert({
              user_id: user.id,
              device_id: deviceId,
              action: actionBool,
              trigger_at: triggerAt,
              fired: false
            });
            if (error) {
              const msg = `Could not create alarm for ${device.name}. Please try again.`;
              safeToast(`⚠ ${msg}`);
              speak(msg);
            } else {
              const displayTime = triggerDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              const displayDate = triggerDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const feedbackMsg = `✅ Alarm set for ${device.name} to turn ${actionBool ? 'on' : 'off'} at ${displayTime} on ${displayDate}`;
              safeToast(feedbackMsg);
              speak(`Alarm set for ${device.name} at ${displayTime}`);
            }
          }
        }
        break;
      }

      case 'CREATE_SCHEDULE': {
        const latestDevices = await getLatestDevices();
        const device = latestDevices.find(d => d.id === deviceId);
        if (device) {
          // Normalise: take first 5 chars of time (HH:MM) to handle DB storing HH:MM:SS
          const normTime   = (time || '').trim().slice(0, 5);
          const actionBool = isOn === true || isOn === 'true';

          // Deduplication: same device + same HH:MM + same action — filter by user_id too
          const { data: existingSchedules } = await supabase
            .from('schedules')
            .select('id, time, action')
            .eq('device_id', deviceId)
            .eq('user_id', user.id);

          const duplicate = (existingSchedules || []).find(s =>
            (s.time || '').slice(0, 5) === normTime && !!s.action === actionBool
          );

          if (duplicate) {
            const msg = `${device.name} already has a schedule to turn ${actionBool ? 'on' : 'off'} at ${normTime}. Duplicate not created.`;
            safeToast(msg);
            speak(`Duplicate schedule skipped for ${device.name}`);
          } else {
            const { error } = await supabase.from('schedules').insert({
              user_id: user.id,
              device_id: deviceId,
              action: actionBool,
              time: normTime,
              days: days,
              enabled: true
            });
            if (error) {
              const msg = `Could not create schedule for ${device.name}. Please try again.`;
              safeToast(`⚠ ${msg}`);
              speak(msg);
            } else {
              const [hh, mm] = normTime.split(':').map(Number);
              const h12 = hh % 12 || 12;
              const ampm = hh >= 12 ? 'PM' : 'AM';
              const timeDisplay = `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
              const feedbackMsg = `✅ Schedule created for ${device.name} at ${timeDisplay}`;
              safeToast(feedbackMsg);
              speak(`Schedule created for ${device.name} at ${timeDisplay}`);
            }
          }
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
  }, [getLatestDevices, applyPreset]);

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
          currentTime: getLocalISOString()
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

    // Note: Local hardcoded parsing for "All on / All off" has been removed.
    // We now rely entirely on the AI API for turning devices on and off.

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

      // ── Guard 1: Reject alarms in the past ─────────────────────────────
      if (alarmDate.getTime() <= Date.now()) {
        const pastMsg = `Cannot set an alarm in the past. "${timeStr}" has already passed. Please say a future time or date.`;
        safeToast(`⚠ ${pastMsg}`);
        speak(`Cannot set alarm in the past`);
        return;
      }

      const isAlarmOn = actionWord ? actionWord === 'on' : true;

      // ── Guard 2: Deduplication — same device + 1-min window + same action ─
      const { data: existingAlarms } = await supabase
        .from('alarms')
        .select('id, trigger_at, action')
        .eq('device_id', matchedDevice.id)
        .eq('user_id', user.id)
        .eq('fired', false);

      const windowMs = 60 * 1000;
      const alarmTs = alarmDate.getTime();
      const duplicate = (existingAlarms || []).find(a => {
        const diff = Math.abs(new Date(a.trigger_at).getTime() - alarmTs);
        return diff <= windowMs && !!a.action === isAlarmOn;
      });

      if (duplicate) {
        const existingTime = new Date(duplicate.trigger_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const existingDate = new Date(duplicate.trigger_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const dupMsg = `${matchedDevice.name} already has an alarm at ${existingTime} on ${existingDate}. Only one alarm per device at a time is allowed.`;
        safeToast(dupMsg);
        speak(`Duplicate alarm already exists for ${matchedDevice.name}`);
        return;
      }

      const { error } = await supabase.from('alarms').insert({
        user_id: user.id,
        device_id: matchedDevice.id,
        action: isAlarmOn,
        trigger_at: alarmDate.toISOString(),
        fired: false
      });

      if (error) {
        const errMsg = `Couldn't set alarm for ${matchedDevice.name}. Please try again.`;
        safeToast(`⚠ ${errMsg}`);
        speak(errMsg);
      } else {
        const timeDisplay = alarmDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const dateDisplay = alarmDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        safeToast(`✅ Alarm set for ${matchedDevice.name} on ${dateDisplay} at ${timeDisplay}`);
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

      // Dedup: normalize time to HH:MM (5 chars) — DB may store HH:MM:SS
      // Cast action to boolean so type mismatches don't let duplicates through
      const { data: existingSchedules } = await supabase
        .from('schedules')
        .select('id, time, action')
        .eq('device_id', matchedDevice.id)
        .eq('user_id', user.id);

      const dupSched = (existingSchedules || []).find(s =>
        (s.time || '').slice(0, 5) === formattedTime && !!s.action === isScheduleOn
      );

      if (dupSched) {
        const timeDisplay = `${parsedTime.hour % 12 || 12}:${String(parsedTime.minute).padStart(2, '0')} ${parsedTime.hour >= 12 ? 'PM' : 'AM'}`;
        const dupMsg = `${matchedDevice.name} already has a schedule to turn ${isScheduleOn ? 'on' : 'off'} at ${timeDisplay}. Duplicate not created.`;
        safeToast(dupMsg);
        speak(`Duplicate schedule already exists for ${matchedDevice.name}`);
        return;
      }

      const { error } = await supabase.from('schedules').insert({
        user_id: user.id,
        device_id: matchedDevice.id,
        action: isScheduleOn,
        time: formattedTime,
        days: days,
        enabled: true
      });

      if (error) {
        const errMsg = `Couldn't create schedule for ${matchedDevice.name}. Please try again.`;
        safeToast(`⚠ ${errMsg}`);
        speak(errMsg);
      } else {
        const timeDisplay = `${parsedTime.hour % 12 || 12}:${String(parsedTime.minute).padStart(2, '0')} ${parsedTime.hour >= 12 ? 'PM' : 'AM'}`;
        const daysDisplay = days.length === 7 ? 'every day' : days.length === 5 && days.includes(1) && !days.includes(0) ? 'weekdays' : 'selected days';
        safeToast(`✅ Schedule set for ${matchedDevice.name} at ${timeDisplay} on ${daysDisplay}`);
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
        if (error) safeToast(`⚠ Could not delete alarms for ${matchedDevice.name}. Please try again.`);
        else {
          safeToast(`✅ Alarms deleted for ${matchedDevice.name}`);
          speak(`Alarms deleted for ${matchedDevice.name}`);
        }
      } else {
        const { error } = await supabase.from('schedules').delete().eq('device_id', matchedDevice.id);
        if (error) safeToast(`⚠ Could not delete schedules for ${matchedDevice.name}. Please try again.`);
        else {
          safeToast(`✅ Schedules deleted for ${matchedDevice.name}`);
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

    // Note: Local hardcoded parsing for turning specific devices/boards/presets on and off has been removed.
    // We now rely entirely on the AI API for these actions.

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

  const toggleListening = async () => {
    if (listening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
      }
      setListening(false);
      recognitionRef.current = null;
    } else {
      const hasIntroduced = localStorage.getItem('auraIntroPlayed');
      if (!hasIntroduced) {
        localStorage.setItem('auraIntroPlayed', 'true');
        onToast('Aura is speaking...');
        await speak("Hello, I am Aura, your Electric Warriors AI assistant. How can I help you?");
      }
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
        className={`fixed bottom-7 right-7 max-md:bottom-20 max-md:right-6 w-14 h-14 rounded-full border-none bg-gradient-to-tr from-accent to-[#e2cc89] text-[var(--btn-text)] cursor-pointer z-[200] shadow-[0_6px_24px_var(--accent-glow)] shadow-gold-glow hover:scale-[1.08] active:scale-100 transition-all duration-300 flex items-center justify-center select-none group`}
        title="Voice Control"
      >
        {listening ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Listening Ripple Waves */}
            <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping [animation-duration:1.2s]" />
            <span className="absolute inset-[-6px] rounded-full bg-accent/25 animate-ping [animation-duration:1.6s]" />
            <span className="absolute inset-[-12px] rounded-full bg-accent/10 animate-ping [animation-duration:2s]" />

            {/* Cross Icon */}
            <X size={20} className="stroke-[2.5px] relative z-10 animate-pulse text-[var(--btn-text)]" />
          </div>
        ) : (
          <Mic size={20} className="stroke-[2.5px] group-hover:scale-110 transition-transform text-[var(--btn-text)]" />
        )}
      </button>
    </>
  );
}
