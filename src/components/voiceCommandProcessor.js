import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { speak } from '@/utils/voice';
import { getLocalISOString, normalizeText, fuzzyScore, findBestDevice, parseTimeWithDay } from './voiceControlUtils';
import { executeVoiceAction } from './voiceActionExecutor';

export function useVoiceCommandProcessor({ getLatestDevices, onToast, applyPreset, controlDevice, controlAll, selectedLang, presetsRef, pendingActionRef, conversationRef, router, setAgentState }) {
  const runAction = useCallback((result, safeToast) => executeVoiceAction(result, {
    getLatestDevices,
    applyPreset,
    controlDevice,
    controlAll,
    router,
    presetsRef,
    safeToast,
    setAgentState,
  }), [getLatestDevices, applyPreset, controlDevice, controlAll, router, presetsRef, setAgentState]);

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
        await runAction(pending, safeToast);
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
            await runAction(result, safeToast);
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

    // Device-independent maintenance commands (for example, clearing an
    // orphaned alarm list) are handled below even when no device rows exist.

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
    const alarmCreateMatch = text.match(/^(?:set|create)\s+(?:an?\s+)?alarm\s+for\s+(.+?)\s+(?:to\s+turn\s+(on|off)\s+)?at\s+(.+)$/);
    const alarmWithoutDeviceMatch = text.match(/^(?:set|create)\s+(?:an?\s+)?alarm\s+at\s+(.+)$/);
    if (alarmCreateMatch || alarmWithoutDeviceMatch) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAgentState('idle');
        safeToast('Please sign in before creating an alarm.');
        return;
      }

      const deviceQuery = alarmCreateMatch ? normalizeText(alarmCreateMatch[1]) : '';
      const actionWord = alarmCreateMatch?.[2]; // "on" or "off"
      const timeStr = alarmCreateMatch ? alarmCreateMatch[3] : alarmWithoutDeviceMatch[1];

      if (!deviceQuery && commandDevices.length !== 1) {
        const message = 'Please name the device for this alarm, for example: create an alarm for Device 1 at 1 AM today.';
        safeToast(message);
        speak(message);
        setAgentState('idle');
        return;
      }

      const matchedDevice = deviceQuery
        ? findBestDevice(deviceQuery, commandDevices)
        : commandDevices[0];
      if (!matchedDevice) {
        safeToast(`Device "${deviceQuery}" not found for alarm`);
        speak(`Device ${deviceQuery} not found`);
        setAgentState('idle');
        return;
      }

       const parsedTime = parseTimeWithDay(timeStr);
      if (!parsedTime) {
        safeToast(`Could not parse time "${timeStr}"`);
        speak(`Could not parse time ${timeStr}`);
       setAgentState('idle');
       return;
      }

       const now = new Date();
       const alarmDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsedTime.hour, parsedTime.minute, 0);
       if (parsedTime.day === 'tomorrow') {
         alarmDate.setDate(alarmDate.getDate() + 1);
       } else if (!parsedTime.day && alarmDate <= now) {
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
      const { data: existingAlarms, error: alarmQueryError } = await supabase
        .from('alarms')
        .select('id, trigger_at, action')
        .eq('device_id', matchedDevice.id)
        .eq('user_id', user.id)
        .eq('fired', false);
      if (alarmQueryError) {
        safeToast('Could not check existing alarms. Please try again.');
        speak('Could not check existing alarms. Please try again.');
        setAgentState('idle');
        return;
      }

      const alarmTime = `${String(alarmDate.getHours()).padStart(2, '0')}:${String(alarmDate.getMinutes()).padStart(2, '0')}`;
      const { data: activeSchedules, error: scheduleConflictError } = await supabase
        .from('schedules')
        .select('id, time, days, action, enabled')
        .eq('device_id', matchedDevice.id)
        .eq('user_id', user.id)
        .eq('enabled', true);
      if (scheduleConflictError) {
        safeToast('Could not check schedule conflicts. Please try again.');
        speak('Could not check schedule conflicts. Please try again.');
        setAgentState('idle');
        return;
      }
      const scheduleConflict = (activeSchedules || []).find((schedule) =>
        Array.isArray(schedule.days) &&
        schedule.days.includes(alarmDate.getDay()) &&
        (schedule.time || '').slice(0, 5) === alarmTime
      );
      if (scheduleConflict) {
        safeToast(`${matchedDevice.name} already has a schedule at ${alarmTime} on that day. Edit it before adding an alarm at the same time.`);
        speak('There is already a schedule at that time. Please edit it first.');
        setAgentState('idle');
        return;
      }

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
      if (!user) {
        setAgentState('idle');
        safeToast('Please sign in before creating a schedule.');
        return;
      }

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

       const parsedTime = parseTimeWithDay(timeStr);
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
          days = matchedDays.sort((a, b) => a - b);
        } else {
          safeToast(`I could not understand the schedule days "${daysStr}". Say weekdays, weekends, every day, or name the days.`);
          speak('Please repeat the schedule days.', selectedLang);
          setAgentState('idle');
          return;
        }
      }

      const isScheduleOn = actionWord ? actionWord === 'on' : true;
      const formattedTime = `${String(parsedTime.hour).padStart(2, '0')}:${String(parsedTime.minute).padStart(2, '0')}`;

      // Dedup: normalize time to HH:MM (5 chars) — DB may store HH:MM:SS
      // Cast action to boolean so type mismatches don't let duplicates through
      const { data: existingSchedules, error: scheduleQueryError } = await supabase
        .from('schedules')
        .select('id, time, action, days, enabled')
        .eq('device_id', matchedDevice.id)
        .eq('user_id', user.id);
      if (scheduleQueryError) {
        safeToast('Could not check existing schedules. Please try again.');
        speak('Could not check existing schedules. Please try again.');
        setAgentState('idle');
        return;
      }

      const requestedDays = [...new Set(days)].sort((a, b) => a - b);
      const conflictingSchedule = (existingSchedules || []).find((schedule) => {
        const existingDays = [...new Set(schedule.days || [])];
        return schedule.enabled !== false &&
          (schedule.time || '').slice(0, 5) === formattedTime &&
          existingDays.some((day) => requestedDays.includes(day));
      });

      if (conflictingSchedule) {
        const timeDisplay = `${parsedTime.hour % 12 || 12}:${String(parsedTime.minute).padStart(2, '0')} ${parsedTime.hour >= 12 ? 'PM' : 'AM'}`;
        const sameAction = Boolean(conflictingSchedule.action) === isScheduleOn;
        const conflictMessage = sameAction
          ? `${matchedDevice.name} already has a schedule at ${timeDisplay} on an overlapping day. Duplicate not created.`
          : `Conflict: ${matchedDevice.name} already has an opposite-action schedule at ${timeDisplay} on an overlapping day.`;
        safeToast(conflictMessage);
        speak(conflictMessage);
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

    if (commandDevices.length === 0) {
      safeToast('No devices found. Please add a board first.');
      speak('No devices found. Please add a board first.');
      setAgentState('idle');
      return;
    }

    // 8. Fallback: a direct preset name still goes through the same
    // local+cloud executor as an AI-classified preset action.
    const matchedPresetDirect = presetsRef.current.find((preset) =>
      normalizeText(preset.name) === text || fuzzyScore(text, normalizeText(preset.name)) >= 0.8
    );
    if (matchedPresetDirect) {
       await runAction({
        actionType: 'APPLY_PRESET',
        presetId: matchedPresetDirect.id,
        presetName: matchedPresetDirect.name,
        deactivate: /\b(?:deactivate|deactive|disable|off)\b/.test(text),
        language: selectedLang,
       }, safeToast);
      setAgentState('idle');
      return;
    }

    safeToast('Command not recognised. Try: "turn on fan 2", "turn off living room", "all off", or "show schedules"');
    speak('Command not recognized. Please try again.', 'en-US');
    setAgentState('idle');
  }, [getLatestDevices, onToast, selectedLang, pendingActionRef, presetsRef, conversationRef, runAction, setAgentState]);
  return processCommand;
}

