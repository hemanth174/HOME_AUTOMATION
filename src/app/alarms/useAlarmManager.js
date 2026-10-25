import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { speak } from "@/utils/voice";
import { buildISO, defaultParts, formatAlarmDisplay, validateParts } from "./alarmUtils";

const alarmSelect = "id, trigger_at, action, fired, device_id, devices(name, boards(name))";

export default function useAlarmManager() {
  const [user, setUser] = useState(null), [alarms, setAlarms] = useState([]), [devices, setDevices] = useState([]);
  const [showModal, setShowModal] = useState(false), [showDeleteAllModal, setShowDeleteAllModal] = useState(false), [loading, setLoading] = useState(true), [toast, setToast] = useState("");
  const [selectedDevice, setSelectedDevice] = useState(""), [pickerParts, setPickerParts] = useState(defaultParts()), [alarmAction, setAlarmAction] = useState(true), [dateError, setDateError] = useState(""), [confirmed, setConfirmed] = useState(false), [editingAlarm, setEditingAlarm] = useState(null);

  useEffect(() => { (async () => { const { data: { user: currentUser } } = await supabase.auth.getUser(); if (!currentUser) { window.location.href = "/login"; return; } setUser(currentUser); })(); }, []);
  useEffect(() => {
    if (!user) return; let active = true;
    (async () => { const started = Date.now(); const [a, d] = await Promise.all([
      supabase.from("alarms").select(alarmSelect).eq("user_id", user.id).order("trigger_at"),
      supabase.from("devices").select("id, name, boards(name, id)").eq("user_id", user.id).order("relay_index"),
    ]); if (!active) return; if (a.data) setAlarms(a.data); if (d.data) { setDevices(d.data); if (d.data.length) setSelectedDevice(d.data[0].id); } setTimeout(() => active && setLoading(false), Math.max(0, 500 - (Date.now() - started))); })();
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (!user) return; let first = true;
    const sync = async () => { const { data } = await supabase.from("alarms").select(alarmSelect).eq("user_id", user.id).order("trigger_at"); if (data) setAlarms(data); };
    const channel = supabase.channel("alarms-realtime").on("postgres_changes", { event: "*", schema: "public", table: "alarms", filter: `user_id=eq.${user.id}` }, sync).subscribe(async (status) => { if (status === "SUBSCRIBED") { if (first) first = false; else await sync(); } });
    return () => supabase.removeChannel(channel);
  }, [user]);

  const closeModal = () => { setShowModal(false); setPickerParts(defaultParts()); setDateError(""); setConfirmed(false); setAlarmAction(true); setEditingAlarm(null); if (devices.length) setSelectedDevice(devices[0].id); };
  const openEditModal = (alarm) => { const dt = new Date(alarm.trigger_at), h = dt.getHours(); setEditingAlarm(alarm); setSelectedDevice(alarm.device_id); setAlarmAction(alarm.action); setPickerParts({ year: String(dt.getFullYear()), month: String(dt.getMonth() + 1), day: String(dt.getDate()), hour: String(h % 12 || 12), minute: String(dt.getMinutes()), ampm: h >= 12 ? "PM" : "AM" }); setConfirmed(true); setDateError(""); setShowModal(true); };
  const handlePartsChange = (parts) => { setPickerParts(parts); setConfirmed(false); const { year, month, day, hour, minute, ampm } = parts; setDateError(year && month && day ? validateParts(year, month, day, hour, minute, ampm).error : ""); };
  const handleConfirmDateTime = () => { const p = pickerParts, result = validateParts(p.year, p.month, p.day, p.hour, p.minute, p.ampm); if (!result.valid) { setDateError(result.error); return; } setDateError(""); setConfirmed(true); };
  const deleteAlarm = async (id) => { const { error } = await supabase.from("alarms").delete().eq("id", id).eq("user_id", user.id); if (error) { setToast(`Could not delete alarm: ${error.message}`); return false; } setAlarms((items) => items.filter((a) => a.id !== id)); setToast("Alarm deleted"); return true; };
  const addAlarm = async (e) => {
    e.preventDefault(); if (!selectedDevice) return setToast("Please select a device"); if (!confirmed) return setToast('Please press "Confirm" to confirm the date & time');
    const p = pickerParts, validation = validateParts(p.year, p.month, p.day, p.hour, p.minute, p.ampm); if (!validation.valid) { setDateError(validation.error); return; }
    const iso = buildISO(p.year, p.month, p.day, p.hour, p.minute, p.ampm); if (!iso) return setToast("Invalid date/time"); const triggerISO = new Date(iso).toISOString();
    const conflicts = alarms.filter((a) => a.device_id === selectedDevice && !a.fired && (!editingAlarm || a.id !== editingAlarm.id) && new Date(a.trigger_at).getTime() === new Date(triggerISO).getTime());
    if (conflicts.find((a) => a.action === alarmAction)) return setToast("Duplicate: this device already has an identical alarm at this time.");
    const contra = conflicts.find((a) => a.action !== alarmAction); if (contra) return setToast(`Conflict: an alarm already sets this device to Turn ${contra.action ? "ON" : "OFF"} at this time. Delete it first.`);
    const { data: schedules, error: scheduleError } = await supabase.from("schedules").select("id, time, days, action").eq("user_id", user.id).eq("device_id", selectedDevice).eq("enabled", true); if (scheduleError) return setToast("Could not check schedule conflicts. Please retry.");
    const date = new Date(triggerISO); for (const schedule of schedules || []) { const [h, m] = schedule.time.split(":").map(Number); if (Array.isArray(schedule.days) && schedule.days.includes(date.getDay()) && h === date.getHours() && m === date.getMinutes()) return setToast(schedule.action === alarmAction ? "Duplicate: a schedule already matches this device/time/action." : `Cross-conflict: a schedule already sets this device to Turn ${schedule.action ? "ON" : "OFF"} at this day/time.`); }
    const query = editingAlarm ? supabase.from("alarms").update({ device_id: selectedDevice, action: alarmAction, trigger_at: triggerISO, fired: false }).eq("id", editingAlarm.id) : supabase.from("alarms").insert({ user_id: user.id, device_id: selectedDevice, action: alarmAction, trigger_at: triggerISO, fired: false });
    const { error } = await query; if (error) return setToast(error.message); setToast(editingAlarm ? "Alarm updated" : "Alarm created"); closeModal();
  };
  const deleteAllAlarms = async () => { const { error } = await supabase.from("alarms").delete().eq("user_id", user.id); if (error) return setToast(`Could not delete alarms: ${error.message}`); setAlarms([]); setShowDeleteAllModal(false); setToast("All alarms deleted"); };
  const handleAlarmCardCommand = async (alarm, transcript) => { const text = transcript.toLowerCase().trim(), name = alarm.devices?.name || "device"; if (["delete", "remove", "cancel", "trash"].some((word) => text.includes(word))) { if (await deleteAlarm(alarm.id)) speak(`Alarm for ${name} deleted`); } else { setToast(`Command not recognized: "${transcript}". Try "delete" or "cancel".`); speak("Command not recognized"); } };
  const pISO = useMemo(() => buildISO(pickerParts.year, pickerParts.month, pickerParts.day, pickerParts.hour, pickerParts.minute, pickerParts.ampm), [pickerParts]);
  const previewDisplay = useMemo(() => { try { return pISO ? formatAlarmDisplay(pISO) : null; } catch { return null; } }, [pISO]);
  return { user, alarms, devices, loading, toast, setToast, showModal, setShowModal, showDeleteAllModal, setShowDeleteAllModal, selectedDevice, setSelectedDevice, pickerParts, alarmAction, setAlarmAction, dateError, confirmed, editingAlarm, closeModal, openEditModal, handlePartsChange, handleConfirmDateTime, addAlarm, deleteAlarm, deleteAllAlarms, handleAlarmCardCommand, previewDisplay };
}
