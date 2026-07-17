# Smart Home Intelligence & Analytics Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-emerald?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![ESP32](https://img.shields.io/badge/ESP32-Firmware-red?style=for-the-badge&logo=espressif)](https://www.espressif.com/)
[![PWA](https://img.shields.io/badge/PWA-Ready-gradient?style=for-the-badge&logo=pwa)](https://web.dev/explore/progressive-web-apps)

A professional, distributed, offline-resilient, and analytics-driven Smart Home automation system. This platform transforms simple device on/off switches into a **Home Intelligence Platform** suitable for homes, warehouses, and businesses.

---

## The 6-Month Hardware Journey

This project evolved over 6 months through rigorous prototyping, solving real-world physical constraints:

### Phase 1: The Breadboard Starter
* **Core:** Arduino Nano + HC-05 Bluetooth module + 4-Relay board.
* **Limitations:** Very short range, frequent disconnections every 30 minutes, parallel wiring (if the manual wall switch was ON, the relay was useless).

### Phase 2: WiFi Upgrade
* **Core:** Upgraded to ESP32 for WiFi range.
* **Limitations:** Inherited parallel wiring overrides. Lack of AC feedback meant no real-time status sync or energy dashboard.

### Phase 3: Hardware Bidirectional Switching (On Paper)
* **Core:** Designed XOR bidirectional switching, AC mains feedback current detectors, and shift registers.
* **Limitations:** Centralized hub architecture resulted in excessive wiring length, high costs, and messy wall modifications.

### Phase 4: Distributed Architecture & Fail-Safe Redundancy (Current Production PCB)
* **Core:** Switched to a **Distributed Node Architecture** where each switchboard has its own ESP32 talking over local WiFi.
* **Pin Optimization:** Integrated **74HC165** shift registers for live AC current feedback and **74HC595** shift registers for relay controls.
* **Hardware Independence:** Designed to work with any generic ESP32 version.
* **Hardware Redundancy & Manual Fail-Safe:** If an ESP32 or shift register fails, the physical switches fallback to standard electrical operation, ensuring the home never stops functioning.
* **Cost Efficiency:** Slashed manufacturing costs from 1,200 INR to **~600 INR** for a 4-channel board (including PCB, components, feedback circuit, and sensor headers).

---

## Smart Hardware & Firmware Optimizations

1. **Leader-Follower Network Protocol:** To prevent overloading the Supabase database with parallel connections from multiple switchboards, a master-node protocol was implemented:
   * **1 Leader Node:** Solely communicates with the database via WebSockets.
   * **Follower Nodes:** Communicate directly with the Leader Node over a local network.
   * **Leader Election:** If the active Leader Node goes offline, followers automatically hold an election and assign a new leader.
2. **Local Alarms & Timers:** When alarms/schedules are configured, they are synced to the ESP32's local EEPROM. The board runs its own hardware timers, ensuring scheduled events trigger even if the internet is disconnected or the website is closed.
3. **Modular Expansion Headers:** Includes standard plug-and-play headers for optional rotary encoders, OLED screens, light detectors, motion sensors, and millimeter-wave human presence modules.

---

## Software Features

* **Multilingual AI Assistant (Aura):** Built-in text-to-speech voice assistant supporting **English**. Supports website navigation guides, smart control commands, and terms & conditions summaries while ignoring unrelated prompts to conserve AI credits.
* **Data Log Compaction (Optimized DB Storage):** Uses a two-tier database strategy to maintain high performance over years:
  * **Daily Logs Table:** Tracks raw status changes (cleared automatically every 7 days).
  * **Daily Summary Table:** A background function summarizes usage patterns into exactly 1 consolidated row per user per day (resulting in exactly 365 rows per user per year).
* **Real-time Synchronization:** Built-in Supabase PostgreSQL Realtime channels sync states across all connected client devices in milliseconds.
* **PWA Capability:** Fully installable progressive web application with responsive UI styled for mobile and smartwatch layouts.
* **Smart Analytics & Predictions:** Heatmaps and usage analytics suggest custom schedules based on historic user behavior.

---

## Project Structure

```
finalzzz_antigravity/
├── src/
│   ├── app/            # Next.js App Router (alarms, analytics, logs, presets, schedules, terms, faq)
│   ├── components/     # UI Components (Dashboard, 3D PCB Viewer, Aura Voice Control, Navbar)
│   ├── hooks/          # useDashboardData state controller
│   ├── lib/            # Supabase database client
│   └── utils/          # Voice synthesis utilities
├── public/
│   ├── models/         # 3D assets (ESP32 Wroom & custom PCB models)
│   ├── manifest.json   # PWA manifest configurations
│   └── sw.js           # PWA service worker
├── esp32.cpp           # C++ Firmware source code for the ESP32 boards
├── supabase_setup.sql  # Database schema setup, functions, and real-time rules
├── unused_files/       # [Git Ignored] Archived code snippets and prototype reference assets
└── package.json        # Project dependencies & configurations
```

---
Production Link:-
https://home-automation-mauve-one.vercel.app/

---
