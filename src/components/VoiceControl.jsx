'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Mic, X, LayoutGrid, List } from 'lucide-react';
import { speak } from '@/utils/voice';
import { useVoiceAgentVisible } from '@/lib/agentVisibility';
import { discoverLocalNode, setLocalDeviceState, triggerLocalAll } from '@/lib/localApi';

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

/**
 * Resolve a device conservatively. Commands must name a unique full device/room
 * alias; token overlap alone is not enough to actuate hardware.
 */
const findBestDevice = (query, list) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  const scored = (list || []).map((device) => {
    const aliases = [
      device.name,
      device.board_name ? `${device.board_name} ${device.name}` : '',
      device.roomName ? `${device.roomName} ${device.name}` : '',
      device.node_id ? `${device.node_id} ${device.name}` : '',
    ].filter(Boolean).map(normalizeText);

    let score = 0;
    for (const alias of aliases) {
      if (!alias) continue;
      if (alias === normalizedQuery) score = Math.max(score, 100 + alias.split(' ').length);
      else if (` ${normalizedQuery} `.includes(` ${alias} `)) {
        score = Math.max(score, 80 + alias.split(' ').length);
      } else if (` ${alias} `.includes(` ${normalizedQuery} `)) {
        score = Math.max(score, 40 + normalizedQuery.split(' ').length);
      }
    }
    return { device, score };
  }).filter((item) => item.score > 0);

  if (!scored.length) return null;
  const bestScore = Math.max(...scored.map((item) => item.score));
  const best = scored.filter((item) => item.score === bestScore);
  return best.length === 1 ? best[0].device : null;
};

/**
 * Parse time string (e.g. "9:30 pm", "8 am", "14:00") into hour and minute.
 */
const parseTime = (timeStr) => {
  const match = String(timeStr || '').match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const ampm = match[3] ? match[3].toLowerCase() : null;

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return { hour, minute };
};

