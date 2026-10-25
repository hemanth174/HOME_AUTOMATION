"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DAY_NAMES, formatTime, validateTime } from "./scheduleUtils";

const SELECT = "id, time, enabled, days, action, device_id, devices(name, boards(name))";

export default function useSchedules() {
  const [user, setUser] = useState(null), [schedules, setSchedules] = useState([]), [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true), [toast, setToast] = useState("");
  const [showModal, setShowModal] = useState(false), [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState([]), [scheduleTime, setScheduleTime] = useState("08:00");
  const [scheduleDays, setScheduleDays] = useState([]), [scheduleAction, setScheduleAction] = useState(true);
  const [timeConfirmed, setTimeConfirmed] = useState(false), [timeError, setTimeError] = useState("");
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => { supabase.auth.getUser().then(({ data: { user: nextUser } }) => { if (!nextUser) window.location.href = "/login"; else setUser(nextUser); }); }, []);
  const fetchSchedules = useCallback(async () => { const { data } = await supabase.from("schedules").select(SELECT).eq("user_id", user.id).order("time"); if (data) setSchedules(data); }, [user]);
  useEffect(() => {
    if (!user) return;
    let active = true; const started = Date.now();
    Promise.all([supabase.from("schedules").select(SELECT).eq("user_id", user.id).order("time"), supabase.from("devices").select("id, name, boards(name, id)").eq("user_id", user.id).order("relay_index")]).then(([scheduleRes, deviceRes]) => { if (!active) return; if (scheduleRes.data) setSchedules(scheduleRes.data); if (deviceRes.data) setDevices(deviceRes.data); setTimeout(() => active && setLoading(false), Math.max(0, 500 - (Date.now() - started))); });
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (!user) return; let first = true;
    const channel = supabase.channel("schedules-realtime").on("postgres_changes", { event: "*", schema: "public", table: "schedules", filter: `user_id=eq.${user.id}` }, fetchSchedules).subscribe((status) => { if (status === "SUBSCRIBED") { if (first) first = false; else fetchSchedules(); } });
    return () => supabase.removeChannel(channel);
  }, [user, fetchSchedules]);

  const closeModal = useCallback(() => { setShowModal(false); setScheduleDays([]); setScheduleTime("08:00"); setScheduleAction(true); setTimeConfirmed(false); setTimeError(""); setEditingSchedule(null); setSelectedDevices([]); }, []);
  const openEditModal = useCallback((schedule) => { setEditingSchedule(schedule); setSelectedDevices([schedule.device_id]); setScheduleTime(schedule.time.substring(0, 5)); setScheduleDays(schedule.days); setScheduleAction(schedule.action); setTimeConfirmed(true); setTimeError(""); setShowModal(true); }, []);
  const handleTimeChange = useCallback((value) => { setScheduleTime(value); setTimeConfirmed(false); setTimeError(validateTime(value).error); }, []);
  const toggleDay = useCallback((day) => setScheduleDays((days) => days.includes(day) ? days.filter((d) => d !== day) : [...days, day]), []);
  const toggleDeviceSelection = useCallback((idOrIds, force) => setSelectedDevices((current) => Array.isArray(idOrIds) ? force ? [...new Set([...current, ...idOrIds])] : current.filter((id) => !idOrIds.includes(id)) : current.includes(idOrIds) ? current.filter((id) => id !== idOrIds) : [...current, idOrIds]), []);
  const deleteSchedule = useCallback(async (id) => { const { error } = await supabase.from("schedules").delete().eq("id", id).eq("user_id", user.id); if (error) { setToast(`Could not delete schedule: ${error.message}`); return false; } setSchedules((all) => all.filter((s) => s.id !== id)); setToast("Schedule deleted"); return true; }, [user]);
  const toggleSchedule = useCallback(async (schedule) => { const { error } = await supabase.from("schedules").update({ enabled: !schedule.enabled }).eq("id", schedule.id).eq("user_id", user.id); if (error) { setToast(`Could not ${schedule.enabled ? "disable" : "enable"} schedule: ${error.message}`); return false; } setSchedules((all) => all.map((s) => s.id === schedule.id ? { ...s, enabled: !schedule.enabled } : s)); return true; }, [user]);
  const addSchedule = useCallback(async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!selectedDevices.length) return setToast("Please select at least one device");
    if (!scheduleDays.length) return setToast("Please select at least one day");
    if (!timeConfirmed) return setToast('Please press "Confirm" to confirm the time');
    const { valid, error } = validateTime(scheduleTime);
    if (!valid) return setTimeError(error);
    const uniqueDeviceIds = [...new Set(selectedDevices)];
    const [newH, newM] = scheduleTime.split(":").map(Number), days = [...scheduleDays].sort();
    for (const deviceId of uniqueDeviceIds) {
      const conflicts = schedules.filter((s) => s.device_id === deviceId && s.enabled && (!editingSchedule || s.id !== editingSchedule.id) && s.time.split(":").map(Number)[0] === newH && s.time.split(":").map(Number)[1] === newM && days.some((d) => s.days.includes(d)));
      if (conflicts.length) {
        const conflict = conflicts.find((s) => s.action === scheduleAction) || conflicts[0];
        const name = devices.find((d) => d.id === deviceId)?.name || "A device";
        const overlap = days.filter((d) => conflict.days.includes(d)).map((d) => DAY_NAMES[d]).join(", ");
        setToast(`${conflict.action === scheduleAction ? "Duplicate" : "Conflict"}: ${name} already has a schedule to Turn ${conflict.action ? "ON" : "OFF"} at ${formatTime(scheduleTime)} on ${overlap}.${conflict.action === scheduleAction ? "" : " Delete it first."}`);
        return;
      }
    }
    const rows = uniqueDeviceIds.map((device_id) => ({ user_id: user.id, device_id, action: scheduleAction, time: scheduleTime, days, enabled: true }));
    savingRef.current = true;
    setIsSaving(true);
    try {
      if (editingSchedule && uniqueDeviceIds.length === 1 && uniqueDeviceIds[0] === editingSchedule.device_id) {
        const { error: updateError } = await supabase.from("schedules").update(rows[0]).eq("id", editingSchedule.id).eq("user_id", user.id);
        if (updateError) return setToast(updateError.message);
        setToast("Schedule updated");
      } else {
        const { error: insertError } = await supabase.from("schedules").insert(rows);
        if (insertError) return setToast(insertError.message);
        if (editingSchedule) await supabase.from("schedules").delete().eq("id", editingSchedule.id).eq("user_id", user.id);
        setToast(editingSchedule ? "Schedule updated" : `Created ${rows.length} schedule${rows.length > 1 ? "s" : ""}`);
      }
      closeModal();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [selectedDevices, scheduleDays, timeConfirmed, scheduleTime, schedules, editingSchedule, scheduleAction, devices, user, closeModal]);
  const deleteAllSchedules = useCallback(async () => { const { error } = await supabase.from("schedules").delete().eq("user_id", user.id); if (error) return setToast(`Could not delete schedules: ${error.message}`); setSchedules([]); setShowDeleteAllModal(false); setToast("All schedules deleted"); }, [user]);
  return { user, schedules, devices, loading, toast, setToast, showModal, setShowModal, showDeleteAllModal, setShowDeleteAllModal, selectedDevices, scheduleTime, scheduleDays, scheduleAction, setScheduleAction, timeConfirmed, timeError, editingSchedule, isSaving, closeModal, openEditModal, handleTimeChange, toggleDay, toggleDeviceSelection, addSchedule, deleteSchedule, toggleSchedule, deleteAllSchedules, confirmTime: () => { const result = validateTime(scheduleTime); setTimeError(result.error); if (result.valid) setTimeConfirmed(true); } };
}
