# VikaTech mobile delivery roadmap

Reviewed 18 November 2026 against sibling `../vikatech-mobile` and the Next.js/Supabase/ESP32 code in this repository. The app was reviewed from source; no native device or hardware execution is claimed.

## Target

An approved user sees real boards and relays, controls a device with a confirmed result, uses an ESP32 nearby without internet, and manages routines. Never display fabricated online, power or success status. Target Android phone first, keep an iOS-compatible design, and verify iOS on a native device or simulator before claiming support.

## Current state

| Area | Evidence | Finding |
| --- | --- | --- |
| Shell | Mobile `App.tsx`, `package.json`, `app.json` | Expo SDK 58 with manual screen state and tab conditionals; Android project exists. No EAS profiles or iOS identifier. |
| Account | `LoginScreen.tsx`, `PendingScreen.tsx`, `src/lib/account.ts` | Email/OAuth and two-admin approval, realtime and polling fallback. Native end-to-end validation outstanding. |
| Control | `DashboardScreen.tsx`, `DeviceCard.tsx` | Fixed counts, rooms, energy and online badge; switches only update React state. Pull-to-refresh only reloads email. The web optimistically writes `devices.is_on`, which alone does not confirm a physical relay. |
| Other pages | Rooms, Presets, Logs, Alarms, Schedules, Analytics, Local, Settings | Static samples or labels; local page always says disconnected. |
| Reference | Web `src/hooks/useDashboardData.js`, `src/lib/localApi.js`, `src/app/local/useLocalControl.js` | Real query, command, presence and local protocol implementations to match, without copying browser-only APIs. |
| Security | Mobile `LoginScreen.tsx`, web `src/app/api/send-email/route.js` | Recovery code generated with `Math.random()` and checked only on the phone. Email endpoint accepts arbitrary recipient/content without authentication or rate limiting. Trace all callers before changing it. |
| Identity | Mobile `app.json` | Placeholder Android package `com.anonymous.vikatechmobile`, no iOS bundle identifier. |

`tsc --noEmit` passed on the reviewed checkout. It checks types only. `npx expo lint` found no ESLint config and tried to install one, but this checkout is read-only in the active workspace; lint did not run. Native build and hardware tests remain outstanding.

## Design direction

Design for quick, repeated control. Keep warm paper, dark ink and selective coral action color; reserve green/amber/red for measured states. Define shared light/dark color roles, type scale, spacing and motion. Replace tiny 9–10 px functional labels and scattered hex values. Lead with connection mode and last confirmed state, then rooms and switches; show energy/trends below and label estimates. A stale value needs a last-updated time.

Phone navigation: Home, Rooms, Automations, Activity; Settings via profile/More. Tablet navigation: rail/drawer. A board represents a room until the schema defines otherwise. A device card needs board/name, real ON/OFF or unknown, reachability evidence, busy state and confirmation/error. Design no-board, loading, stale, offline, partial-success and retry views. Respect system bars, Back, font scaling, reduced motion and 48 dp targets. Prototype Home and device detail with zero boards, one four-relay board, several long-named boards and offline state; review native phone light/dark/large-text screenshots before expanding.

## Phases and acceptance gates

### Phase 0: Secure account and baseline

1. Record a clean mobile checkout; run TypeScript, Expo Doctor, lint after configuring it, and an Android development build. Capture failures.
2. Trace all `/api/send-email` callers. Prefer Supabase Auth's existing `resetPasswordForEmail` link and `PASSWORD_RECOVERY` event. If custom questions remain, enforce attempts and lockout server-side. Never trust the phone's `Math.random()` code or local failed-attempt counter. Remove or restrict the arbitrary email endpoint after callers migrate.
3. Test signup, email confirmation, Google/GitHub callbacks, expired session, pending/rejected/revoked approval, recovery and logout on a native development build. Verify account RLS and fallback endpoint ownership.
4. Decide first-release platform, final IDs, deep-link scheme, signing owner and test Supabase project. Never place a service-role key in the app.

