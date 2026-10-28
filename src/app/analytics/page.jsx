'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import Loader from '@/components/Loader';
import OnboardingGuide from '@/components/OnboardingGuide';
import Link from 'next/link';
import { Download, FileText, HelpCircle, LoaderCircle, TrendingUp, X, RotateCw, Settings } from 'lucide-react';
import { getDeviceWattage, getDeviceRunHoursToday } from './helpers';

const AnalyticsCharts = dynamic(() => import('./AnalyticsCharts'));

const fetchImageDataUrl = async (src) => {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load image: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function AnalyticsPage() {
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [boards, setBoards] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyAnalytics, setDailyAnalytics] = useState([]);
  const [weeklyAnalytics, setWeeklyAnalytics] = useState([]);
  const [userSettings, setUserSettings] = useState({ tariff_per_kwh: 8.00, voltage: 230, currency: 'INR' });
  const fetchInFlightRef = useRef(false);

  // Guide and Tour States
  const [showPowerGuide, setShowPowerGuide] = useState(false);
  const [powerGuideY, setPowerGuideY] = useState(0);
  const [isPowerGuideDragging, setIsPowerGuideDragging] = useState(false);
  const powerGuideDragStartYRef = useRef(0);
  const powerGuideDragYRef = useRef(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPdfConfirm, setShowPdfConfirm] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    if (!showPdfConfirm) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !pdfBusy) setShowPdfConfirm(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showPdfConfirm, pdfBusy]);

  useEffect(() => {
    if (!showPowerGuide) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowPowerGuide(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showPowerGuide]);

  // Fetch devices, boards, and logs from today (memoized for recurring updates)
  const fetchData = useCallback(async (isSilent = false) => {
    if (!user || fetchInFlightRef.current) return false;
    fetchInFlightRef.current = true;
    if (!isSilent) setLoading(true);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    try {
      // Rollup/pruning is a maintenance action, not a live polling query.
      // Run it on initial/manual refresh only, never on each silent background refresh.
      if (!isSilent) {
        const { error: rollupError } = await supabase.rpc('summarize_and_prune_old_logs');
        if (rollupError) console.warn('Analytics rollup skipped:', rollupError.message);
      }

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

      const queryError = [devicesRes, boardsRes, logsRes, dailyAnalyticsRes, weeklyAnalyticsRes, settingsRes]
        .find((result) => result.error)?.error;
      if (queryError) throw queryError;

      if (devicesRes.data) setDevices(devicesRes.data);
      if (boardsRes.data) setBoards(boardsRes.data);
      if (logsRes.data) setLogs(logsRes.data);
      if (dailyAnalyticsRes.data) setDailyAnalytics(dailyAnalyticsRes.data);
      if (weeklyAnalyticsRes.data) setWeeklyAnalytics(weeklyAnalyticsRes.data);
      if (settingsRes.data) setUserSettings({ tariff_per_kwh: settingsRes.data.tariff_per_kwh, voltage: settingsRes.data.voltage, currency: settingsRes.data.currency });
      return true;
    } catch (err) {
      console.error('Failed to load analytics data', err);
      return false;
    } finally {
      fetchInFlightRef.current = false;
      if (!isSilent) setLoading(false);
    }
  }, [user]);

  const refreshAnalytics = useCallback(async () => {
    if (!user || fetchInFlightRef.current) return;
    setRefreshing(true);
    const refreshed = await fetchData(true);
    setRefreshing(false);
    window.dispatchEvent(new CustomEvent('show-global-toast', {
      detail: refreshed ? '✅ Analytics data refreshed.' : '⚠ Could not refresh analytics data. Please try again.',
    }));
  }, [fetchData, user]);

  const openPowerGuide = () => {
    setPowerGuideY(0);
    setShowPowerGuide(true);
  };

  const closePowerGuide = () => {
    setIsPowerGuideDragging(false);
    powerGuideDragYRef.current = 0;
    setPowerGuideY(0);
    setShowPowerGuide(false);
  };

  const handlePowerGuidePointerDown = (event) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (
      event.target instanceof Element &&
      event.target.closest("button,a,input,select,textarea,label,[role='button']")
    ) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    powerGuideDragStartYRef.current = event.clientY;
    powerGuideDragYRef.current = 0;
    setIsPowerGuideDragging(true);
  };

  const handlePowerGuidePointerMove = (event) => {
    if (!isPowerGuideDragging) return;
    const deltaY = Math.max(0, event.clientY - powerGuideDragStartYRef.current);
    if (event.cancelable) event.preventDefault();
    powerGuideDragYRef.current = deltaY;
    setPowerGuideY(deltaY);
  };

  const handlePowerGuidePointerEnd = () => {
    if (!isPowerGuideDragging) return;
    const shouldClose = powerGuideDragYRef.current > 96;
    setIsPowerGuideDragging(false);
    powerGuideDragYRef.current = 0;
    if (shouldClose) {
      setPowerGuideY(0);
      setShowPowerGuide(false);
    } else {
      setPowerGuideY(0);
    }
  };

  // Initial load
  useEffect(() => {
    if (user) {
      fetchData(false);
    }
  }, [user, fetchData]);

  // Background refresh every 2 minutes while visible. The dashboard already
  // receives device Realtime updates; analytics is a history view, not a 30s poll.
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData(true);
    }, 120000);
    return () => clearInterval(timer);
  }, [user, fetchData]);

  const handleDownloadPdf = async () => {
    if (!user || pdfBusy) return;

    setPdfBusy(true);
    setPdfError('');
    try {
      const reportStart = new Date();
      reportStart.setDate(reportStart.getDate() - 30);
      const [fullLogsRes, schedulesRes, alarmsRes] = await Promise.all([
        supabase.from('activity_logs')
          .select('created_at, device_name, action, triggered_by')
          .eq('user_id', user.id)
          .gte('created_at', reportStart.toISOString())
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.from('schedules')
          .select('time, days, action, enabled, devices(name)')
          .eq('user_id', user.id),
        supabase.from('alarms')
          .select('trigger_at, action, fired, devices(name)')
          .eq('user_id', user.id)
      ]);

      const queryError = fullLogsRes.error || schedulesRes.error || alarmsRes.error;
      if (queryError) throw new Error(queryError.message);

      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      let logoDataUrl = null;
      try {
        logoDataUrl = await fetchImageDataUrl('/vikatech-logo.png');
      } catch (logoError) {
        console.warn('Analytics PDF logo skipped:', logoError.message);
      }
      const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const generatedAt = new Date();
      const reportId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const boardById = new Map(boards.map((board) => [board.id, board.name]));
      const number = (value, digits = 2) => Number(value || 0).toFixed(digits);
      const date = (value) => value ? new Date(value).toLocaleString('en-IN') : 'Not recorded';
      const days = (value) => {
        if (!Array.isArray(value)) return value || 'Every day';
        if (value.length === 7) return 'Every day';
        return value.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(day)] || day).join(', ');
      };

      pdf.setProperties({
        title: `Power Analytics Report ${reportId}`,
        subject: 'Home energy and device overview',
        author: 'VikaTech Home Automation',
        keywords: `report-id:${reportId}`,
      });
      pdf.setFillColor(24, 24, 24);
      pdf.rect(0, 0, pageWidth, 34, 'F');
      let titleX = 14;
      if (logoDataUrl) {
        const logoProperties = pdf.getImageProperties(logoDataUrl);
        const logoHeight = 16;
        const logoWidth = (logoProperties.width / logoProperties.height) * logoHeight;
        pdf.addImage(logoDataUrl, 'PNG', 14, 7, logoWidth, logoHeight);
        titleX = 14 + logoWidth + 7;
      }
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.text('POWER ANALYTICS', titleX, 15);
      pdf.setTextColor(201, 168, 76);
      pdf.setFontSize(9);
      pdf.text('HOME AUTOMATION OVERVIEW', titleX, 22);
      pdf.setTextColor(210, 210, 210);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`Generated ${date(generatedAt)}`, pageWidth - 14, 15, { align: 'right' });
      pdf.text(`${devices.length} devices / ${boards.length} boards`, pageWidth - 14, 22, { align: 'right' });
      pdf.setFontSize(6.5);
      pdf.setTextColor(170, 170, 170);
      pdf.text(`Report ID ${reportId}`, pageWidth - 14, 29, { align: 'right' });

      let cursorY = 43;
      const addSection = (title, head, body) => {
        if (cursorY > pageHeight - 48) {
          pdf.addPage();
          cursorY = 18;
        }
        pdf.setTextColor(36, 36, 36);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(title, 14, cursorY);
        autoTable(pdf, {
          startY: cursorY + 4,
          head: [head],
          body: body.length ? body : [['No data available', ...Array(Math.max(0, head.length - 1)).fill('')]],
          theme: 'grid',
          margin: { left: 14, right: 14 },
          styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, textColor: [45, 45, 45], overflow: 'linebreak' },
          headStyles: { fillColor: [44, 44, 44], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [247, 245, 239] },
          columnStyles: { 0: { cellWidth: 'auto' } },
        });
        cursorY = pdf.lastAutoTable.finalY + 10;
      };

      addSection('Overview', ['Metric', 'Value', 'Details'], [
        ['Consumption today', `${number(totalKwhToday, 4)} kWh`, 'Calculated from device runtime'],
        ['Estimated cost today', `${userSettings.currency || 'INR'} ${number(estimatedCostToday, 4)}`, `Tariff ${number(userSettings.tariff_per_kwh, 2)} / kWh`],
        ['Current live draw', `${currentDraw} W`, `${number(currentDraw / (userSettings.voltage || 230), 2)} A at ${userSettings.voltage || 230} V`],
        ['Active devices', `${activeDevices.length} of ${devices.length}`, 'Current relay state'],
      ]);

      addSection('Current Devices', ['Board / room', 'Device', 'State', 'Watts', 'Hours today', 'kWh today'], deviceStats.map((device) => [
        boardById.get(device.board_id) || 'Unassigned',
        device.name || 'Unnamed device',
        device.is_on ? 'ON' : 'OFF',
        String(device.wattage),
        number(device.runHours),
        number(device.kwh, 4),
      ]));

      addSection('Daily Energy History (Last 30 Days)', ['Date', 'Energy kWh', 'Cost', 'Avg on-time', 'Usage duration'], dailyAnalytics.map((row) => [
        row.date || '-', number(row.total_kwh, 4), `${userSettings.currency || 'INR'} ${number(row.total_cost, 2)}`,
        `${number(row.avg_on_time)} hrs`, `${number(row.usage_duration)} hrs`,
      ]));

      addSection('Weekly Comparison', ['Week', 'Energy kWh', 'Cost', 'Usage duration'], weeklyAnalytics.map((row) => [
        `${row.week_start || '-'} to ${row.week_end || '-'}`,
        number(row.total_kwh, 4), `${userSettings.currency || 'INR'} ${number(row.total_cost, 2)}`,
        `${number(row.usage_duration)} hrs`,
      ]));

      addSection('Activity Log (Last 30 Days)', ['Timestamp', 'Device', 'Action', 'Triggered by'], (fullLogsRes.data || []).map((log) => [
        date(log.created_at), log.device_name || 'Unknown', log.action || '-', log.triggered_by || '-',
      ]));

      addSection('Automation Schedules', ['Device', 'Time', 'Days', 'Action', 'Status'], (schedulesRes.data || []).map((schedule) => [
        schedule.devices?.name || 'Unknown', schedule.time || '-', days(schedule.days),
        schedule.action ? 'ON' : 'OFF', schedule.enabled ? 'Active' : 'Disabled',
      ]));

      addSection('Alarms', ['Device', 'Trigger time', 'Action', 'Status'], (alarmsRes.data || []).map((alarm) => [
        alarm.devices?.name || 'Unknown', date(alarm.trigger_at), alarm.action ? 'ON' : 'OFF', alarm.fired ? 'Executed' : 'Pending',
      ]));

      const totalPages = pdf.internal.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        pdf.setPage(page);
        pdf.setDrawColor(220, 220, 220);
        pdf.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(120, 120, 120);
        pdf.text('VikaTech Home Automation', 14, pageHeight - 7);
        pdf.text(`Page ${page} of ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
      }

      pdf.save(`power-analytics-${generatedAt.toISOString().slice(0, 10)}-${reportId}.pdf`);
      setShowPdfConfirm(false);
    } catch (error) {
      console.error('Failed to generate analytics PDF:', error);
      setPdfError(error.message || 'Could not generate the PDF. Please try again.');
    } finally {
      setPdfBusy(false);
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
              onClick={refreshAnalytics}
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
      <div className="dashboard-container min-w-0 animate-fade-up">
      {/* Header section with buttons */}
      <div className="mb-5 flex flex-col gap-4 select-none sm:mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-col gap-1">
            <h1 className="min-w-0 text-[clamp(1.15rem,4vw,1.35rem)] font-black uppercase tracking-[0.08em] text-text">Power Analytics</h1>
            <span className="max-w-2xl text-[11px] font-bold leading-relaxed text-text-muted sm:text-xs">Monitor and audit energy consumption across your home.</span>
          </div>
          <button
            type="button"
            onClick={refreshAnalytics}
            disabled={refreshing}
            aria-label="Refresh analytics data"
            title="Refresh analytics data"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text-muted transition hover:border-accent/50 hover:bg-card-alt hover:text-accent disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCw size={16} className={refreshing ? 'animate-spin text-accent' : ''} strokeWidth={2.5} />
          </button>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            onClick={() => { setPdfError(''); setShowPdfConfirm(true); }}
            className="col-span-2 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-extrabold text-[var(--btn-text)] shadow-gold-glow transition-all duration-250 hover:bg-accent-hover sm:col-span-1 sm:min-h-[36px] sm:justify-start"
            title="Download formatted PDF report"
          >
            <FileText size={14} className="stroke-[2.5px]" />
            Download PDF
          </button>
          <button
            onClick={() => setShowOnboarding(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-extrabold text-text transition-all hover:bg-card-alt sm:min-h-[36px]"
          >
            <HelpCircle size={14} className="stroke-[2.5px]" />
            User Guide
          </button>
          <button
            onClick={openPowerGuide}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-extrabold text-[var(--btn-text)] transition-all hover:bg-accent-hover shadow-gold-glow sm:min-h-[36px]"
          >
            How it Works
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <section className="mb-5 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-3 sm:gap-4">
        <article className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-lg backdrop-blur-md sm:p-5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted block mb-1">Total Consumption Today</span>
          <div className="break-words text-xl font-black text-accent sm:text-2xl">{totalKwhToday.toFixed(4)} <span className="text-sm text-text-muted">kWh</span></div>
        </article>

        <article className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-lg backdrop-blur-md sm:p-5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted block mb-1">Current Realtime Draw</span>
          <div className="break-words text-xl font-black text-accent sm:text-2xl">{currentDraw} <span className="text-sm text-text-muted">Watts</span></div>
          <span className="text-[10px] font-bold text-text-muted block mt-1">
            ⚡ {(currentDraw / (userSettings.voltage || 230)).toFixed(2)} A (Current at {userSettings.voltage || 230}V)
          </span>
        </article>

        <article className="min-w-0 rounded-2xl border border-border bg-card p-4 font-bold shadow-lg backdrop-blur-md sm:p-5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted block mb-1">Estimated Cost Today</span>
          <div className="break-words text-xl font-black text-accent sm:text-2xl">{userSettings.currency === 'USD' ? '$' : userSettings.currency === 'EUR' ? '€' : '₹'}{estimatedCostToday.toFixed(4)} <span className="text-xs text-text-muted font-bold">(₹{userSettings.tariff_per_kwh}/kWh)</span></div>
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
          className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md animate-fade-in sm:p-4"
          onClick={closePowerGuide}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="power-guide-title"
            data-sheet-drag-owner="1"
            className="flex w-full max-h-[88svh] flex-col overflow-hidden rounded-t-[28px] border border-border bg-card p-5 text-left shadow-2xl sm:w-[min(100%,620px)] sm:rounded-[24px] sm:p-6"
            style={{
              transform: `translateY(${powerGuideY}px)`,
              transition: isPowerGuideDragging ? "none" : "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              data-sheet-drag-zone="1"
              onPointerDown={handlePowerGuidePointerDown}
              onPointerMove={handlePowerGuidePointerMove}
              onPointerUp={handlePowerGuidePointerEnd}
              onPointerCancel={handlePowerGuidePointerEnd}
              className="shrink-0 touch-none"
            >
              <div
                data-sheet-handle="1"
                className="mb-3 flex cursor-grab flex-col items-center gap-3 active:cursor-grabbing"
                aria-label="Drag down to close guide"
              >
                <span className="h-1.5 w-12 rounded-full bg-border" />
              </div>

              <div className="flex shrink-0 items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2 text-accent">
                  <TrendingUp size={18} className="stroke-[2.5px]" />
                  <h3 id="power-guide-title" className="text-base font-extrabold tracking-tight text-text">How Power is Calculated</h3>
                </div>
                <button
                  onClick={closePowerGuide}
                  aria-label="Close power calculation guide"
                  className="text-text-muted hover:text-accent p-1 rounded-lg hover:bg-white/5 cursor-pointer border-none bg-transparent"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pt-1 text-xs font-bold leading-relaxed text-text">
              <div className="flex flex-col gap-4">
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
                <p className="text-text-muted">You can adjust your electricity tariff rate and household voltage in your <Link href="/profile" className="text-accent underline" onClick={closePowerGuide}>Profile Settings</Link>. This ensures cost calculations match your actual electricity bill.</p>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPdfConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm max-md:items-end max-md:p-0"
          onClick={() => { if (!pdfBusy) setShowPdfConfirm(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-confirm-title"
            aria-describedby="pdf-confirm-description"
            className="flex w-[min(100%,410px)] flex-col gap-4 rounded-[22px] border border-border bg-card p-5 text-left shadow-2xl max-md:w-full max-md:rounded-b-none max-md:rounded-t-[24px] max-md:p-6 max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto -mt-1 hidden h-1 w-12 rounded-full bg-border max-md:block" />
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent-bg text-accent">
                <FileText size={20} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h3 id="pdf-confirm-title" className="text-base font-extrabold tracking-tight text-text">
                  Download analytics PDF?
                </h3>
                <p id="pdf-confirm-description" className="mt-1 text-xs font-semibold leading-relaxed text-text-muted">
                  A formatted report will include your overview, devices, energy history, activity, schedules, and alarms.
                </p>
              </div>
            </div>
            {pdfError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold leading-relaxed text-red-400">
                {pdfError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowPdfConfirm(false)}
                disabled={pdfBusy}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-extrabold text-text transition hover:bg-card-alt disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfBusy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-xs font-extrabold text-[var(--btn-text)] transition hover:bg-accent-hover disabled:opacity-50"
              >
                {pdfBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
                {pdfBusy ? 'Preparing PDF...' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