// ---------------------------------------------------------------------------
export default function VoiceControl({ devices: propDevices, boards: propBoards, presets: propPresets, applyPreset, controlDevice, controlAll, onToast }) {
  const router = useRouter();
  const [selectedLang, setSelectedLang] = useState('en-US');
  const [listening, setListening] = useState(false);
  const [agentState, setAgentState] = useState('idle');
  const agentVisible = useVoiceAgentVisible();

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
      if (!propDevices || propDevices.length === 0) {
        const { data: devs, error } = await supabase
          .from('devices')
          .select('id, name, is_on, board_id, relay_index, boards(name, board_identifier)')
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
          .select('id, name, board_identifier');
        if (!error && bds) {
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
    const { data, error } = await supabase
      .from('devices')
      .select('id, name, is_on, board_id, relay_index, boards(name, board_identifier)')
      .order('relay_index');
    if (error) return [];
    const enriched = enrichDevices(data || []);
    devicesRef.current = enriched;
    return enriched;
  }, [enrichDevices]);

  // Execute structured action returned by the LLM
  const executeLLMAction = useCallback(async (result, safeToast) => {
    const { actionType, deviceId, isOn, deviceName, presetId, presetName, triggerAt, time, days, message, language } = result;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const provideFeedback = (fallbackMsg) => {
      const msg = message || fallbackMsg;
      safeToast(msg);
      speak(msg, language || 'en-US');
    };

    switch (actionType) {
      case 'TOGGLE_DEVICE': {
        const device = (await getLatestDevices()).find((item) => item.id === deviceId);
        if (!device) {
          provideFeedback('That device is no longer available. Please try again.');
          break;
        }

        if (controlDevice) {
          const commandResult = await controlDevice(device, isOn, 'Voice Command (AI)');
          if (!commandResult?.success) {
            provideFeedback(`Could not turn ${device.name} ${isOn ? 'on' : 'off'}. Please try again.`);
            break;
          }
          provideFeedback(`${device.name} turned ${isOn ? 'on' : 'off'}`);
          break;
        }

        // Schedule and Alarm pages mount VoiceControl without dashboard callbacks.
        // Try local hardware first; the cloud row update remains the durable desired state.
        let localDispatched = false;
        if (Number.isInteger(Number(device.relay_index))) {
          try {
            await discoverLocalNode(1500);
            await setLocalDeviceState(Number(device.relay_index), isOn, device.node_id || null);
            localDispatched = true;
          } catch {
            // Cloud state below is the fallback when this browser cannot reach the ESP32.
          }
        }

        const { error: updateError } = await supabase.from('devices')
          .update({ is_on: isOn, last_changed: new Date().toISOString() })
          .eq('id', device.id)
          .eq('user_id', user.id);
        if (updateError && !localDispatched) {
          provideFeedback(`Could not turn ${device.name} ${isOn ? 'on' : 'off'}. Please try again.`);
          break;
        }
        if (!updateError) {
          const { error: logError } = await supabase.from('activity_logs').insert({
            user_id: user.id,
            device_id: device.id,
            device_name: device.name,
            action: `turned ${isOn ? 'ON' : 'OFF'}`,
            triggered_by: localDispatched ? 'Voice Command (AI) via ESP32 Local Mesh' : 'Voice Command (AI)',
          });
          if (logError) console.warn('Voice activity log insert failed:', logError);
        }
        provideFeedback(updateError
          ? `${device.name} command was sent locally, but cloud sync failed.`
          : `${device.name} turned ${isOn ? 'on' : 'off'}`);
        break;
      }

      case 'TOGGLE_ALL': {
        if (controlAll) {
          const commandResult = await controlAll(isOn ? 'on' : 'off', 'Voice Command (AI)');
          if (!commandResult?.success) {
            provideFeedback(`Could not turn all devices ${isOn ? 'on' : 'off'}. Please try again.`);
            break;
          }
          provideFeedback(`All devices turned ${isOn ? 'on' : 'off'}`);
          break;
        }

        let localDispatched = false;
        try {
          await discoverLocalNode(1500);
          await triggerLocalAll(isOn ? 'on' : 'off');
          localDispatched = true;
        } catch {
          // Cloud update below keeps the desired state when local hardware isn't reachable.
        }

        const { error: updateError } = await supabase.from('devices')
          .update({ is_on: isOn, last_changed: new Date().toISOString() })
          .eq('user_id', user.id);
        if (updateError && !localDispatched) {
          provideFeedback(`Could not turn all devices ${isOn ? 'on' : 'off'}. Please try again.`);
          break;
        }
        if (!updateError) {
          const { error: logError } = await supabase.from('activity_logs').insert({
            user_id: user.id,
            device_id: null,
            device_name: 'All Devices',
            action: `turned ${isOn ? 'ON' : 'OFF'}`,
            triggered_by: localDispatched ? 'Voice Command (AI) All via ESP32 Local Mesh' : 'Voice Command (AI) All',
          });
          if (logError) console.warn('Voice bulk activity log insert failed:', logError);
        }
        provideFeedback(updateError
          ? `All-device command was sent locally, but cloud sync failed.`
          : `All devices turned ${isOn ? 'on' : 'off'}`);
        break;
      }

      case 'APPLY_PRESET': {
        const preset = presetsRef.current.find(p => p.id === presetId);
        if (preset) {
          if (!applyPreset) {
            provideFeedback('Preset voice commands are available from the dashboard.');
            break;
          }
          await applyPreset(preset, result.deactivate || false);
          provideFeedback(`${result.deactivate ? 'Deactivated' : 'Activated'} preset: ${presetName}`);
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
            provideFeedback(`Cannot set an alarm in the past. Please provide a future date and time.`);
            break;
          }

          // ── Guard 2: Deduplication — unfired alarm within 1-minute window ─
          const triggerMs = triggerDate.getTime();
          const windowMs = 60 * 1000;
          const actionBool = isOn === true || isOn === 'true';
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
            provideFeedback(`${device.name} already has an alarm at ${displayTime} on ${displayDate}. Duplicate not created.`);
          } else {
            const { error } = await supabase.from('alarms').insert({
              user_id: user.id,
              device_id: deviceId,
              action: actionBool,
              trigger_at: triggerAt,
              fired: false
            });
            if (error) {
              provideFeedback(`Could not create alarm for ${device.name}. Please try again.`);
            } else {
              const displayTime = triggerDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              const displayDate = triggerDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              provideFeedback(`✅ Alarm set for ${device.name} to turn ${actionBool ? 'on' : 'off'} at ${displayTime} on ${displayDate}`);
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
          const normTime = (time || '').trim().slice(0, 5);
          const [scheduleHour, scheduleMinute] = normTime.split(':').map(Number);
          const actionBool = isOn === true || isOn === 'true';
          if (!/^\d{2}:\d{2}$/.test(normTime) || scheduleHour > 23 || scheduleMinute > 59 ||
              !Array.isArray(days) || days.length === 0 ||
              days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
            provideFeedback('I could not validate that schedule. Please repeat the time and days.');
            break;
          }

          // Deduplication: same device + same HH:MM + same action — filter by user_id too
          const { data: existingSchedules } = await supabase
            .from('schedules')
            .select('id, time, action, days, enabled')
            .eq('device_id', deviceId)
            .eq('user_id', user.id);

          const requestedDays = [...new Set(days || [])].sort((a, b) => a - b);
          const duplicate = (existingSchedules || []).find((schedule) => {
            const existingDays = [...new Set(schedule.days || [])].sort((a, b) => a - b);
            return schedule.enabled !== false &&
              (schedule.time || '').slice(0, 5) === normTime &&
              Boolean(schedule.action) === actionBool &&
              existingDays.length === requestedDays.length &&
              existingDays.every((day, index) => day === requestedDays[index]);
          });

          if (duplicate) {
            provideFeedback(`${device.name} already has a schedule to turn ${actionBool ? 'on' : 'off'} at ${normTime}. Duplicate not created.`);
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
              provideFeedback(`Could not create schedule for ${device.name}. Please try again.`);
            } else {
              const [hh, mm] = normTime.split(':').map(Number);
              const h12 = hh % 12 || 12;
              const ampm = hh >= 12 ? 'PM' : 'AM';
              const timeDisplay = `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
              provideFeedback(`✅ Schedule created for ${device.name} at ${timeDisplay}`);
            }
          }
        }
        break;
      }

      case 'DELETE_ALL_ALARMS': {
        const { error } = await supabase.from('alarms').delete().eq('user_id', user.id);
        provideFeedback(error ? 'Could not clear alarms. Please try again.' : 'All alarms cleared');
        break;
      }

      case 'DELETE_ALL_SCHEDULES': {
        const { error } = await supabase.from('schedules').delete().eq('user_id', user.id);
        provideFeedback(error ? 'Could not clear schedules. Please try again.' : 'All schedules cleared');
        break;
      }

      case 'GUIDANCE': {
        const guidanceMsg = message || 'Here you go.';
        safeToast(guidanceMsg);
        speak(guidanceMsg, language || 'en-US');
        if (result.redirectTo) {
          setTimeout(() => router.push(result.redirectTo), 1200);
        }
        break;
      }

      case 'ANSWER': {
        provideFeedback(message || 'I am here to help with your smart home.');
        break;
      }

      default:
        break;
    }
  }, [getLatestDevices, applyPreset, controlDevice, controlAll, router]);

  // Main command processor
  const processCommand = useCallback(async (transcript) => {
    if (!transcript?.trim()) return;
    setAgentState('processing');
    const text = normalizeText(transcript);
    const commandDevices = await getLatestDevices();
    const safeToast = onToast || ((msg) => console.log(msg));

    if (pendingActionRef.current) {
      if (/^(yes|yeah|yep|confirm|confirmed|do it|go ahead|proceed|haan|हां|हाँ)$/i.test(text)) {
        const pending = pendingActionRef.current;
        pendingActionRef.current = null;
        await executeLLMAction(pending, safeToast);
        setAgentState('idle');
        return;
      }
      if (/^(no|nope|cancel|stop|नहीं|नही)$/i.test(text)) {
        pendingActionRef.current = null;
        safeToast('Cancelled.');
        speak('Cancelled.', selectedLang);
        setAgentState('idle');
        return;
      }
      safeToast('Please say yes to confirm or no to cancel.');
      setAgentState('idle');
      return;
    }

    safeToast(`Heard: "${transcript}"`);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      safeToast('Please sign in before using voice control.');
      setAgentState('idle');
      return;
    }

    // Try OpenRouter AI Voice Command route first
    try {
      const response = await fetch('/api/voice-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          transcript: transcript,
          devices: commandDevices,
          presets: presetsRef.current,
          currentTime: getLocalISOString(),
          language: selectedLang,
          context: conversationRef.current.slice(-6),
        })
      });

      if (response.ok) {
        const result = await response.json();
        conversationRef.current = [
          ...conversationRef.current,
          { role: 'user', content: transcript },
          { role: 'assistant', content: result.message || result.actionType },
        ].slice(-6);
        if (result && result.actionType && result.actionType !== 'UNKNOWN') {
           const requiresConfirmation = [
             'TOGGLE_ALL', 'APPLY_PRESET', 'CREATE_ALARM', 'CREATE_SCHEDULE',
             'DELETE_ALL_ALARMS', 'DELETE_ALL_SCHEDULES',
           ].includes(result.actionType);
           if (requiresConfirmation) {
             pendingActionRef.current = result;
             const confirmation = result.message || 'This action may affect multiple devices or schedules. Confirm?';
             safeToast(`${confirmation} Say yes to confirm.`);
             speak(`${confirmation} Say yes to confirm.`, result.language || selectedLang);
             setAgentState('idle');
             return;
           }
           await executeLLMAction(result, safeToast);
           setAgentState('idle');
           return;
        } else if (result && result.actionType === 'UNKNOWN') {
          console.log('OpenRouter returned UNKNOWN action:', result.message);
          const clarifyMsg = result.message || 'Could not understand voice command.';
          safeToast(clarifyMsg);
          speak(clarifyMsg, result.language || selectedLang);
          setAgentState('idle');
          return;
        }
      } else {
        const errResult = await response.json().catch(() => ({}));
        console.warn(`Voice Command API failed with status ${response.status}:`, errResult.message || 'Unknown error');
      }
    } catch (e) {
      console.warn('AI voice command failed, falling back to local parser:', e);
    }

    if (commandDevices.length === 0) {
      safeToast('No devices found. Please add a board first.');
      speak('No devices found. Please add a board first.');
      setAgentState('idle');
      return;
    }

    // Note: Local hardcoded parsing for "All on / All off" has been removed.
    // We now rely entirely on the AI API for turning devices on and off.

    // 2. Clear/Delete All Alarms or Schedules.
    // Bulk deletion always requires a separate spoken confirmation.
    if (/^(?:delete|clear|remove) (?:all|every) alarms?$/.test(text)) {
      pendingActionRef.current = {
        actionType: 'DELETE_ALL_ALARMS',
        message: 'This will delete every alarm. Say yes to confirm, or no to cancel.',
        language: selectedLang,
      };
      safeToast(pendingActionRef.current.message);
      speak(pendingActionRef.current.message, selectedLang);
      setAgentState('idle');
      return;
    }
    if (/^(?:delete|clear|remove) (?:all|every) schedules?$/.test(text)) {
      pendingActionRef.current = {
        actionType: 'DELETE_ALL_SCHEDULES',
        message: 'This will delete every schedule. Say yes to confirm, or no to cancel.',
        language: selectedLang,
      };
      safeToast(pendingActionRef.current.message);
      speak(pendingActionRef.current.message, selectedLang);
      setAgentState('idle');
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
        setAgentState('idle');
        return;
      }

      const parsedTime = parseTime(timeStr);
      if (!parsedTime) {
        safeToast(`Could not parse time "${timeStr}"`);
        speak(`Could not parse time ${timeStr}`);
       setAgentState('idle');
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
       setAgentState('idle');
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
       setAgentState('idle');
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
       setAgentState('idle');
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
        setAgentState('idle');
        return;
      }

      const parsedTime = parseTime(timeStr);
      if (!parsedTime) {
        safeToast(`Could not parse time "${timeStr}"`);
        speak(`Could not parse time ${timeStr}`);
       setAgentState('idle');
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
       setAgentState('idle');
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
       setAgentState('idle');
       return;
    }

    // 5. Delete single alarm/schedule for device
    const deleteMatch = text.match(/^(?:delete|cancel|remove)\s+(alarm|schedule)\s+for\s+(.+)$/);
    if (deleteMatch) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAgentState('idle');
        return;
      }
      const type = deleteMatch[1]; // "alarm" or "schedule"
      const deviceQuery = normalizeText(deleteMatch[2]);

      const matchedDevice = findBestDevice(deviceQuery, commandDevices);
      if (!matchedDevice) {
        safeToast(`Device "${deviceQuery}" not found`);
        speak(`Device ${deviceQuery} not found`);
        setAgentState('idle');
        return;
      }

      if (type === 'alarm') {
        const { error } = await supabase.from('alarms').delete().eq('user_id', user.id).eq('device_id', matchedDevice.id);
        if (error) safeToast(`⚠ Could not delete alarms for ${matchedDevice.name}. Please try again.`);
        else {
          safeToast(`✅ Alarms deleted for ${matchedDevice.name}`);
          speak(`Alarms deleted for ${matchedDevice.name}`);
        }
      } else {
        const { error } = await supabase.from('schedules').delete().eq('user_id', user.id).eq('device_id', matchedDevice.id);
        if (error) safeToast(`⚠ Could not delete schedules for ${matchedDevice.name}. Please try again.`);
        else {
          safeToast(`✅ Schedules deleted for ${matchedDevice.name}`);
          speak(`Schedules deleted for ${matchedDevice.name}`);
        }
      }
      setAgentState('idle');
      return;
    }

    // 6. Enable/disable schedules
    const scheduleToggleMatch = text.match(/^(enable|disable|activate|deactivate|deactive)\s+schedule\s+for\s+(.+)$/);
    if (scheduleToggleMatch) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAgentState('idle');
        return;
      }
      const action = scheduleToggleMatch[1]; // "enable", "disable", "deactivate", etc.
      const deviceQuery = normalizeText(scheduleToggleMatch[2]);

      const matchedDevice = findBestDevice(deviceQuery, commandDevices);
      if (!matchedDevice) {
        safeToast(`Device "${deviceQuery}" not found`);
        speak(`Device ${deviceQuery} not found`);
        setAgentState('idle');
        return;
      }

      const enableVal = (action === 'enable' || action === 'activate');
      const { error } = await supabase.from('schedules').update({ enabled: enableVal }).eq('user_id', user.id).eq('device_id', matchedDevice.id);
      if (error) safeToast(error.message);
      else {
        safeToast(`Schedules ${enableVal ? 'enabled' : 'disabled'} for ${matchedDevice.name}`);
        speak(`Schedules ${enableVal ? 'enabled' : 'disabled'} for ${matchedDevice.name}`);
      }
      setAgentState('idle');
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setAgentState('idle');
          return;
        }
        await Promise.all(
          matchedPresetDirect.actions.map(action =>
            supabase.from('devices')
              .update({ is_on: action.is_on, last_changed: new Date().toISOString() })
              .eq('user_id', user.id)
              .eq('id', action.device_id)
          )
        );
      }
      safeToast(`Activated preset: ${matchedPresetDirect.name}`);
      speak(`Activated preset ${matchedPresetDirect.name}`);
      setAgentState('idle');
      return;
    }

    safeToast('Command not recognised. Try: "turn on fan 2", "turn off living room", "all off", or "show schedules"');
    speak('Command not recognized. Please try again.', 'en-US');
    setAgentState('idle');
  }, [getLatestDevices, onToast, applyPreset, selectedLang, executeLLMAction]);

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
      <div className="fixed bottom-[92px] right-7 max-md:bottom-[148px] max-md:right-6 bg-card/85 backdrop-blur-md px-2 py-1 rounded-full border border-border shadow-[0_4px_16px_rgba(0,0,0,0.3)] z-[200] flex gap-1 items-center select-none font-bold text-[10px] tracking-wider transition-all duration-300">
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
        <div className="fixed bottom-36 max-md:bottom-36 right-7 bg-card/90 backdrop-blur-md px-5 py-3.5 rounded-xl border border-border shadow-[0_8px_32px_rgba(0,0,0,0.5)] shadow-gold-glow z-[200] max-w-[300px] animate-scale-in flex flex-col gap-1.5 select-none">
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
        <div className="fixed bottom-36 max-md:bottom-36 right-7 bg-card/90 backdrop-blur-md px-5 py-3 rounded-xl border border-border shadow-lg z-[200] text-sm text-text">
          {agentState === 'transcribing' ? 'Transcribing...' : 'Processing command...'}
        </div>
      )}
      <button
        id="voice-control-mic-btn"
        onClick={toggleListening}
        className={`fixed bottom-7 right-7 max-md:bottom-20 max-md:right-6 w-14 h-14 rounded-full border-none bg-gradient-to-tr from-accent to-[#e2cc89] text-[var(--btn-text)] cursor-pointer z-[200] shadow-[0_6px_24px_var(--accent-glow)] shadow-gold-glow hover:scale-[1.08] active:scale-100 transition-all duration-300 flex items-center justify-center select-none group ${listening ? 'text-[var(--btn-text)]' : 'voice-agent-idle'}`}
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
