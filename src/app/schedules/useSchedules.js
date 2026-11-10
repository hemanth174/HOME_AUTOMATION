"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DAY_NAMES, formatScheduleDate, formatTime, getCurrentTime, normalizeDays, toDateInputValue, validateScheduleDate, validateTime } from "./scheduleUtils";

const SELECT = "id, time, enabled, days, action, device_id, run_date, devices(name, boards(name))";

export default function useSchedules() {
  const [user, setUser] = useState(null), [schedules, setSchedules] = useState([]), [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true), [toast, setToast] = useState("");
  const [showModal, setShowModal] = useState(false), [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState([]), [scheduleTime, setScheduleTime] = useState(getCurrentTime);
  const [scheduleDays, setScheduleDays] = useState([]), [scheduleAction, setScheduleAction] = useState(true);
  const [scheduleMode, setScheduleMode] = useState("weekly"), [scheduleDate, setScheduleDate] = useState(() => toDateInputValue());
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

  const closeModal = useCallback(() => { setShowModal(false); setScheduleDays([]); setScheduleTime(getCurrentTime()); setScheduleAction(true); setScheduleMode("weekly"); setScheduleDate(toDateInputValue()); setTimeConfirmed(false); setTimeError(""); setEditingSchedule(null); setSelectedDevices([]); }, []);
  const openCreateModal = useCallback(() => { setEditingSchedule(null); setSelectedDevices([]); setScheduleTime(getCurrentTime()); setScheduleDays([]); setScheduleAction(true); setScheduleMode("weekly"); setScheduleDate(toDateInputValue()); setTimeConfirmed(false); setTimeError(""); setShowModal(true); }, []);
  const openEditModal = useCallback((schedule) => {
    setEditingSchedule(schedule);
    setSelectedDevices([schedule.device_id]);
    setScheduleTime(schedule.time.substring(0, 5));
    setScheduleDays(normalizeDays(schedule.days));
    setScheduleAction(schedule.action);
    setScheduleMode(schedule.run_date ? "once" : "weekly");
    setScheduleDate(schedule.run_date ? String(schedule.run_date).slice(0, 10) : toDateInputValue());
    setTimeConfirmed(true);
    setTimeError("");
    setShowModal(true);
  }, []);
  const handleTimeChange = useCallback((value) => { setScheduleTime(value); setTimeConfirmed(false); setTimeError(validateTime(value).error); }, []);
  const changeScheduleMode = useCallback((mode) => {
    setScheduleMode(mode === "once" ? "once" : "weekly");
  }, []);
  const toggleDay = useCallback((day) => setScheduleDays((days) => {
    if (day === "all") return days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6];
    const numericDay = Number(day);
    return normalizeDays(days.includes(numericDay) ? days.filter((d) => d !== numericDay) : [...days, numericDay]);
  }), []);
  const toggleDeviceSelection = useCallback((idOrIds, force) => setSelectedDevices((current) => Array.isArray(idOrIds) ? force ? [...new Set([...current, ...idOrIds])] : current.filter((id) => !idOrIds.includes(id)) : current.includes(idOrIds) ? current.filter((id) => id !== idOrIds) : [...current, idOrIds]), []);
  const scheduleDraftChanged = !editingSchedule ||
    selectedDevices.length !== 1 ||
    selectedDevices[0] !== editingSchedule.device_id ||
    scheduleTime !== editingSchedule.time.substring(0, 5) ||
    scheduleMode !== (editingSchedule.run_date ? "once" : "weekly") ||
    (scheduleMode === "once" ? scheduleDate : "") !== (editingSchedule.run_date ? String(editingSchedule.run_date).slice(0, 10) : "") ||
    JSON.stringify(normalizeDays(scheduleDays)) !== JSON.stringify(normalizeDays(editingSchedule.days)) ||
    scheduleAction !== editingSchedule.action;
  const deleteSchedule = useCallback(async (id) => { const { error } = await supabase.from("schedules").delete().eq("id", id).eq("user_id", user.id); if (error) { setToast(`Could not delete schedule: ${error.message}`); return false; } setSchedules((all) => all.filter((s) => s.id !== id)); setToast("Schedule deleted"); return true; }, [user]);
  const toggleSchedule = useCallback(async (schedule) => { const { error } = await supabase.from("schedules").update({ enabled: !schedule.enabled }).eq("id", schedule.id).eq("user_id", user.id); if (error) { setToast(`Could not ${schedule.enabled ? "disable" : "enable"} schedule: ${error.message}`); return false; } setSchedules((all) => all.map((s) => s.id === schedule.id ? { ...s, enabled: !schedule.enabled } : s)); return true; }, [user]);
  const addSchedule = useCallback(async (event) => {
    event.preventDefault();
    if (savingRef.current || isSaving || (editingSchedule && !scheduleDraftChanged)) return;
    if (!selectedDevices.length) return setToast("Please select at least one device");
    const isOnce = scheduleMode === "once";
    let days;
    if (isOnce) {
      const dateCheck = validateScheduleDate(scheduleDate);
      if (!dateCheck.valid) return setToast(dateCheck.error);
      // Leave `days` empty: the ESP32 runs weekly schedules from `days`, so an
      // empty list prevents a one-time schedule from repeating on the device.
      days = [];
    } else {
      if (!scheduleDays.length) return setToast("Please select at least one day");
      days = normalizeDays(scheduleDays);
    }
    if (!timeConfirmed) return setToast('Please press "Confirm" to confirm the time');
    const { valid, error } = validateTime(scheduleTime);
    if (!valid) return setTimeError(error);
    const uniqueDeviceIds = [...new Set(selectedDevices)];
    const [newH, newM] = scheduleTime.split(":").map(Number);
    for (const deviceId of uniqueDeviceIds) {
      const conflicts = schedules.filter((s) => {
        if (s.device_id !== deviceId || !s.enabled) return false;
        if (editingSchedule && s.id === editingSchedule.id) return false;
        if (s.time.split(":").map(Number)[0] !== newH || s.time.split(":").map(Number)[1] !== newM) return false;
        if (isOnce) return s.run_date && String(s.run_date).slice(0, 10) === scheduleDate;
        if (s.run_date) return false;
        return days.some((d) => normalizeDays(s.days).includes(d));
      });
      if (conflicts.length) {
        const conflict = conflicts.find((s) => s.action === scheduleAction) || conflicts[0];
        const name = devices.find((d) => d.id === deviceId)?.name || "A device";
        const overlap = isOnce
          ? formatScheduleDate(scheduleDate)
          : days.filter((d) => normalizeDays(conflict.days).includes(d)).map((d) => DAY_NAMES[d]).join(", ");
        setToast(`${conflict.action === scheduleAction ? "Duplicate" : "Conflict"}: ${name} already has a schedule to Turn ${conflict.action ? "ON" : "OFF"} at ${formatTime(scheduleTime)} on ${overlap}.${conflict.action === scheduleAction ? "" : " Delete it first."}`);
        return;
      }
    }
    const rows = uniqueDeviceIds.map((device_id) => ({ user_id: user.id, device_id, action: scheduleAction, time: scheduleTime, days, enabled: true, run_date: isOnce ? scheduleDate : null }));
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
  }, [selectedDevices, scheduleDays, timeConfirmed, scheduleTime, schedules, editingSchedule, scheduleAction, scheduleMode, scheduleDate, devices, user, closeModal, isSaving, scheduleDraftChanged]);
  const deleteAllSchedules = useCallback(async () => { const { error } = await supabase.from("schedules").delete().eq("user_id", user.id); if (error) return setToast(`Could not delete schedules: ${error.message}`); setSchedules([]); setShowDeleteAllModal(false); setToast("All schedules deleted"); }, [user]);
  return { user, schedules, devices, loading, toast, setToast, showModal, setShowModal, showDeleteAllModal, setShowDeleteAllModal, selectedDevices, scheduleTime, scheduleDays, scheduleAction, setScheduleAction, scheduleMode, scheduleDate, setScheduleDate, changeScheduleMode, timeConfirmed, timeError, editingSchedule, isSaving, scheduleDraftChanged, closeModal, openCreateModal, openEditModal, handleTimeChange, toggleDay, toggleDeviceSelection, addSchedule, deleteSchedule, toggleSchedule, deleteAllSchedules, confirmTime: () => { const result = validateTime(scheduleTime); setTimeError(result.error); if (result.valid) setTimeConfirmed(true); } };
}
