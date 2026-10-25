import { supabase } from '@/lib/supabase';
import { speak } from '@/utils/voice';
import { discoverLocalNode, setLocalDeviceState, triggerLocalAll } from '@/lib/localApi';

export async function executeVoiceAction(result, { getLatestDevices, applyPreset, controlDevice, controlAll, router, presetsRef, safeToast, setAgentState }) {

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
        const preset = presetsRef.current.find((item) => item.id === presetId);
        if (!preset) {
          provideFeedback('That preset is no longer available. Please try again.');
          break;
        }
        if (applyPreset) {
          const outcome = await applyPreset(preset, result.deactivate || false);
          if (outcome?.success === false) {
            provideFeedback(outcome.succeeded > 0
              ? `Preset ${presetName || preset.name} was only partly applied. Please check device states.`
              : `Could not apply preset ${presetName || preset.name}. Please try again.`);
          } else {
            provideFeedback(`${result.deactivate ? 'Deactivated' : 'Activated'} preset: ${presetName || preset.name}`);
          }
          break;
        }

        let actions = preset.actions;
        if (typeof actions === 'string') {
          try { actions = JSON.parse(actions); } catch { actions = []; }
        }
        if (!Array.isArray(actions) || actions.length === 0) {
          provideFeedback(`Preset ${preset.name} has no saved device actions.`);
          break;
        }

        const latestDevices = await getLatestDevices();
        let localGatewayAvailable = false;
        try {
          await discoverLocalNode(1500);
          localGatewayAvailable = true;
        } catch {
          // Cloud-only execution remains available below.
        }

        let succeeded = 0;
        let failed = 0;
        for (const action of actions) {
          const device = latestDevices.find((item) => item.id === action.device_id);
          if (!device) {
            failed++;
            continue;
          }

          const targetState = result.deactivate ? !Boolean(action.is_on) : Boolean(action.is_on);
          let localDispatched = false;
          if (localGatewayAvailable) {
            try {
              await setLocalDeviceState(Number(device.relay_index), targetState, device.node_id || null);
              localDispatched = true;
            } catch {
              // Fall back to persisted state; firmware sync will pick it up when connected.
            }
          }

          const { error: updateError } = await supabase.from('devices')
            .update({ is_on: targetState, last_changed: new Date().toISOString() })
            .eq('id', device.id)
            .eq('user_id', user.id);
          if (!updateError) {
            const { error: logError } = await supabase.from('activity_logs').insert({
              user_id: user.id,
              device_id: device.id,
              device_name: device.name,
              action: `turned ${targetState ? 'ON' : 'OFF'}`,
              triggered_by: `Voice Command (AI) Preset: ${preset.name}`,
            });
            if (logError) console.warn('Preset activity log insert failed:', logError);
          }

          if (!updateError || localDispatched) succeeded++;
          else failed++;
        }

        if (succeeded === actions.length) {
          provideFeedback(`${result.deactivate ? 'Deactivated' : 'Activated'} preset: ${preset.name}`);
        } else if (succeeded > 0) {
          provideFeedback(`Preset ${preset.name} was only partly applied. Please check the device states.`);
        } else {
          provideFeedback(`Could not apply preset ${preset.name}. Please try again.`);
        }
        break;
      }

      case 'CREATE_ALARM': {
        const latestDevices = await getLatestDevices();
        const device = latestDevices.find(d => d.id === deviceId);
        if (!device) {
          provideFeedback('That alarm device could not be found. Please try again.');
          break;
        }
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
          const { data: existingAlarms, error: alarmQueryError } = await supabase
            .from('alarms')
            .select('id, trigger_at, action')
            .eq('device_id', deviceId)
            .eq('user_id', user.id)
            .eq('fired', false);
          if (alarmQueryError) {
            provideFeedback('Could not check existing alarms. Please try again.');
            break;
          }

          const alarmTime = `${String(triggerDate.getHours()).padStart(2, '0')}:${String(triggerDate.getMinutes()).padStart(2, '0')}`;
          const { data: activeSchedules, error: scheduleConflictError } = await supabase
            .from('schedules')
            .select('id, time, days, action, enabled')
            .eq('device_id', deviceId)
            .eq('user_id', user.id)
            .eq('enabled', true);
          if (scheduleConflictError) {
            provideFeedback('Could not check schedule conflicts. Please try again.');
            break;
          }
          const scheduleConflict = (activeSchedules || []).find((schedule) =>
            Array.isArray(schedule.days) &&
            schedule.days.includes(triggerDate.getDay()) &&
            (schedule.time || '').slice(0, 5) === alarmTime
          );
          if (scheduleConflict) {
            provideFeedback(`${device.name} already has a schedule at ${alarmTime} on that day. Edit it before adding an alarm at the same time.`);
            break;
          }

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
        if (!device) {
          provideFeedback('That schedule device could not be found. Please try again.');
          break;
        }
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
          const { data: existingSchedules, error: schedulesQueryError } = await supabase
            .from('schedules')
            .select('id, time, action, days, enabled')
            .eq('device_id', deviceId)
            .eq('user_id', user.id);
          if (schedulesQueryError) {
            provideFeedback('Could not check existing schedules. Please try again.');
            break;
          }

          const requestedDays = [...new Set(days || [])].sort((a, b) => a - b);
          const conflict = (existingSchedules || []).find((schedule) => {
            const existingDays = [...new Set(schedule.days || [])];
            return schedule.enabled !== false &&
              (schedule.time || '').slice(0, 5) === normTime &&
              existingDays.some((day) => requestedDays.includes(day));
          });

          if (conflict) {
            const sameAction = Boolean(conflict.action) === actionBool;
            provideFeedback(sameAction
              ? `${device.name} already has a schedule at ${normTime} on an overlapping day. Duplicate not created.`
              : `Conflict: ${device.name} already has an opposite-action schedule at ${normTime} on an overlapping day.`);
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
}
