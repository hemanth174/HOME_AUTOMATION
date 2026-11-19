# VikaTech mobile implementation checklist

This is the actionable companion to [the phased roadmap](vikatech-mobile-roadmap.md). Reviewed 18 November 2026 from the Expo SDK 58 mobile checkout and the Next.js, Supabase and ESP32 sources. Native hardware results remain unverified.

## Sequence and evidence

Complete one ticket at a time. For each, record changed files, typecheck/lint/build output, native screenshots and physical hardware evidence. A database acknowledgement is not proof that a relay changed.

| Ticket | Work | Acceptance demo |
| --- | --- | --- |
| 0.1 Baseline | Record mobile/web commit IDs; run `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` and Android development build. Capture failures. | Fresh checkout launches to login on Android. |
| 0.2 Recovery | Inventory `/api/send-email` callers. Move password reset to Supabase Auth's `resetPasswordForEmail` and `PASSWORD_RECOVERY`; remove the mobile generated code and local failed-attempt counter. Review security question RPC and lookup for server-enforced limits. Close the arbitrary mail endpoint after migration. | Expired/reused links and repeated wrong answers cannot bypass reset; unauthenticated arbitrary email is rejected. |
| 0.3 Approval | Test signed-out, pending, approved, rejected, revoked and expired session. Check two-admin approval and RLS on direct API access. | Unapproved account cannot read boards or write devices even if UI is bypassed. |
| 1.1 Navigation | Install SDK-compatible Router packages with `npx expo install`; move entry and layouts; preserve auth guard, deep links and Android Back. | Restart/deep link lands correctly without duplicate auth transition. |
| 1.2 Design | Create semantic colors, type/spacing scales, accessible states and status bar; redesign Home and device detail first. | Native screenshots for zero, one and many boards, light/dark and large text pass review. |
| 2.1 Read | Query signed-in owner's `boards` (`id,name,board_identifier,last_seen`) and `devices` (`id,name,is_on,feedback_on,relay_index,board_id`) as in web `useDashboardData.js`. Timestamp cache, clear on logout, derive counts. | New boards/relays appear without fixed UI; no-board setup is useful. |
| 2.2 Live | Subscribe to user-scoped changes, refetch on foreground/reconnect/pull and clean subscriptions. Keep requested `is_on` distinct from observed `feedback_on`. | Web, app and wall switch converge; unknown feedback remains unknown. |
| 2.3 Command | Send one desired relay state with ownership enforced by RLS. Show `Sending`, then `Waiting for device`, then confirmed `On/Off` after feedback or fresh local read. On timeout refetch and offer deliberate retry; avoid blind toggle replay. | Physical relay changes; failed MQTT dispatch or revoked ownership never shows success. |
| 3.1 Local | Probe ESP32 SoftAP `192.168.4.1` and LAN; implement status, device, relay and mesh routes with board identifier and relay index. Configure native local-network/cleartext access with versioned docs. | Phone on ESP32 Wi-Fi controls and confirms physical relay without internet. |
| 3.2 Reconcile | Track cloud and local reachability separately; map local nodes to stable board IDs; reconcile on handover, leader change and app resume. | No duplicate command after reconnect; physical state wins. |
| 4.1 Automations | Implement presets, schedules and alarms against web schema. Execution belongs on server/ESP32, not an app timer. Preserve timezone and one-time semantics. | Routine created on mobile appears on web and runs with app killed. |
| 4.2 History | Paginate actual activity logs; implement owned board names and persisted settings; measured analytics only. | Logs match database, rename appears on web, no invented power reading. |
| 5.1 Preview | Typecheck, lint, Doctor, build, auth/RLS checks, physical relay matrix, accessibility pass and private signed build. | Testers complete sign-in, cloud/local control and routine on hardware. |

## First vertical slice

1. Establish a reproducible Android development build and a test account with both approvals. Keep credentials out of source.
2. Fix recovery and the generic email route before sharing a build. The current phone generates a six-digit code with `Math.random()`, checks it only in React state and sends arbitrary HTML/text to the server route. Supabase already sends server-verified reset links.
3. Add a typed Home data layer separate from rendering. Fetch user boards/devices, timestamp the last success, subscribe in foreground and refetch on resume. Verify direct API/RLS behavior with two test accounts.
4. Replace all fixed Home metrics, room cards and device cards with actual data; remove the fabricated online badge and energy reading. Represent cloud requested state, hardware feedback and reachability separately.
5. Wire one relay command. Disable double taps, show progress, reconcile feedback and handle timeout. Exercise on/off from mobile, web and physical switch, plus board offline and MQTT tunnel unavailable. Capture the time and UI state for every transition.

## Native screen design

| Screen | Main content | Required states |
| --- | --- | --- |
| Home | Greeting, cloud/local connection, last confirmed time, board cards and favorite relays; setup action for empty home. | Loading, no boards, offline cache, partial boards, pending command. |
| Room / board | Name, reachability, relay list, observed state and time; owned rename. | Missing board, mixed outcomes, long names. |
| Device detail | Large accessible control, requested and observed state, command progress and retry. | Unknown physical state, timeout, revoked access. |
| Automations | Presets, schedules, alarms, next run and edit actions. | Empty, invalid time, missed run. |
| Activity | Paginated actor/device/action/source/time and board filter. | Empty, load more, stale data. |
| Settings | Account, approval, theme, local connection, notifications, logout and working support links. | Signed out, denied permission. |

Use warm paper, dark ink and coral for actions. Reserve green/amber/red for measured status. Use 48 dp touch targets, scalable readable text, accessible switch state and plain text with color. Keep energy below primary controls until measured records exist. Do not infer `ONLINE` from Wi-Fi alone. Prototype and review on a native Android phone before propagating components.

## Source anchors

- Mobile: `../vikatech-mobile/App.tsx`, `src/screens/LoginScreen.tsx`, `src/screens/DashboardScreen.tsx`, `src/components/DeviceCard.tsx`, `src/lib/account.ts`, `app.json`.
- Web and firmware: `src/hooks/useDashboardData.js`, `src/lib/localApi.js`, `src/app/local/useLocalControl.js`, `supabase/mqtt_dispatch.sql`, `supabase/device_management.sql`, `esp32.cpp`.
- Official docs: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [Expo Router installation](https://docs.expo.dev/router/installation/), [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

The mobile checkout is a sibling outside the active writable workspace. Make that checkout writable for implementation while retaining its Git history; avoid a second drifting copy.