**Gate:** no unauthenticated arbitrary email, server-verified recovery, device-tested account transitions, reproducible build.

### Phase 1: Structure and design foundation

1. Install SDK-compatible navigation dependencies and migrate manual screen state/tabs to Expo Router routes/layouts. Preserve auth/approval guards and system Back; verify installed SDK docs first.
2. Define typed board, device, presence, command and activity models. Separate cloud and local transports; share contracts/fixtures with web when useful.
3. Build reusable tokens, screen scaffold, card, switch, status banner and loading/empty/error components. Apply the native design to Home and device detail.
4. Replace hidden status bar, placeholder identity and inactive labels.

**Gate:** navigation/back/deep links work across restart; no false status; native phone/tablet light/dark/large-text screenshots pass review.

### Phase 2: Live cloud control

1. Query the signed-in user's boards and devices under RLS; map stable board and relay IDs and show no-board onboarding. Match web presence semantics.
2. Subscribe while foregrounded, refresh on resume/pull, clean up subscriptions and timestamp cached state.
3. Match the web `controlDevice`/MQTT dispatch contract. Its update of `devices.is_on` triggers an asynchronous MQTT request; it proves neither dispatch nor relay actuation. Disable duplicate taps; send once, then reconcile with `feedback_on` or a fresh local hardware snapshot. Report timeout and rejection clearly.
4. Derive counts/rooms from data; show power only from readings or a clearly labelled estimate based on actual records.

**Gate:** real relay, mobile and web converge after app or wall-switch control; failure does not claim success; cross-user commands fail.

### Phase 3: Local ESP32 control

1. Discover SoftAP `192.168.4.1` and LAN/mDNS using native APIs. Verify Android cleartext/network and iOS local-network configuration in current docs; scope HTTP allowance to local use.
2. Port the web `localApi.js` protocol: status, devices, per-relay and mesh routes. Validate node ID, relay index and deployed firmware response shapes.
3. Show cloud reachability, local reachability and confirmed device state separately. Confirm each command and never replay an uncertain toggle blindly.
4. Test cloud down, SoftAP without internet, board offline, leader change, background/resume and Wi-Fi transitions.

**Gate:** a phone on ESP32 Wi-Fi controls and confirms a relay without internet; reconnect converges without duplicate commands.

### Phase 4: Automations and history

1. Implement board naming/editing within ownership and provisioning rules.
2. Implement presets, schedules and alarms against web schema and scheduler wake-up behavior, including timezones and app-closed execution.
3. Implement paginated logs, analytics from real records, and persisted user settings. Label estimates/unavailable readings.
4. Add push or voice after core controls pass, with explicit permission and native testing.

**Gate:** create/edit/delete on mobile matches web; a routine runs on hardware while app closed; logs/charts match stored records.

### Phase 5: Reliability and release

1. Test auth guards, state reconciliation, command transport, local failures and time logic. Run typecheck, lint, doctor, Android build and native phone/tablet visual pass in light/dark and enlarged text.
2. Remove demos/inactive controls; refine feedback/lifecycle; measure startup and command latency on hardware.
3. Configure EAS development/preview/production, final IDs/icons/splash, privacy, versioning and crash diagnostics. Ship private preview before stores.
4. Retain previous build and a go/no-go checklist based on the gates.

**Gate:** critical flows pass on actual hardware; no false status or release-blocking security issue; preview testers accept.

## First implementation slice

Complete Phase 0, then prove **sign-in -> real boards/devices -> one confirmed relay switch -> web/hardware sync**. Next add local control, automations and release work. Record changed files, checks, native evidence and unverified behavior for every phase.

The mobile checkout is currently a sibling outside this session's writable root. Make that checkout writable for implementation while retaining its Git history; avoid a second drifting copy.

For the ordered tickets, demos and screen design, see [the implementation checklist](vikatech-mobile-execution.md).

