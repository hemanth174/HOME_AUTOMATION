'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Loader from '@/components/Loader';
import OnboardingGuide from '@/components/OnboardingGuide';
import { HelpCircle, TrendingUp, X, RotateCw } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';

export default function AnalyticsPage() {
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [boards, setBoards] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyAnalytics, setDailyAnalytics] = useState([]);
  
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

      const [devicesRes, boardsRes, logsRes, dailyAnalyticsRes] = await Promise.all([
        supabase.from('devices').select('id, name, is_on, last_changed, board_id').eq('user_id', user.id),
        supabase.from('boards').select('id, name').eq('user_id', user.id),
        supabase.from('activity_logs')
          .select('id, device_id, action, created_at')
          .eq('user_id', user.id)
          .gte('created_at', startOfToday.toISOString())
          .order('created_at', { ascending: true }),
        supabase.from('daily_analytics')
          .select('date, total_kwh, total_cost, avg_on_time')
          .eq('user_id', user.id)
          .order('date', { ascending: true })
          .limit(30)
      ]);

      if (devicesRes.data) setDevices(devicesRes.data);
      if (boardsRes.data) setBoards(boardsRes.data);
      if (logsRes.data) setLogs(logsRes.data);
      if (dailyAnalyticsRes.data) setDailyAnalytics(dailyAnalyticsRes.data);
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
  const estimatedCostToday = totalKwhToday * 8.00; // ₹8.00 per kWh average cost

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
            ⚡ {(currentDraw / 230).toFixed(2)} A (Current at 230V)
          </span>
        </article>

        <article className="border border-border bg-card p-5 rounded-2xl shadow-lg backdrop-blur-md font-bold">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted block mb-1">Estimated Cost Today</span>
          <div className="text-2xl font-black text-accent">₹{estimatedCostToday.toFixed(4)} <span className="text-xs text-text-muted font-bold">(avg ₹8.00/kWh)</span></div>
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
                    <div>⚡ Power (W) = Voltage (230V) × Current (Amps)</div>
                    <div>📊 Energy (kWh) = [Power (Watts) × Hours used] / 1000</div>
                    <div>💰 Cost (₹) = Energy (kWh) × Rate (₹8.00 / kWh)</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border/40 pt-3">
                <h4 className="text-accent font-extrabold">3. Physical AC Current Feedback</h4>
                <p className="text-text-muted">By reading physical current lines through optocoupler modules, the system monitors manual switches. Even if the website is closed or offline, physical toggles are correctly logged, providing full analytics accuracy.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
