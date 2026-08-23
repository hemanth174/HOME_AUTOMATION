'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import Loader from '@/components/Loader';
import OnboardingGuide from '@/components/OnboardingGuide';
import Link from 'next/link';
import { HelpCircle, TrendingUp, X, RotateCw, FileSpreadsheet, Settings } from 'lucide-react';
import { getDeviceWattage, getDeviceRunHoursToday } from './helpers';

const AnalyticsCharts = dynamic(() => import('./AnalyticsCharts'));

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
  // (getDeviceWattage / getDeviceRunHoursToday are shared via ./helpers)

  // If there is no data, show an empty state
  if (boards.length === 0 || devices.length === 0) {
    return (
      <div className="relative w-full h-full">
        <div className="dashboard-container min-h-[70vh] flex flex-col justify-center items-center select-none animate-fade-up">
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
              className="flex-1 inline-flex min-h-[36px] items-center justify-center rounded-xl bg-accent text-xs font-extrabold text-[var(--btn-text)] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer"
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

  return (
    <div className="relative w-full h-full">
      <div className="dashboard-container animate-fade-up">
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
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-xs font-extrabold text-[var(--btn-text)] transition-all hover:bg-accent-hover shadow-gold-glow cursor-pointer"
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

      <AnalyticsCharts
        devices={devices}
        boards={boards}
        logs={logs}
        dailyAnalytics={dailyAnalytics}
        weeklyAnalytics={weeklyAnalytics}
        deviceStats={deviceStats}
        totalKwhToday={totalKwhToday}
      />
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
