'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Loader from '@/components/Loader';
import OnboardingGuide from '@/components/OnboardingGuide';
import Link from 'next/link';
import { HelpCircle, TrendingUp, X, RotateCw, FileSpreadsheet, Settings, Zap, Ghost, AlertTriangle, Cpu } from 'lucide-react';
import {
  AreaChart, Area,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
  BarChart, Bar, Cell,
  PieChart, Pie,
  LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ZAxis,
  RadialBarChart, RadialBar,
  ComposedChart, ReferenceLine
} from 'recharts';

export default function AnalyticsPage() {
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [boards, setBoards] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyAnalytics, setDailyAnalytics] = useState([]);
  const [weeklyAnalytics, setWeeklyAnalytics] = useState([]);
  const [userSettings, setUserSettings] = useState({ tariff_per_kwh: 8.00, voltage: 230, currency: 'INR' });

  // Guide and Tour States
  const [showPowerGuide, setShowPowerGuide] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      setUser(user);
    };
    checkAuth();
  }, []);

  // Fetch devices, boards, and logs from today (memoized for recurring updates)
  const fetchData = useCallback(async (isSilent = false) => {
    if (!user) return;
    if (!isSilent) setLoading(true);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    try {
      // Trigger database daily rollup aggregation and log pruning trigger
      await supabase.rpc('summarize_and_prune_old_logs');

      const [devicesRes, boardsRes, logsRes, dailyAnalyticsRes, weeklyAnalyticsRes, settingsRes] = await Promise.all([
        supabase.from('devices').select('id, name, is_on, last_changed, board_id, relay_index, feedback_on').eq('user_id', user.id),
        supabase.from('boards').select('id, name').eq('user_id', user.id),
        supabase.from('activity_logs')
          .select('id, device_id, action, created_at')
          .eq('user_id', user.id)
          .gte('created_at', startOfToday.toISOString())
          .order('created_at', { ascending: true }),
        supabase.from('daily_analytics')
          .select('date, total_kwh, total_cost, avg_on_time, usage_duration, toggle_counts, peak_hours, error_rates')
          .eq('user_id', user.id)
          .order('date', { ascending: true })
          .limit(30),
        supabase.from('weekly_analytics')
          .select('week_start, week_end, total_kwh, total_cost, usage_duration, toggle_counts, peak_hours, error_rates')
          .eq('user_id', user.id)
          .order('week_start', { ascending: false })
          .limit(2),
        supabase.from('user_settings')
          .select('tariff_per_kwh, voltage, currency')
          .eq('user_id', user.id)
          .maybeSingle()
      ]);

      if (devicesRes.data) setDevices(devicesRes.data);
      if (boardsRes.data) setBoards(boardsRes.data);
      if (logsRes.data) setLogs(logsRes.data);
      if (dailyAnalyticsRes.data) setDailyAnalytics(dailyAnalyticsRes.data);
      if (weeklyAnalyticsRes.data) setWeeklyAnalytics(weeklyAnalyticsRes.data);
      if (settingsRes.data) setUserSettings({ tariff_per_kwh: settingsRes.data.tariff_per_kwh, voltage: settingsRes.data.voltage, currency: settingsRes.data.currency });
    } catch (err) {
      console.error('Failed to load analytics data', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      fetchData(false);
    }
  }, [user, fetchData]);

  // Auto-reload every 30 seconds
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      fetchData(true); // background silent refresh
    }, 30000);
    return () => clearInterval(timer);
  }, [user, fetchData]);

  const handleExportData = async () => {
    if (!user) return;
    
    try {
      const [fullLogsRes, schedulesRes, alarmsRes] = await Promise.all([
        supabase.from('activity_logs')
          .select('created_at, device_name, action, triggered_by')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('schedules')
          .select('time, days, action, enabled, devices(name)')
          .eq('user_id', user.id),
        supabase.from('alarms')
          .select('trigger_at, action, fired, devices(name)')
          .eq('user_id', user.id)
      ]);

      const fullLogs = fullLogsRes.data || [];
      const schedules = schedulesRes.data || [];
      const alarms = alarmsRes.data || [];

      let csvContent = '';

      const escape = (val) => {
        if (val === null || val === undefined) return '';
        let str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          str = '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      csvContent += `SMART HOME AUTOMATION - MASTER SYSTEM EXPORT\n`;
      csvContent += `Export Date,${new Date().toLocaleString()}\n`;
      csvContent += `User ID,${user.id}\n\n`;

      csvContent += `SECTION: DAILY ANALYTICS HISTORY (LAST 30 DAYS)\n`;
      csvContent += `Date,Energy Consumed (kWh),Estimated Cost (INR),Average Device On-Time (Hours)\n`;
      dailyAnalytics.forEach((row) => {
        csvContent += `${escape(row.date)},${escape(row.total_kwh)},${escape(row.total_cost)},${escape(row.avg_on_time)}\n`;
      });
      csvContent += `\n`;

      csvContent += `SECTION: CURRENT REGISTERED DEVICES\n`;
      csvContent += `Device Name,Current Status,Last Changed Timestamp\n`;
      devices.forEach((dev) => {
        csvContent += `${escape(dev.name)},${dev.is_on ? 'ON' : 'OFF'},${escape(dev.last_changed)}\n`;
      });
      csvContent += `\n`;

      csvContent += `SECTION: AUTOMATION SCHEDULES\n`;
      csvContent += `Target Device,Trigger Time,Days of Week,Switch Action,Enabled Status\n`;
      schedules.forEach((sch) => {
        const daysMap = sch.days || [];
        const daysLabel = daysMap.length === 7 ? 'Everyday' : daysMap.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join('|');
        csvContent += `${escape(sch.devices?.name || 'Unknown')},${escape(sch.time)},${escape(daysLabel)},${sch.action ? 'ON' : 'OFF'},${sch.enabled ? 'Active' : 'Disabled'}\n`;
      });
      csvContent += `\n`;

      csvContent += `SECTION: FUTURE ALARMS\n`;
      csvContent += `Target Device,Trigger Date & Time,Switch Action,Fired Status\n`;
      alarms.forEach((al) => {
        csvContent += `${escape(al.devices?.name || 'Unknown')},${escape(al.trigger_at)},${al.action ? 'ON' : 'OFF'},${al.fired ? 'Executed' : 'Pending'}\n`;
      });
      csvContent += `\n`;

      csvContent += `SECTION: SYSTEM ACTIVITY LOGS (LAST 7 DAYS)\n`;
      csvContent += `Timestamp,Device Name,Action Performed,Triggered By\n`;
      fullLogs.forEach((log) => {
        csvContent += `${escape(log.created_at)},${escape(log.device_name)},${escape(log.action)},${escape(log.triggered_by)}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `smart_home_data_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Failed to export system data:', error);
    }
  };

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;

    const devicesChannel = supabase
      .channel('analytics-devices-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDevices(prev => {
              if (prev.some(d => d.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          } else if (payload.eventType === 'UPDATE') {
            setDevices(prev => prev.map(d => d.id === payload.new.id ? payload.new : d));
          } else if (payload.eventType === 'DELETE') {
            setDevices(prev => prev.filter(d => d.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const boardsChannel = supabase
      .channel('analytics-boards-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boards',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBoards(prev => {
              if (prev.some(b => b.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          } else if (payload.eventType === 'UPDATE') {
            setBoards(prev => prev.map(b => b.id === payload.new.id ? payload.new : b));
          } else if (payload.eventType === 'DELETE') {
            setBoards(prev => prev.filter(b => b.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const logsChannel = supabase
      .channel('analytics-logs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_logs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLogs(prev => [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setLogs(prev => prev.map(l => l.id === payload.new.id ? payload.new : l));
          } else if (payload.eventType === 'DELETE') {
            setLogs(prev => prev.filter(l => l.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const dailyAnalyticsChannel = supabase
      .channel('analytics-daily-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_analytics',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDailyAnalytics(prev => {
              if (prev.some(d => d.date === payload.new.date)) return prev;
              return [...prev, payload.new].sort((a, b) => new Date(a.date) - new Date(b.date));
            });
          } else if (payload.eventType === 'UPDATE') {
            setDailyAnalytics(prev => prev.map(d => d.date === payload.new.date ? payload.new : d));
          } else if (payload.eventType === 'DELETE') {
            setDailyAnalytics(prev => prev.filter(d => d.date !== payload.old.date));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(devicesChannel);
      supabase.removeChannel(boardsChannel);
      supabase.removeChannel(logsChannel);
      supabase.removeChannel(dailyAnalyticsChannel);
    };
  }, [user]);

  if (loading) {
    return <Loader message="Analyzing power consumption..." />;
  }

  // Helper to estimate device wattage based on name
  const getDeviceWattage = (name) => {
    const n = name.toLowerCase();
    if (n.includes('ac') || n.includes('air conditioner')) return 1800;
    if (n.includes('heater') || n.includes('geyser') || n.includes('boiler')) return 1500;
    if (n.includes('pump') || n.includes('motor')) return 750;
    if (n.includes('microwave') || n.includes('oven')) return 1200;
    if (n.includes('fridge') || n.includes('refrigerator')) return 200;
    if (n.includes('tv') || n.includes('television') || n.includes('computer') || n.includes('pc')) return 150;
    if (n.includes('fan')) return 75;
    if (n.includes('light') || n.includes('lamp') || n.includes('bulb')) return 12;
    return 60; // default wattage
  };

  // Real calculations: Compute actual duration (in hours) a device has been running today
  const getDeviceRunHoursToday = (device, deviceLogs) => {
    let totalMs = 0;
    const now = new Date();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Filter logs for this device
    const dLogs = deviceLogs.filter(l => l.device_id === device.id);

    if (dLogs.length === 0) {
      if (device.is_on) {
        // Device is currently ON and has been ON all day (or since last_changed)
        const lastChanged = device.last_changed ? new Date(device.last_changed) : startOfToday;
        const startTime = Math.max(lastChanged.getTime(), startOfToday.getTime());
        return Math.max(0, (now.getTime() - startTime) / (1000 * 60 * 60));
      }
      return 0;
    }

    // Process logs chronologically to reconstruct state intervals
    let isCurrentlyOn = false;
    let lastOnTime = null;

    // If the first log of today is a "turn OFF" action, it implies it was ON from midnight
    if (dLogs[0].action?.toLowerCase().includes('off')) {
      isCurrentlyOn = true;
      lastOnTime = startOfToday.getTime();
    }

    for (const log of dLogs) {
      const logTime = new Date(log.created_at).getTime();
      const isOnAction = log.action?.toLowerCase().includes('on') || log.action?.toLowerCase().includes('activate');
      
      if (isOnAction) {
        if (!isCurrentlyOn) {
          isCurrentlyOn = true;
          lastOnTime = logTime;
        }
      } else {
        if (isCurrentlyOn) {
          isCurrentlyOn = false;
          if (lastOnTime !== null) {
            totalMs += Math.max(0, logTime - lastOnTime);
          }
          lastOnTime = null;
        }
      }
    }

    // If the device is still ON, add time from last switch until now
    if (isCurrentlyOn && lastOnTime !== null) {
      totalMs += Math.max(0, now.getTime() - lastOnTime);
    }

    return totalMs / (1000 * 60 * 60);
  };

  // Helper to calculate exact milliseconds of device activity inside a specific window
  const getDeviceRunMsInWindow = (device, deviceLogs, windowStart, windowEnd) => {
    const dLogs = deviceLogs.filter(l => l.device_id === device.id);
    const now = new Date().getTime();

    if (dLogs.length === 0) {
      if (device.is_on) {
        const lastChanged = device.last_changed ? new Date(device.last_changed).getTime() : windowStart;
        const activeStart = Math.max(lastChanged, windowStart);
        const activeEnd = Math.min(now, windowEnd);
        return Math.max(0, activeEnd - activeStart);
      }
      return 0;
    }

    let isCurrentlyOn = false;
    let lastOnTime = null;

    // Check state prior to windowStart
    const priorLogs = dLogs.filter(l => new Date(l.created_at).getTime() < windowStart);
    if (priorLogs.length > 0) {
      const lastPriorLog = priorLogs[priorLogs.length - 1];
      if (lastPriorLog.action?.toLowerCase().includes('on') || lastPriorLog.action?.toLowerCase().includes('activate')) {
        isCurrentlyOn = true;
        lastOnTime = windowStart;
      }
    } else if (dLogs[0].action?.toLowerCase().includes('off')) {
      isCurrentlyOn = true;
      lastOnTime = windowStart;
    }

    let activeMs = 0;

    for (const log of dLogs) {
      const logTime = new Date(log.created_at).getTime();
      if (logTime < windowStart) continue;
      if (logTime > windowEnd) break;

      const isOnAction = log.action?.toLowerCase().includes('on') || log.action?.toLowerCase().includes('activate');

      if (isOnAction) {
        if (!isCurrentlyOn) {
          isCurrentlyOn = true;
          lastOnTime = logTime;
        }
      } else {
        if (isCurrentlyOn) {
          isCurrentlyOn = false;
          if (lastOnTime !== null) {
            activeMs += Math.max(0, logTime - lastOnTime);
          }
          lastOnTime = null;
        }
      }
    }

    if (isCurrentlyOn && lastOnTime !== null) {
      const activeEnd = Math.min(now, windowEnd);
      activeMs += Math.max(0, activeEnd - lastOnTime);
    }

    return activeMs;
  };

  // If there is no data, show an empty state
  if (boards.length === 0 || devices.length === 0) {
    return (
      <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] max-md:pb-[96px] min-h-[70vh] flex flex-col justify-center items-center select-none">
        <div className="text-center max-w-md flex flex-col items-center gap-4 p-8 border border-border bg-card rounded-[24px] shadow-lg backdrop-blur-md animate-scale-in">
          <div className="w-12 h-12 rounded-2xl bg-accent-bg flex items-center justify-center text-accent border border-accent/20 shadow-gold-glow">
            <TrendingUp size={24} className="stroke-[2.5px]" />
          </div>
          <h2 className="text-base font-extrabold text-text tracking-tight mt-2">No Power Analytics Data Yet</h2>
          <p className="text-xs text-text-muted font-semibold leading-relaxed px-4">
            Please register your first ESP32 Board and add devices on the Dashboard. Once devices are active, real-time power audit data and consumption charts will appear here.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 mt-2 w-full">
            <button
              onClick={() => window.location.href = '/'}
              className="flex-1 inline-flex min-h-[36px] items-center justify-center rounded-xl bg-accent text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer"
            >
              Dashboard
            </button>
            <button
              onClick={() => fetchData(false)}
              className="flex-1 inline-flex min-h-[36px] items-center justify-center rounded-xl border border-border bg-card text-xs font-extrabold text-text transition-all hover:bg-card-alt cursor-pointer"
            >
              <RotateCw size={13} className="stroke-[2.5px] mr-1.5" />
              Refresh
            </button>
            <button
              onClick={() => setShowOnboarding(true)}
              className="flex-1 inline-flex min-h-[36px] items-center justify-center rounded-xl border border-border bg-card text-xs font-extrabold text-text transition-all hover:bg-card-alt cursor-pointer"
            >
              User Guide
            </button>
          </div>
        </div>
        <OnboardingGuide isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </div>
    );
  }

  // Calculate actual metrics using device runtime statistics
  const deviceStats = devices.map(device => {
    const runHours = getDeviceRunHoursToday(device, logs);
    const wattage = getDeviceWattage(device.name);
    const kwh = (wattage * runHours) / 1000;
    return {
      ...device,
      runHours,
      wattage,
      kwh
    };
  });

  const totalKwhToday = deviceStats.reduce((sum, d) => sum + d.kwh, 0);
  const estimatedCostToday = totalKwhToday * (userSettings.tariff_per_kwh || 8.00); // user-configured tariff

  // Current live load (relay ON)
  const activeDevices = devices.filter(d => d.is_on);
  const currentDraw = activeDevices.reduce((sum, d) => sum + getDeviceWattage(d.name), 0);

  // Generate hourly consumption data binned exactly from log timestamps
  const hourlyData = Array.from({ length: 24 }).map((_, i) => {
    const targetHourDate = new Date();
    targetHourDate.setHours(new Date().getHours() - (23 - i), 0, 0, 0);
    const nextHourDate = new Date(targetHourDate.getTime() + 60 * 60 * 1000);
    
    let totalUsageInHour = 0;
    devices.forEach(device => {
      const runMsInHour = getDeviceRunMsInWindow(device, logs, targetHourDate.getTime(), nextHourDate.getTime());
      const wattage = getDeviceWattage(device.name);
      totalUsageInHour += (wattage * (runMsInHour / (1000 * 60 * 60))) / 1000;
    });

    return {
      time: `${targetHourDate.getHours().toString().padStart(2, '0')}:00`,
      Usage: parseFloat(totalUsageInHour.toFixed(4))
    };
  });

  // Calculate board usage based on actual runtime
  const boardData = boards.map(board => {
    const boardDevices = deviceStats.filter(d => d.board_id === board.id);
    const usage = boardDevices.reduce((sum, d) => sum + d.kwh, 0);
    return {
      name: board.name,
      Usage: parseFloat(usage.toFixed(4))
    };
  });

  // Filter device shares to only display running loads
  const pieData = deviceStats.map(d => {
    return {
      id: d.id,
      name: d.name,
      value: parseFloat(d.kwh.toFixed(4))
    };
  }).filter(item => item.value > 0);

  const COLORS = ['#c9a84c', '#e6c875', '#ffd700', '#f4e0a5', '#bfa054', '#8c7030', '#e5c158', '#ffd670'];

  return (
    <div className="mx-auto w-[min(100%-32px,960px)] pt-[104px] pb-8 animate-fade-up max-md:w-[min(100%-24px,620px)] max-md:pt-[92px] max-md:pb-[96px]">
      
      {/* Header section with buttons */}
      <div className="ml-1 mb-6 flex flex-wrap items-center justify-between gap-4 select-none">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-black uppercase tracking-wider text-text">Power Analytics</h1>
          <span className="text-xs font-bold text-text-muted">Monitor and audit energy consumption across your home.</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExportData}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-[#217346] hover:bg-[#1e6b3e] text-white px-3 py-1 text-xs font-extrabold transition-all duration-250 cursor-pointer shadow-[0_4px_12px_rgba(33,115,70,0.25)] whitespace-nowrap"
            title="Export Master Data to Excel"
          >
            <FileSpreadsheet size={14} className="stroke-[2.5px]" />
            Export Data
          </button>
          <button
            onClick={() => fetchData(false)}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1 text-xs font-extrabold text-text transition-all hover:bg-card-alt cursor-pointer"
            title="Refresh Data"
          >
            <RotateCw size={14} className="stroke-[2.5px]" />
            Refresh
          </button>
          <button
            onClick={() => setShowOnboarding(true)}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1 text-xs font-extrabold text-text transition-all hover:bg-card-alt cursor-pointer"
          >
            <HelpCircle size={14} className="stroke-[2.5px]" />
            User Guide
          </button>
          <button
            onClick={() => setShowPowerGuide(true)}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-xs font-extrabold text-[#0a0800] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer"
          >
            How it Works
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <section className="grid grid-cols-3 gap-4 mb-6 max-md:grid-cols-1">
        <article className="border border-border bg-card p-5 rounded-2xl shadow-lg backdrop-blur-md">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted block mb-1">Total Consumption Today</span>
          <div className="text-2xl font-black text-accent">{totalKwhToday.toFixed(4)} <span className="text-sm text-text-muted">kWh</span></div>
        </article>

        <article className="border border-border bg-card p-5 rounded-2xl shadow-lg backdrop-blur-md">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted block mb-1">Current Realtime Draw</span>
          <div className="text-2xl font-black text-accent">{currentDraw} <span className="text-sm text-text-muted">Watts</span></div>
          <span className="text-[10px] font-bold text-text-muted block mt-1">
            ⚡ {(currentDraw / (userSettings.voltage || 230)).toFixed(2)} A (Current at {userSettings.voltage || 230}V)
          </span>
        </article>

        <article className="border border-border bg-card p-5 rounded-2xl shadow-lg backdrop-blur-md font-bold">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted block mb-1">Estimated Cost Today</span>
          <div className="text-2xl font-black text-accent">{userSettings.currency === 'USD' ? '$' : userSettings.currency === 'EUR' ? '€' : '₹'}{estimatedCostToday.toFixed(4)} <span className="text-xs text-text-muted font-bold">(₹{userSettings.tariff_per_kwh}/kWh)</span></div>
          <Link href="/profile" className="text-[10px] font-bold text-accent/70 hover:text-accent mt-1 flex items-center gap-1 cursor-pointer">
            <Settings size={9} /> Adjust tariff & voltage
          </Link>
        </article>
      </section>

      <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1 mb-6">
        {/* Hourly Usage Trend */}
        <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[340px]">
          <h2 className="text-xs font-black uppercase tracking-wider text-text mb-4">Hourly Usage Trend (Last 24 Hours)</h2>
          <div className="flex-1 w-full min-h-[250px]">
            {totalKwhToday === 0 ? (
              <div className="grid h-full place-items-center text-xs font-bold text-text-muted select-none text-center px-4">
                No consumption logged today yet. Turn ON devices to monitor trends.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#c9a84c" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="time" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                  <YAxis stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}
                    itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="Usage" stroke="#c9a84c" strokeWidth={2} fillOpacity={1} fill="url(#colorUsage)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Board Consumption */}
        <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[340px]">
          <h2 className="text-xs font-black uppercase tracking-wider text-text mb-4">Daily Usage by Board (Real kWh)</h2>
          <div className="flex-1 w-full min-h-[250px]">
            {boardData.every(b => b.Usage === 0) ? (
              <div className="grid h-full place-items-center text-xs font-bold text-text-muted select-none text-center px-4">
                No active load on boards to display.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={boardData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="name" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                  <YAxis stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}
                    itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="Usage" fill="#c9a84c" radius={[4, 4, 0, 0]}>
                    {boardData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* Share Breakdown Pie Chart */}
      <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[340px]">
        <h2 className="text-xs font-black uppercase tracking-wider text-text mb-2">Power Load Allocation (Device Wattages)</h2>
        <div className="flex-1 flex max-md:flex-col items-center justify-around gap-4 min-h-[250px]">
          {pieData.length === 0 ? (
            <div className="text-xs font-bold text-text-muted select-none text-center px-4">
              No consumption recorded yet today. Turn ON devices to populate distribution data.
            </div>
          ) : (
            <>
              <div className="w-[200px] h-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }}
                      itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Custom Legend */}
              <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2 overflow-y-auto max-h-[200px]">
                {pieData.map((item, index) => {
                  const percent = ((item.value / pieData.reduce((a, b) => a + b.value, 0)) * 100).toFixed(0);
                  return (
                    <div key={item.id} className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-[11px] font-bold text-text truncate max-w-[120px]">{item.name}</span>
                      <span className="text-[10px] font-extrabold text-text-muted">{percent}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Historical Daily Consumption (Last 30 Days) */}
      <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[340px] mt-6">
        <h2 className="text-xs font-black uppercase tracking-wider text-text mb-4">Historical Daily Consumption (Last 30 Days)</h2>
        <div className="flex-1 w-full min-h-[250px]">
          {dailyAnalytics.length === 0 ? (
            <div className="grid h-full place-items-center text-xs font-bold text-text-muted select-none text-center px-4">
              No historical daily summary calculated yet. Check back tomorrow!
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyAnalytics} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis 
                  dataKey="date" 
                  stroke="#666" 
                  tick={{ fontSize: 9, fontWeight: 'bold' }} 
                  tickFormatter={(str) => {
                    const d = new Date(str);
                    return isNaN(d.getTime()) ? str : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  }}
                />
                <YAxis stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }}
                  formatter={(value, name) => {
                    if (name === "total_kwh") return [`${value} kWh`, "Energy"];
                    if (name === "total_cost") return [`₹${value}`, "Cost"];
                    if (name === "avg_on_time") return [`${value} hrs`, "Avg Active Time"];
                    return [value, name];
                  }}
                />
                <Bar dataKey="total_kwh" fill="#c9a84c" radius={[4, 4, 0, 0]}>
                  {dailyAnalytics.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ── Phase 1 Charts: 5 Core Insight Charts ───────────────── */}

      {/* Chart 1: Device Uptime — Horizontal Bar */}
      {(() => {
        const uptimeData = deviceStats
          .map(d => ({ name: d.name, Hours: parseFloat(d.runHours.toFixed(2)) }))
          .sort((a, b) => b.Hours - a.Hours);
        const hasData = uptimeData.some(d => d.Hours > 0);
        return (
          <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[300px] mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-accent stroke-[2.5px]" />
              <h2 className="text-xs font-black uppercase tracking-wider text-text">Device Uptime Today (Hours ON)</h2>
            </div>
            <div className="flex-1 w-full min-h-[220px]">
              {!hasData ? (
                <div className="grid h-full place-items-center text-xs font-bold text-text-muted text-center px-4">No uptime recorded today. Turn devices ON to see data.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={uptimeData} layout="vertical" margin={{ top: 4, right: 24, left: 10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                    <XAxis type="number" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} unit="h" />
                    <YAxis type="category" dataKey="name" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="Hours" radius={[0, 4, 4, 0]}>
                      {uptimeData.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        );
      })()}

      {/* Chart 2: Activity Heatmap — 24-hour bar */}
      {(() => {
        const heatmapData = Array.from({ length: 24 }, (_, h) => {
          const label = `${String(h).padStart(2, '0')}:00`;
          const count = logs.filter(l => new Date(l.created_at).getHours() === h).length;
          return { hour: label, Events: count };
        });
        const hasData = heatmapData.some(d => d.Events > 0);
        return (
          <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[300px] mt-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-accent stroke-[2.5px]" />
              <h2 className="text-xs font-black uppercase tracking-wider text-text">Activity Heatmap — Peak Usage Hours (Today)</h2>
            </div>
            <div className="flex-1 w-full min-h-[220px]">
              {!hasData ? (
                <div className="grid h-full place-items-center text-xs font-bold text-text-muted text-center px-4">No activity logged today. Interact with devices to populate this chart.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={heatmapData} margin={{ top: 4, right: 10, left: -28, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="hour" stroke="#666" tick={{ fontSize: 8, fontWeight: 'bold' }} interval={2} />
                    <YAxis stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="Events" radius={[3, 3, 0, 0]}>
                      {heatmapData.map((entry, i) => (
                        <Cell key={i} fill={entry.Events === Math.max(...heatmapData.map(d => d.Events)) ? '#ffd700' : '#c9a84c'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        );
      })()}

      {/* Chart 3 + 4: Ghost Device Pie + Week-over-Week Line side by side */}
      <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1 mt-6">
        {/* Chart 3: Ghost Device Detector */}
        {(() => {
          const activeDevices2 = deviceStats.filter(d => d.runHours > 0 || d.kwh > 0);
          const ghostDevices = deviceStats.filter(d => d.runHours === 0 && d.kwh === 0);
          const ghostPie = [
            { name: 'Active', value: activeDevices2.length, fill: '#c9a84c' },
            { name: 'Idle / Ghost', value: ghostDevices.length, fill: '#444' }
          ].filter(d => d.value > 0);
          return (
            <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[300px]">
              <div className="flex items-center gap-2 mb-4">
                <Ghost size={14} className="text-accent stroke-[2.5px]" />
                <h2 className="text-xs font-black uppercase tracking-wider text-text">Ghost Device Detector</h2>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[200px]">
                {ghostDevices.length === 0 && activeDevices2.length === 0 ? (
                  <div className="text-xs font-bold text-text-muted text-center px-4">No device data available yet.</div>
                ) : (
                  <>
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie data={ghostPie} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
                          {ghostPie.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 text-xs font-bold">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#c9a84c] inline-block" />Active ({activeDevices2.length})</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#444] inline-block" />Idle ({ghostDevices.length})</span>
                    </div>
                    {ghostDevices.length > 0 && (
                      <div className="text-[10px] font-semibold text-text-muted text-center px-2">
                        Idle: {ghostDevices.map(d => d.name).join(', ')}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })()}

        {/* Chart 4: Week-over-Week kWh Trend */}
        {(() => {
          const thisWeek = weeklyAnalytics[0];
          const lastWeek = weeklyAnalytics[1];
          // Build a 7-day comparison using dailyAnalytics for this week and weekly snapshot for last
          const thisWeekDays = dailyAnalytics.slice(-7).map(d => ({
            date: d.date,
            'This Week': parseFloat((d.total_kwh || 0).toFixed(4)),
            'Last Week': 0
          }));
          // Spread last week total evenly across 7 days for comparison line
          const lastWeekDailyAvg = lastWeek ? parseFloat((lastWeek.total_kwh / 7).toFixed(4)) : 0;
          const wowData = thisWeekDays.map(d => ({ ...d, 'Last Week': lastWeekDailyAvg }));
          const hasData = wowData.some(d => d['This Week'] > 0);
          return (
            <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[300px]">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={14} className="text-accent stroke-[2.5px]" />
                <h2 className="text-xs font-black uppercase tracking-wider text-text">Week-over-Week kWh Trend</h2>
              </div>
              <div className="flex-1 w-full min-h-[220px]">
                {!hasData ? (
                  <div className="grid h-full place-items-center text-xs font-bold text-text-muted text-center px-4">Need at least 1 day of data this week to show trends.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={wowData} margin={{ top: 4, right: 10, left: -28, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="date" stroke="#666" tick={{ fontSize: 8, fontWeight: 'bold' }}
                        tickFormatter={s => { const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }} />
                      <YAxis stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                      <Line type="monotone" dataKey="This Week" stroke="#c9a84c" strokeWidth={2} dot={false} />
                      {lastWeek && <Line type="monotone" dataKey="Last Week" stroke="#555" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          );
        })()}
      </div>

      {/* Chart 5: Board / Room Radar */}
      {(() => {
        const radarData = boards.map(board => {
          const boardDevices = deviceStats.filter(d => d.board_id === board.id);
          const totalHours = boardDevices.reduce((s, d) => s + d.runHours, 0);
          return { board: board.name, 'Active Hours': parseFloat(totalHours.toFixed(2)) };
        });
        const hasData = radarData.some(d => d['Active Hours'] > 0);
        return (
          <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[340px] mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={14} className="text-accent stroke-[2.5px]" />
              <h2 className="text-xs font-black uppercase tracking-wider text-text">Board / Room Activity Radar</h2>
            </div>
            <div className="flex-1 w-full min-h-[250px]">
              {!hasData || boards.length < 2 ? (
                <div className="grid h-full place-items-center text-xs font-bold text-text-muted text-center px-4">Add at least 2 boards with active devices to see the room activity radar.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                    <PolarGrid stroke="#333" />
                    <PolarAngleAxis dataKey="board" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#aaa' }} />
                    <PolarRadiusAxis tick={{ fontSize: 8, fill: '#666' }} />
                    <Radar dataKey="Active Hours" stroke="#c9a84c" fill="#c9a84c" fillOpacity={0.35} />
                    <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        );
      })()}

      {/* ── Phase 2 Charts: 5 Advanced Insight Charts ───────────── */}

      {/* Chart 6 + 7: Scatter + Reliability side by side */}
      <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1 mt-6">
        {/* Chart 6: Toggle Frequency vs. Duration Scatter */}
        {(() => {
          const latestWeek = weeklyAnalytics[0];
          const scatterData = devices.map(dev => {
            const toggles = latestWeek ? parseInt(latestWeek.toggle_counts?.[dev.id] || 0) : logs.filter(l => l.device_id === dev.id).length;
            const minutes = latestWeek ? parseFloat(latestWeek.usage_duration?.[dev.id] || 0) : parseFloat((getDeviceRunHoursToday(dev, logs) * 60).toFixed(1));
            const avgPerToggle = toggles > 0 ? parseFloat((minutes / toggles).toFixed(1)) : 0;
            return { name: dev.name, toggles, avgMinutes: avgPerToggle };
          }).filter(d => d.toggles > 0 || d.avgMinutes > 0);
          return (
            <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[300px]">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={14} className="text-accent stroke-[2.5px]" />
                <h2 className="text-xs font-black uppercase tracking-wider text-text">Toggle Frequency vs. Session Duration</h2>
              </div>
              <div className="flex-1 w-full min-h-[220px]">
                {scatterData.length === 0 ? (
                  <div className="grid h-full place-items-center text-xs font-bold text-text-muted text-center px-4">No toggle data yet. Start using devices to populate this chart.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis type="number" dataKey="toggles" name="Toggles" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} label={{ value: 'Toggles', position: 'insideBottom', offset: -4, fontSize: 9, fill: '#666' }} />
                      <YAxis type="number" dataKey="avgMinutes" name="Avg Min/Toggle" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} label={{ value: 'Avg Min/Toggle', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#666' }} />
                      <ZAxis range={[40, 160]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }}
                        content={({ payload }) => payload?.length ? (
                          <div style={{ background: '#111', border: '1px solid #c9a84c', borderRadius: 8, padding: '6px 10px' }}>
                            <p style={{ color: '#fff', fontSize: 10, fontWeight: 'bold', margin: 0 }}>{payload[0]?.payload?.name}</p>
                            <p style={{ color: '#c9a84c', fontSize: 10, margin: 0 }}>Toggles: {payload[0]?.payload?.toggles}</p>
                            <p style={{ color: '#c9a84c', fontSize: 10, margin: 0 }}>Avg: {payload[0]?.payload?.avgMinutes} min/toggle</p>
                          </div>
                        ) : null}
                      />
                      <Scatter data={scatterData} fill="#c9a84c" />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          );
        })()}

        {/* Chart 7: Hardware Reliability Radial Gauge */}
        {(() => {
          const errorDevices = devices.filter(d => d.feedback_on !== null && d.is_on !== d.feedback_on);
          const reliabilityPct = devices.length > 0 ? Math.round(((devices.length - errorDevices.length) / devices.length) * 100) : 100;
          const gaugeColor = reliabilityPct >= 90 ? '#22c55e' : reliabilityPct >= 70 ? '#f59e0b' : '#ef4444';
          const gaugeData = [{ name: 'Reliability', value: reliabilityPct, fill: gaugeColor }];
          return (
            <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[300px]">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={14} className="text-accent stroke-[2.5px]" />
                <h2 className="text-xs font-black uppercase tracking-wider text-text">Hardware Reliability Score</h2>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
                <div className="relative">
                  <ResponsiveContainer width={160} height={160}>
                    <RadialBarChart cx="50%" cy="50%" innerRadius={48} outerRadius={72} startAngle={220} endAngle={-40} data={gaugeData}>
                      <RadialBar dataKey="value" cornerRadius={6} background={{ fill: '#222' }} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black" style={{ color: gaugeColor }}>{reliabilityPct}%</span>
                    <span className="text-[10px] font-bold text-text-muted">Reliability</span>
                  </div>
                </div>
                {errorDevices.length > 0 && (
                  <p className="text-[10px] font-semibold text-text-muted mt-2 text-center px-3">
                    ⚠ Mismatch on: {errorDevices.map(d => d.name).join(', ')}
                  </p>
                )}
              </div>
            </section>
          );
        })()}
      </div>

      {/* Chart 8: Automation Optimization Suggestions */}
      {(() => {
        const latestWeek = weeklyAnalytics[0];
        const peakMap = latestWeek?.peak_hours || {};
        const sortedPeaks = Object.entries(peakMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([hour, count]) => ({ hour, count: parseInt(count) }));
        // Build 24 hour chart with reference lines for peak suggestions
        const automationData = Array.from({ length: 24 }, (_, h) => {
          const label = `${String(h).padStart(2, '0')}:00`;
          return { hour: label, Events: parseInt(peakMap[label] || 0) };
        });
        const hasData = automationData.some(d => d.Events > 0);
        return (
          <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[340px] mt-6">
            <div className="flex items-center gap-2 mb-1">
              <Settings size={14} className="text-accent stroke-[2.5px]" />
              <h2 className="text-xs font-black uppercase tracking-wider text-text">Automation Optimization — Suggested Schedule Windows</h2>
            </div>
            {sortedPeaks.length > 0 && (
              <p className="text-[10px] font-semibold text-text-muted mb-3">
                🔍 Your top activity windows this week: {sortedPeaks.map(p => `${p.hour} (${p.count} events)`).join(' · ')}. Consider creating schedules for these hours.
              </p>
            )}
            <div className="flex-1 w-full min-h-[230px]">
              {!hasData ? (
                <div className="grid h-full place-items-center text-xs font-bold text-text-muted text-center px-4">Weekly data needed to surface automation suggestions. Check back after a full week of usage.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={automationData} margin={{ top: 4, right: 10, left: -28, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="hour" stroke="#666" tick={{ fontSize: 8, fontWeight: 'bold' }} interval={2} />
                    <YAxis stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ color: '#c9a84c', fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="Events" fill="#c9a84c" radius={[3, 3, 0, 0]} opacity={0.7} />
                    {sortedPeaks.map((p, i) => (
                      <ReferenceLine key={i} x={p.hour} stroke="#ffd700" strokeDasharray="4 3" strokeWidth={1.5}
                        label={{ value: '⚡ Auto', position: 'top', fontSize: 8, fill: '#ffd700', fontWeight: 'bold' }} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        );
      })()}

      {/* Chart 9 + 10: Always-On Warning + Relay Stack side by side */}
      <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1 mt-6 mb-4">
        {/* Chart 9: Always-On Warning */}
        {(() => {
          const latestWeek = weeklyAnalytics[0];
          const alwaysOnThresholdMin = 60 * 20; // 20+ hours = suspicious always-on
          const alwaysOnData = devices.map(dev => {
            const minutes = latestWeek
              ? parseFloat(latestWeek.usage_duration?.[dev.id] || 0)
              : parseFloat((getDeviceRunHoursToday(dev, logs) * 60).toFixed(1));
            return { name: dev.name, Minutes: minutes, alwaysOn: minutes >= alwaysOnThresholdMin };
          }).sort((a, b) => b.Minutes - a.Minutes);
          const hasAlwaysOn = alwaysOnData.some(d => d.alwaysOn);
          return (
            <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[300px]">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className={`stroke-[2.5px] ${hasAlwaysOn ? 'text-red-400' : 'text-accent'}`} />
                <h2 className="text-xs font-black uppercase tracking-wider text-text">Always-On Warning</h2>
              </div>
              {hasAlwaysOn && <p className="text-[10px] font-bold text-red-400 mb-3">⚠ Devices running 20+ hours detected — check if intentional!</p>}
              <div className="flex-1 w-full min-h-[200px]">
                {alwaysOnData.every(d => d.Minutes === 0) ? (
                  <div className="grid h-full place-items-center text-xs font-bold text-text-muted text-center px-4">No sustained uptime detected yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={alwaysOnData} layout="vertical" margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                      <XAxis type="number" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} unit="m" />
                      <YAxis type="category" dataKey="name" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} width={85} />
                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ fontSize: '10px', fontWeight: 'bold' }} formatter={v => [`${v} min`, 'Uptime']} />
                      <Bar dataKey="Minutes" radius={[0, 4, 4, 0]}>
                        {alwaysOnData.map((entry, i) => <Cell key={i} fill={entry.alwaysOn ? '#ef4444' : '#c9a84c'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          );
        })()}

        {/* Chart 10: Relay Distribution Load (Stacked Bar by relay_index) */}
        {(() => {
          const relayColors = ['#c9a84c', '#e6c875', '#8c7030', '#ffd670'];
          const relayData = boards.map(board => {
            const entry = { board: board.name };
            for (let r = 0; r <= 3; r++) {
              const dev = deviceStats.find(d => d.board_id === board.id && d.relay_index === r);
              entry[`Relay ${r}`] = dev ? parseFloat(dev.runHours.toFixed(2)) : 0;
            }
            return entry;
          });
          const hasData = relayData.some(b => [0,1,2,3].some(r => b[`Relay ${r}`] > 0));
          return (
            <section className="border border-border bg-card p-5 rounded-2xl shadow-lg flex flex-col min-h-[300px]">
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={14} className="text-accent stroke-[2.5px]" />
                <h2 className="text-xs font-black uppercase tracking-wider text-text">Relay Distribution Load</h2>
              </div>
              <div className="flex-1 w-full min-h-[200px]">
                {!hasData ? (
                  <div className="grid h-full place-items-center text-xs font-bold text-text-muted text-center px-4">No relay load data yet. Devices need to be actively running.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={relayData} margin={{ top: 4, right: 10, left: -28, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="board" stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                      <YAxis stroke="#666" tick={{ fontSize: 9, fontWeight: 'bold' }} unit="h" />
                      <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #c9a84c', borderRadius: '8px' }} itemStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                      {[0,1,2,3].map(r => (
                        <Bar key={r} dataKey={`Relay ${r}`} stackId="a" fill={relayColors[r]} radius={r === 3 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          );
        })()}
      </div>

      {/* Onboarding Guide Modal */}
      <OnboardingGuide isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* Power Calculation & System Guide Modal */}
      {showPowerGuide && (
        <div 
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-6 backdrop-blur-md animate-fade-in"
          onClick={() => setShowPowerGuide(false)}
        >
          <div 
            className="w-[min(100%,500px)] max-h-[85vh] overflow-y-auto rounded-[24px] border border-border bg-card p-6 shadow-2xl flex flex-col gap-4 animate-scale-in select-none text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2 text-accent">
                <TrendingUp size={18} className="stroke-[2.5px]" />
                <h3 className="text-base font-extrabold text-text tracking-tight">How Power is Calculated</h3>
              </div>
              <button 
                onClick={() => setShowPowerGuide(false)} 
                className="text-text-muted hover:text-accent p-1 rounded-lg hover:bg-white/5 cursor-pointer border-none bg-transparent"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex flex-col gap-4 text-xs font-bold leading-relaxed text-text mt-1">
              <div className="flex flex-col gap-1.5">
                <h4 className="text-accent font-extrabold">1. Real-Time Current Estimation</h4>
                <div className="text-text-muted">The system detects active devices (confirming current is flowing) and maps them to standard appliance wattages:
                  <ul className="list-disc pl-4 mt-1.5 flex flex-col gap-1 text-[11px] text-text-muted font-semibold">
                    <li><strong>Air Conditioner:</strong> 1800 Watts</li>
                    <li><strong>Water Heater / Geyser:</strong> 1500 Watts</li>
                    <li><strong>Microwave / Oven:</strong> 1200 Watts</li>
                    <li><strong>Water Pump / Motor:</strong> 750 Watts</li>
                    <li><strong>Refrigerator:</strong> 200 Watts</li>
                    <li><strong>Appliance Fan:</strong> 75 Watts</li>
                    <li><strong>Smart Bulb / Lamp:</strong> 12 Watts</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border/40 pt-3">
                <h4 className="text-accent font-extrabold">2. Mathematical Formulas</h4>
                <div className="text-text-muted">
                  The model uses standardized electrical billing equations:
                  <div className="bg-bg/60 border border-border/50 rounded-xl p-3 my-2 font-mono text-[10px] flex flex-col gap-1.5 text-text">
                    <div>⚡ Power (W) = Voltage ({userSettings.voltage}V) × Current (Amps)</div>
                    <div>📊 Energy (kWh) = [Power (Watts) × Hours used] / 1000</div>
                    <div>💰 Cost = Energy (kWh) × Rate ({userSettings.currency === 'USD' ? '$' : userSettings.currency === 'EUR' ? '€' : '₹'}{userSettings.tariff_per_kwh}/kWh)</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border/40 pt-3">
                <h4 className="text-accent font-extrabold">3. Physical AC Current Feedback</h4>
                <p className="text-text-muted">By reading physical current lines through optocoupler modules, the system monitors manual switches. Even if the website is closed or offline, physical toggles are correctly logged, providing full analytics accuracy.</p>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border/40 pt-3">
                <h4 className="text-accent font-extrabold">4. Customize Tariff &amp; Voltage</h4>
                <p className="text-text-muted">You can adjust your electricity tariff rate and household voltage in your <Link href="/profile" className="text-accent underline" onClick={() => setShowPowerGuide(false)}>Profile Settings</Link>. This ensures cost calculations match your actual electricity bill.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
