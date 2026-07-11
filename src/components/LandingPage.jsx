'use client';

import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useState, useRef, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';

// Dynamically import ThreeModelViewer (only in client environment)
const ThreeModelViewer = dynamic(() => import('./ThreeModelViewer'), { ssr: false });

export default function LandingPage() {
  const router = useRouter();
  const [activeTab3D, setActiveTab3D] = useState('pcb'); // 'pcb' or 'esp'
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 1.0; // 1.75x playback speed
    }
  }, []);

  // Smooth scroll helper
  const handleScroll = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Social share helper
  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Electric Warriors - Smart Home Automation',
          text: 'Check out Electric Warriors premium smart home automation switchboards and controllers!',
          url: typeof window !== 'undefined' ? window.location.origin : ''
        });
      } catch (err) {
        console.warn('Share cancelled or failed:', err);
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.origin);
        alert('Link copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  return (
    <div className="bg-lp-bg text-lp-on-surface font-body-md selection:bg-lp-primary-container selection:text-lp-on-primary-container min-h-screen">

      {/* Top Navbar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-6 py-3 md:py-4 bg-lp-bg/85 lp-glass-blur border-b border-lp-outline-variant">
        <div className="text-base md:text-xl font-headline-md font-black tracking-tighter text-white uppercase select-none">
          ELECTRIC WARRIORS
        </div>
        <nav className="hidden md:flex gap-8 font-label-caps text-[12px] tracking-tight items-center">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-lp-primary font-bold border-b-2 border-lp-primary-container pb-1 cursor-pointer">
            Home
          </button>
          <button onClick={() => handleScroll('commercial')} className="text-lp-secondary hover:text-lp-primary transition-colors cursor-pointer">
            Commercial
          </button>
          <button onClick={() => handleScroll('v4')} className="text-lp-secondary hover:text-lp-primary transition-colors cursor-pointer">
            The V4
          </button>
          <button onClick={() => handleScroll('showcase3d')} className="text-lp-secondary hover:text-lp-primary transition-colors cursor-pointer">
            3D Explorer
          </button>
          <button onClick={() => handleScroll('analytics')} className="text-lp-secondary hover:text-lp-primary transition-colors cursor-pointer">
            Analytics
          </button>
          <button onClick={() => handleScroll('journey')} className="text-lp-secondary hover:text-lp-primary transition-colors cursor-pointer">
            Our Journey
          </button>
        </nav>
        <div className="flex gap-2 md:gap-4 items-center shrink-0">
          <ThemeToggle />
          <button
            onClick={() => router.push('/login')}
            className="px-3 py-1.5 md:px-4 md:py-2 border border-lp-primary-container/40 text-lp-primary font-label-caps text-[10px] md:text-[12px] hover:bg-lp-primary-container/10 transition-all active:scale-95 cursor-pointer rounded whitespace-nowrap"
          >
            Login
          </button>
         
        </div>
      </header>

      <main className="pt-20">

        {/* Hero Section */}
        <section className="relative min-h-[85vh] flex flex-col items-center justify-center overflow-hidden px-6 lg:px-24">
          <div className="absolute inset-0 lp-grid-pattern pointer-events-none"></div>

          <div className="relative z-10 text-center max-w-4xl mx-auto pt-12">
            <div className="inline-block px-3 py-1 mb-6 border border-lp-primary-container/30 bg-lp-primary-container/5 rounded-full">
              <span className="font-label-caps text-[10px] text-lp-primary-container tracking-[0.2em] uppercase">Enterprise IoT Architecture</span>
            </div>
            <h1 className="font-display-lg text-[48px] leading-tight md:text-[64px] text-white mb-6 font-extrabold">
              Automate Your Space.<br />
              <span className="text-lp-primary-container">Optimize Your Energy.</span>
            </h1>
            <p className="font-body-lg text-lp-secondary max-w-2xl mx-auto mb-10 opacity-80 leading-relaxed text-sm md:text-base">
              Distributed smart architecture for modern homes and data-driven commercial operations. Experience the power of V4 hardware precision.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => handleScroll('commercial')}
                className="px-8 py-4 bg-lp-primary-container text-lp-on-primary-container font-label-caps font-bold text-sm flex items-center justify-center gap-2 group cursor-pointer hover:shadow-[0_0_20px_rgba(0,255,65,0.45)] transition-all rounded"
              >
                Book a Commercial Demo
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
              <button
                onClick={() => handleScroll('showcase3d')}
                className="px-8 py-4 border border-lp-outline text-on-surface font-label-caps text-sm hover:bg-white/5 transition-all cursor-pointer rounded text-white"
              >
                Explore 3D Models
              </button>
            </div>
          </div>

          {/* About Us Section */}
          <div className="relative z-10 mt-16 w-full max-w-4xl mx-auto rounded-xl border border-lp-outline-variant bg-lp-surface-low shadow-2xl overflow-hidden mb-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 md:p-10 items-center">
              {/* Left Column: Team Photo */}
              <div className="relative aspect-[3/4] md:aspect-[4/5] rounded-lg border border-lp-outline-variant overflow-hidden shadow-lg group">
                <img 
                  alt="Electric Warriors Engineering Team"
                  src="/team_photo.jpg"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-lp-bg/40 via-transparent to-transparent pointer-events-none"></div>
              </div>
              
              {/* Right Column: About Us Content */}
              <div className="flex flex-col gap-5 text-left">
                <div>
                  <span className="text-xs font-label-caps text-lp-primary-container uppercase tracking-wider block mb-1">About Us</span>
                  <h3 className="text-2xl font-headline-sm font-bold text-white leading-tight">
                    The Team Behind the Hardware
                  </h3>
                </div>
                <p className="text-sm font-body-md text-lp-on-surface-variant leading-relaxed">
                  We are a passionate team of engineering students and developers dedicated to creating robust, high-performance, and affordable home automation solutions. Together, we designed and built the Electric Warriors smart node control dashboard and V4 switchboard architecture.
                </p>
                
                {/* Team Members List */}
                <div className="mt-2 flex flex-col gap-3">
                  <span className="text-[10px] font-label-caps text-lp-secondary uppercase tracking-widest block mb-1">Engineering Members</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {[
                      "Lrv Sai Kausthubh",
                      "Akshitha K",
                      "Hemanth Atthuluri",
                      "Indira M",
                      "Jalaluddin S"
                    ].map((name, idx) => (
                      <div key={idx} className="flex items-center gap-2.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-lp-primary-container"></span>
                        <span className="text-xs font-semibold text-white font-body-sm">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dual Target Split */}
        <section className="flex flex-col md:flex-row border-y border-lp-outline-variant min-h-[60vh]">
          {/* Homeowners */}
          <div className="flex-1 p-12 md:p-20 bg-lp-surface-low border-r border-lp-outline-variant group relative overflow-hidden flex flex-col justify-center">
            <div className="relative z-10">
              <span className="font-label-caps text-xs text-lp-primary mb-4 block">FOR INDIVIDUALS</span>
              <h2 className="font-headline-md text-3xl mb-6 font-extrabold text-white">Home Automation<br /><span className="text-lp-secondary">Without the Mess.</span></h2>
              <p className="font-body-md text-lp-on-surface-variant mb-8 max-w-md text-sm leading-relaxed">Focus on day-to-day convenience, aesthetics, and reliability. Our V4 architecture ensures your house stays clean with no bulky central hub wiring or complex server racks.</p>
              <ul className="space-y-4 mb-10 text-sm">
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">check_circle</span> Zero Hub Latency
                </li>
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">check_circle</span> Invisible Retrofitting
                </li>
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">check_circle</span> 100% Offline Resilience
                </li>
              </ul>
              <button
                onClick={() => router.push('/login')}
                className="px-6 py-3 border-2 border-lp-primary-container text-lp-primary-container font-label-caps text-xs font-bold hover:bg-lp-primary-container/10 transition-all cursor-pointer rounded"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
          {/* Commercial */}
          <div className="flex-1 p-12 md:p-20 bg-lp-surface-lowest group relative overflow-hidden flex flex-col justify-center" id="commercial">
            <div className="relative z-10">
              <span className="font-label-caps text-xs text-lp-secondary mb-4 block">FOR ENTERPRISE</span>
              <h2 className="font-headline-md text-3xl mb-6 font-extrabold text-white">Commercial Operations<br /><span className="text-lp-primary-container">Energy Analytics.</span></h2>
              <p className="font-body-md text-lp-on-surface-variant mb-8 max-w-md text-sm leading-relaxed">Real-time analytics and automated scheduling to eliminate wasted electricity. Track device on/off times to map store foot-traffic and optimize utility spending.</p>
              <ul className="space-y-4 mb-10 text-sm">
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">monitoring</span> Real-time Foot-traffic Mapping
                </li>
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">schedule</span> Multi-store Automation
                </li>
                <li className="flex items-center gap-3 font-data-point text-white">
                  <span className="material-symbols-outlined text-lp-primary-container text-lg">analytics</span> Advanced Energy ROI
                </li>
              </ul>
              <button
                onClick={() => handleScroll('showcase3d')}
                className="px-6 py-3 bg-lp-primary-container text-lp-on-primary-container font-label-caps text-xs font-bold hover:shadow-[0_0_20px_rgba(0,255,65,0.3)] transition-all cursor-pointer rounded"
              >
                Explore 3D Hardware
              </button>
            </div>
          </div>
        </section>

        {/* Hardware Advantage Feature Grid */}
        <section className="py-24 px-6 lg:px-24 bg-lp-surface relative overflow-hidden" id="v4">
          <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-lp-primary-container/5 blur-[120px] rounded-full pointer-events-none"></div>
          <div className="mb-20">
            <h2 className="font-headline-md text-4xl mb-4 font-extrabold text-white">The V4 Hardware Advantage</h2>
            <div className="w-24 h-1 bg-lp-primary-container"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Distributed Architecture */}
            <div className="p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">account_tree</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Distributed Architecture</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">No central hub. Each switchboard has its own ESP32 communicating via Wi-Fi, drastically reducing wiring costs and eliminating single points of failure.</p>
            </div>
            {/* Fail-Safe Redundancy */}
            <div className="p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">verified_user</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Fail-Safe Redundancy</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">True bi-directional control. The physical wall switches continue to work flawlessly even if the Wi-Fi drops or the ESP32 chip is damaged.</p>
            </div>
            {/* Infinitely Expandable */}
            <div className="p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">add_circle</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Infinitely Expandable</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Powered by shift registers, freeing up GPIO pins for OLED screens, rotary encoders, and motion/mmWave sensors.</p>
            </div>
            {/* Component Agnostic */}
            <div className="p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">settings_input_component</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Component Agnostic</h3>
              <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Custom PCB designed to accept any ESP32 variation, protecting your infrastructure against supply chain issues and chip shortages.</p>
            </div>
            {/* Ultra-Low Cost */}
            <div className="p-8 bg-lp-surface-low border border-lp-outline-variant hover:border-lp-primary-container/45 transition-all group relative overflow-hidden lg:col-span-2 rounded">
              <span className="material-symbols-outlined text-lp-primary-container text-4xl mb-6 block">payments</span>
              <h3 className="font-label-caps text-sm mb-4 tracking-wider uppercase text-white font-bold">Ultra-Low Cost Manufacturing</h3>
              <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed flex-1">Manufactured at ~₹600 for a 4-channel relay with built-in AC feedback. High-performance IoT is no longer a luxury.</p>
                <div className="px-6 py-3 bg-lp-surface-lowest border border-lp-primary-container/20 rounded font-data-point text-lp-primary-container text-lg font-bold select-none">
                  ₹600 <span className="text-xs opacity-60">/ unit</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3D Model Showcase Section */}
        <section className="py-24 px-6 lg:px-24 bg-lp-surface-lowest border-t border-lp-outline-variant relative overflow-hidden" id="showcase3d">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 h-2/3 bg-lp-secondary/5 blur-[140px] rounded-full pointer-events-none"></div>

          <div className="text-center mb-16 relative z-10 max-w-3xl mx-auto">
            <div className="inline-block px-3 py-1 mb-4 border border-lp-secondary/30 bg-lp-secondary/5 rounded-full">
              <span className="font-label-caps text-[10px] text-lp-secondary tracking-[0.2em] uppercase">Interactive 3D Explorer</span>
            </div>
            <h2 className="font-headline-md text-4xl mb-4 font-extrabold text-white">Inspect Our Custom Engineering</h2>
            <p className="font-body-md text-lp-on-surface-variant text-sm max-w-xl mx-auto leading-relaxed">
              Use touch or mouse gestures to drag, rotate, and zoom the components. Toggle between the custom PCB board and the onboard ESP32 microchip.
            </p>

            {/* Interactive Toggle Tabs */}
            <div className="flex justify-center gap-4 mt-8">
              <button
                onClick={() => setActiveTab3D('pcb')}
                className={`px-5 py-2.5 rounded font-label-caps text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 border ${activeTab3D === 'pcb'
                    ? 'bg-lp-primary-container text-lp-on-primary-container border-lp-primary-container shadow-[0_0_15px_rgba(0,255,65,0.25)]'
                    : 'bg-lp-surface-low text-lp-on-surface-variant border-lp-outline-variant hover:text-white hover:border-lp-outline'
                  }`}
              >
                <span className="material-symbols-outlined text-sm">developer_board</span>
                Custom V4 Switchboard PCB
              </button>
              <button
                onClick={() => setActiveTab3D('esp')}
                className={`px-5 py-2.5 rounded font-label-caps text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 border ${activeTab3D === 'esp'
                    ? 'bg-lp-primary-container text-lp-on-primary-container border-lp-primary-container shadow-[0_0_15px_rgba(0,255,65,0.25)]'
                    : 'bg-lp-surface-low text-lp-on-surface-variant border-lp-outline-variant hover:text-white hover:border-lp-outline'
                  }`}
              >
                <span className="material-symbols-outlined text-sm">memory</span>
                ESP32-WROOM Module
              </button>
            </div>
          </div>

          {/* 3D Viewer Container */}
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
            {/* Visualizer Frame */}
            <div className="lg:col-span-8 bg-lp-surface-low/60 border border-lp-outline-variant p-2 rounded-2xl shadow-2xl relative">
              <div className="absolute top-4 left-4 z-10 flex gap-2">
                <span className="px-2 py-0.5 rounded bg-lp-bg/85 border border-lp-outline-variant text-[9px] font-label-caps text-lp-primary-container uppercase tracking-wide select-none">3D Interactive</span>
                <span className="px-2 py-0.5 rounded bg-lp-bg/85 border border-lp-outline-variant text-[9px] font-label-caps text-lp-secondary uppercase tracking-wide select-none">Drag to Orbit</span>
              </div>
              <div className="w-full aspect-[4/3] min-h-[350px] md:min-h-[450px] rounded-xl overflow-hidden bg-[#0d0e12]/90 relative">
                {activeTab3D === 'pcb' ? (
                  <ThreeModelViewer
                    key="pcb-viewer"
                    modelType="pcb-custom"
                    modelPath="/models/pcb_custom_front.png"
                    mtlPath="/models/pcb_custom_back.png"
                    glowColor={0x00ff41}
                  />
                ) : (
                  <ThreeModelViewer
                    key="esp-viewer"
                    modelType="obj"
                    modelPath="/models/ESP32Wroom.obj"
                    mtlPath="/models/ESP32Wroom.mtl"
                    glowColor={0x00e3fd}
                  />
                )}
              </div>
            </div>

            {/* Spec Sheet Column */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              {activeTab3D === 'pcb' ? (
                <div className="animate-fade-in flex flex-col gap-6">
                  <div className="border-b border-lp-outline-variant pb-4">
                    <span className="text-xs font-label-caps text-lp-primary-container uppercase tracking-wider">Board Model v4.2</span>
                    <h3 className="text-2xl font-headline-sm font-bold text-white mt-1">V4 Redundant Switchboard</h3>
                  </div>
                  <p className="text-sm font-body-md text-lp-on-surface-variant leading-relaxed">
                    Designed to accept generic ESP32 modules. Interfaces 4 relays via high-speed shift registers, allowing mechanical switches and logic triggers to operate independently.
                  </p>
                  <div className="space-y-4">
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-primary-container mt-0.5 text-lg">bolt</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">AC Current Feedback</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">True status confirmation using custom optical/current detector circuits.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-primary-container mt-0.5 text-lg">settings_suggest</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Shift Register Extension</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Minimizes GPIO overhead, freeing up pins for custom sensors and displays.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-primary-container mt-0.5 text-lg">construction</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Easy Retrofitting</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Compact footprint (~₹600 bills of materials) that drops behind existing board frames.</p>
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="animate-fade-in flex flex-col gap-6">
                  <div className="border-b border-lp-outline-variant pb-4">
                    <span className="text-xs font-label-caps text-lp-secondary uppercase tracking-wider">Processor Core</span>
                    <h3 className="text-2xl font-headline-sm font-bold text-white mt-1">ESP32-WROOM-32D</h3>
                  </div>
                  <p className="text-sm font-body-md text-lp-on-surface-variant leading-relaxed">
                    The heart of our distributed nodes. Boasts robust dual-core processing, hardware Wi-Fi/Bluetooth, and a highly customizable framework.
                  </p>
                  <div className="space-y-4">
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-secondary mt-0.5 text-lg">wifi</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Wi-Fi & Bluetooth Stack</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Operates on 2.4GHz with instant fail-safe fallback commands.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-secondary mt-0.5 text-lg">terminal</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Dual-Core Tensilica Core</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Runs concurrent Wi-Fi handlers on Core 0 and relay commands on Core 1.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="material-symbols-outlined text-lp-secondary mt-0.5 text-lg">shield</span>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-label-caps">Offline Resilient ROM</h4>
                        <p className="text-xs text-lp-on-surface-variant mt-0.5">Saves presets and timers locally to continue executing schedules offline.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Software & Analytics Showcase */}
        <section className="py-24 bg-lp-surface-low border-t border-lp-outline-variant px-6 lg:px-24" id="analytics">
          <div className="flex flex-col lg:flex-row gap-16 items-center max-w-6xl mx-auto">
            <div className="flex-1">
              <span className="font-label-caps text-xs text-lp-primary mb-4 block">POWERED BY SUPABASE</span>
              <h2 className="font-headline-md text-4xl mb-6 text-white font-extrabold">Full-Stack Intelligence.</h2>
              <p className="font-body-md text-lp-on-surface-variant mb-10 leading-relaxed text-sm">
                Our software layer leverages low-latency WebSockets and a robust Supabase backend for real-time responsiveness. The "Energy Dashboard" provides deep logs of device uptime, providing actionable data for warehouse and retail managers to cut costs.
              </p>
              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-lp-primary-container/10 rounded">
                    <span className="material-symbols-outlined text-lp-primary-container">bolt</span>
                  </div>
                  <div>
                    <h4 className="font-headline-sm text-lg text-white mb-1 font-bold">Real-time Monitoring</h4>
                    <p className="text-lp-on-surface-variant text-xs leading-relaxed">Instant visual updates via bi-directional WebSockets.</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-lp-primary-container/10 rounded">
                    <span className="material-symbols-outlined text-lp-primary-container">history</span>
                  </div>
                  <div>
                    <h4 className="font-headline-sm text-lg text-white mb-1 font-bold">Historical Logs</h4>
                    <p className="text-lp-on-surface-variant text-xs leading-relaxed">Audit every switch event with sub-second precision.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full max-w-2xl relative">
              <div className="relative rounded-xl bg-lp-slate-gray p-1 overflow-hidden shadow-2xl">
                <video
                  ref={videoRef}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover rounded opacity-90"
                >
                  <source 
                    src="https://res.cloudinary.com/dvwvphn8u/video/upload/v1783665250/analytics_demo_f2vdpq.mp4" 
                    type="video/mp4" 
                  />
                  Your browser does not support the video tag.
                </video>
                <div className="absolute inset-0 bg-gradient-to-tr from-lp-surface/50 via-transparent to-lp-primary-container/5 pointer-events-none"></div>
              </div>
            </div>
          </div>
        </section>

        {/* Our Journey Timeline */}
        <section className="py-24 bg-lp-surface px-6 lg:px-24 border-t border-lp-outline-variant" id="journey">
          <div className="text-center mb-20">
            <h2 className="font-headline-md text-4xl mb-4 font-extrabold text-white">Our Journey</h2>
            <p className="font-body-md text-lp-on-surface-variant text-sm">The evolution from basic automation to industrial-grade V4 architecture.</p>
          </div>

          <div className="max-w-4xl mx-auto relative py-12">

            {/* Phase 1 */}
            <div className="flex flex-col md:flex-row gap-8 mb-24 relative">
              <div className="w-12 h-12 rounded-full bg-lp-slate-gray border-2 border-lp-outline flex items-center justify-center shrink-0 z-10 lp-timeline-node">
                <span className="font-label-caps text-xs text-white">P1</span>
              </div>
              <div className="flex-1 pt-1">
                <h3 className="font-headline-sm text-xl mb-3 text-white font-bold">Phase 1: The Start</h3>
                <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Arduino Nano + HC05 Bluetooth. It worked, but the 30-minute disconnects and terrible range proved Bluetooth wasn't the answer for reliable infrastructure.</p>
              </div>
            </div>

            {/* Phase 2 */}
            <div className="flex flex-col md:flex-row gap-8 mb-24 relative">
              <div className="w-12 h-12 rounded-full bg-lp-slate-gray border-2 border-lp-outline flex items-center justify-center shrink-0 z-10 lp-timeline-node">
                <span className="font-label-caps text-xs text-white">P2</span>
              </div>
              <div className="flex-1 pt-1">
                <h3 className="font-headline-sm text-xl mb-3 text-white font-bold">Phase 2: The Wi-Fi Shift</h3>
                <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Moved to ESP32 for range. Hit a wall with parallel wiring—if the manual switch was on, the app couldn't turn the light off. Zero feedback loop for the user.</p>
              </div>
            </div>

            {/* Phase 3 */}
            <div className="flex flex-col md:flex-row gap-8 mb-24 relative">
              <div className="w-12 h-12 rounded-full bg-lp-slate-gray border-2 border-lp-outline flex items-center justify-center shrink-0 z-10 lp-timeline-node">
                <span className="font-label-caps text-xs text-white">P3</span>
              </div>
              <div className="flex-1 pt-1">
                <h3 className="font-headline-sm text-xl mb-3 text-white font-bold">Phase 3: The Blueprint</h3>
                <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Designed bi-directional switching and AC detectors on paper. Realized a central-hub architecture would make house wiring too expensive and messy.</p>
              </div>
            </div>

            {/* Phase 4 */}
            <div className="flex flex-col md:flex-row gap-8 relative">
              <div className="w-12 h-12 rounded-full bg-lp-primary-container text-lp-on-primary-container border-2 border-lp-primary-container flex items-center justify-center shrink-0 z-10 lp-active-glow">
                <span className="material-symbols-outlined text-lg font-bold">check</span>
              </div>
              <div className="flex-1 pt-1">
                <div className="inline-block px-2 py-0.5 mb-2 bg-lp-primary-container/10 border border-lp-primary-container/30 rounded text-[10px] font-label-caps text-lp-primary-container uppercase select-none font-bold">Breakthrough</div>
                <h3 className="font-headline-sm text-xl mb-3 text-lp-primary-container font-bold">Phase 4: V4 Architecture</h3>
                <p className="font-body-md text-lp-on-surface-variant text-xs leading-relaxed">Pivoted to the V4 distributed model. Shift registers, component-agnostic PCB, and manual redundancy. Dropped manufacturing cost by 50% while maximizing reliability.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA / Partner Section */}
        <section className="py-24 bg-lp-surface-lowest border-t border-lp-outline-variant relative overflow-hidden" id="partner">
          <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10">
            <div className="p-12 bg-lp-surface border border-lp-outline-variant flex flex-col justify-between rounded">
              <div>
                <div role="heading" aria-level="2" className="font-headline-md text-3xl mb-6 font-extrabold text-lp-on-surface">Direct Sales &amp; Retrofitting</div>
                <p className="font-body-md text-lp-on-surface-variant text-sm mb-8 leading-relaxed">Ready to upgrade your existing space? Pre-order our 4-device relay modules designed for easy retrofitting into any standard switchboard.</p>
              </div>
              <button
                onClick={() => router.push('/login')}
                className="w-fit px-8 py-4 border-2 border-lp-primary-container text-lp-primary-container font-label-caps font-bold text-sm hover:bg-lp-primary-container/10 transition-all cursor-pointer rounded"
              >
                Pre-Order Modules
              </button>
            </div>
            <div className="p-12 bg-lp-primary-container text-lp-on-primary-container flex flex-col justify-between rounded">
              <div>
                <div role="heading" aria-level="2" className="font-headline-md text-3xl mb-6 font-extrabold text-lp-on-primary-container">Builder Partnerships</div>
                <p className="font-body-md text-lp-on-primary-container/80 text-sm mb-8 leading-relaxed">For real estate developers: Install Electric Warriors tech from the ground up. Offer your clients premium, integrated intelligence and command a higher market value.</p>
              </div>
              <button
                onClick={() => handleScroll('commercial')}
                className="w-fit px-8 py-4 bg-lp-on-primary-container text-lp-primary-container font-label-caps font-bold text-sm hover:shadow-xl transition-all cursor-pointer rounded"
              >
                Partner With Us
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-lp-surface-lowest border-t border-lp-outline-variant py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col gap-2 items-center md:items-start">
            <div className="text-lg font-headline-md font-bold text-white uppercase tracking-tighter select-none">
              ELECTRIC WARRIORS
            </div>
            <p className="font-body-md text-lp-on-surface-variant text-xs">Precision in Darkness.</p>
            <p className="font-label-caps text-[11px] text-lp-on-surface-variant mt-4 opacity-60 select-none">© 2026 Electric Warriors. Shock, Inspire, Lead.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <button 
              className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors cursor-pointer bg-transparent border-none p-0 outline-none" 
              onClick={() => router.push('/terms')}
            >
              Privacy Policy
            </button>
            <button 
              className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors cursor-pointer bg-transparent border-none p-0 outline-none" 
              onClick={() => router.push('/terms')}
            >
              Terms of Service
            </button>
            <button 
              className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors cursor-pointer bg-transparent border-none p-0 outline-none" 
              onClick={() => handleScroll('partner')}
            >
              Partner Program
            </button>
            <a 
              className="font-label-caps text-[11px] text-lp-on-surface hover:text-lp-primary transition-colors" 
              href="mailto:ahemanthramasai@gmail.com?subject=Smart%20Home%20Sales%20Inquiry"
            >
              Contact Sales
            </a>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={handleShare}
              title="Share Page"
              className="w-10 h-10 rounded-full border border-lp-outline-variant bg-transparent flex items-center justify-center hover:border-lp-primary transition-colors group cursor-pointer"
            >
              <span className="material-symbols-outlined text-lp-on-surface-variant group-hover:text-lp-primary-container text-lg">share</span>
            </button>
            <button 
              onClick={() => handleScroll('showcase3d')}
              title="Inspect 3D Hardware"
              className="w-10 h-10 rounded-full border border-lp-outline-variant bg-transparent flex items-center justify-center hover:border-lp-primary transition-colors group cursor-pointer"
            >
              <span className="material-symbols-outlined text-lp-on-surface-variant group-hover:text-lp-primary-container text-lg">hub</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
