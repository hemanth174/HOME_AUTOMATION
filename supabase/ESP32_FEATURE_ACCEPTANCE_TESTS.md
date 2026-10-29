# VikaTech ESP32 Feature Acceptance Test Plan

**Scope:** device enrollment, secure Wi-Fi configuration, restart tracking, direct/mesh routing, mobile Admin UI, and Supabase deployment.

**Important:** Run the first test with the ESP32 on a safe, isolated bench setup and no mains-connected load. A remote restart is a software reboot using `ESP.restart()`; it is not electrical control of the EN pin. For installed electrical loads, testing and commissioning should be performed by a qualified installer.

## 1. Pre-deployment checklist

- [ ] Confirm this code has been reviewed and merged before using it for the customer installation.
- [ ] Confirm the intended VikaTech Supabase project and Vercel project are selected.
- [ ] Back up the database and keep the currently working firmware file available.
- [ ] Confirm the base schema exists: `boards`, `devices`, `alarms`, `schedules`, `activity_logs`, `provisioning_records`, `account_approval_requests`, and `approval_audit_log`.
- [ ] Apply `supabase/device_management.sql` in Supabase Dashboard > SQL Editor and verify that it completes without errors.
- [ ] Set the same `PROVISIONING_ENCRYPTION_KEY` in Supabase Edge Function secrets and Vercel server-side environment variables.
- [ ] Deploy the updated `device-agent` Edge Function with custom device-token authentication enabled and built-in JWT verification disabled, as documented.
- [ ] Redeploy Vercel after updating server-side environment variables.
- [ ] Ensure the target board has the matching generic device-agent firmware and a unique enrolled device token.
- [ ] Review the Edge Function logs and the Vercel deployment logs before flashing a customer board.

See `supabase/device_management.md` for the exact CLI commands and deployment order.

## 2. Admin Panel responsiveness and navigation

| ID | Test | Expected result | Pass |
|---|---|---|---|
| UI-01 | Open Admin > Hardware on desktop | Device cards fit the viewport; device status, Wi-Fi mode, version and actions are readable | [ ] |
| UI-02 | Open Admin > Hardware on a mobile-width viewport | Cards stack into one column; no horizontal page overflow; buttons remain tappable | [ ] |
| UI-03 | Open a Wi-Fi tracker and a restart tracker on mobile | Progress steps, status messages, and event history remain readable | [ ] |
| UI-04 | Click Back to VikaTech site | Returns to the normal site without exposing credentials | [ ] |
| UI-05 | Open Admin Hardware while signed out or as a non-admin | Access is denied and a safe navigation option is shown | [ ] |
| UI-06 | Refresh the tracker page while a command is active | Tracker resumes from server-side status; it must not create a duplicate command | [ ] |

Record the tested browser, device width, and screenshot reference.

## 3. One-time board enrollment

| ID | Test | Expected result | Pass |
|---|---|---|---|
| EN-01 | Select an existing board that has not enrolled | UI explains that one-time firmware enrollment is needed; remote operations are disabled | [ ] |
| EN-02 | Prepare enrollment firmware with valid SSID and WPA2 password | Generated firmware is associated with exactly the selected board and contains no Supabase service-role credential | [ ] |
| EN-03 | Flash that firmware to the intended board and start it | Board makes an authenticated device-agent check-in; Hardware card becomes online after fresh heartbeat | [ ] |
| EN-04 | Check a different board's card | It does not become enrolled from the first board's token or heartbeat | [ ] |
| EN-05 | Inspect browser/network responses and logs | Existing Wi-Fi password and encryption key are never displayed in the Admin UI or ordinary status response | [ ] |

Treat the generated firmware file as a secret because it contains a per-device credential and first-boot network configuration.

## 4. Remote restart - direct connection

| ID | Test | Expected result | Pass |
|---|---|---|---|
| RS-01 | Select an enrolled board with a fresh direct check-in | Restart action is enabled only for that board | [ ] |
| RS-02 | Confirm Restart ESP32 | Server creates one pending command for that exact board; tracker opens with the returned command ID | [ ] |
| RS-03 | Keep the tracker open | It shows queued/accepted/restarting states based on server acknowledgements, without resubmitting the command | [ ] |
| RS-04 | ESP32 reboots and checks in again | Command becomes completed only when completion and a fresh direct connection are confirmed | [ ] |
| RS-05 | Try to submit another restart while one is pending | Second active restart is rejected; tracker/history points to the existing command | [ ] |
| RS-06 | Target board is stale/offline | API rejects the new restart with an offline response; it does not claim that the command was delivered | [ ] |
| RS-07 | Command expires or device reports failure | Tracker shows a terminal failure/cancelled state with the server/device error, not success | [ ] |

A successful HTTP queue response alone is not proof that the ESP32 rebooted.

## 5. Remote restart - mesh member

| ID | Test | Expected result | Pass |
|---|---|---|---|
| MS-01 | Select a member visible through an online leader but not directly online | UI identifies mesh-gateway delivery | [ ] |
| MS-02 | Confirm restart for that member | Command carries the selected member identifier and is assigned to one authorized gateway | [ ] |
| MS-03 | Leader receives the command | It forwards a signed command to the matching member; another member must refuse it | [ ] |
| MS-04 | Leader is online but member does not rejoin | Tracker stays pending/attention-needed; leader health alone does not mark the member restarted | [ ] |
| MS-05 | Correct member reboots and rejoins | The target member's return is observed before success is shown | [ ] |
| MS-06 | Member is no longer visible or gateway is offline | The command does not report successful delivery; inspect expiry and retry behavior | [ ] |

## 6. Wi-Fi configuration update

Wi-Fi SSID is required. Security is explicit: `open` or `wpa2_psk`. Do not infer an open network just because a password field is blank.

| ID | Test | Expected result | Pass |
|---|---|---|---|
| WF-01 | Submit an empty SSID | Client/API rejects it and no configuration version is created | [ ] |
| WF-02 | Choose None / Open Network | Password is cleared in the saved configuration; device attempts `WiFi.begin(ssid)` | [ ] |
| WF-03 | Choose WPA2-PSK with valid password | Device receives an authenticated encrypted envelope, tests network visibility, attempts connection, then commits only after connection succeeds | [ ] |
| WF-04 | Supply a missing/invalid WPA2 password | UI/API rejects the request; no new configuration is queued | [ ] |
| WF-05 | Enter an SSID that the ESP32 cannot see | Device reports failure and does not mark the new version applied | [ ] |
| WF-06 | Enter a wrong password while the previous network is available | Device attempts rollback to last known-good settings and reports the failure | [ ] |
| WF-07 | New network fails and the previous network also cannot be restored | Tracker shows the recovery warning; do not show success. Use the approved local re-enrollment process | [ ] |
| WF-08 | Valid update succeeds | Server applied version equals device applied version; direct online status is fresh; tracker reports completion | [ ] |
| WF-09 | Change security from WPA2 to Open | Existing stored password is cleared only after a valid update request; device stores `wifi_sec=open` | [ ] |
| WF-10 | Try to retain a password while selecting Open | API rejects contradictory settings | [ ] |

## 7. Configuration race and integrity tests

| ID | Test | Expected result | Pass |
|---|---|---|---|
| RC-01 | Two admins submit different Wi-Fi settings at nearly the same time | One compare-and-set succeeds; the stale request receives a conflict and must refresh | [ ] |
| RC-02 | A configuration expires while a newer version is being saved | Expiry cannot change the newer version's status to failed | [ ] |
| RC-03 | A late `checking_wifi` acknowledgement arrives after the version becomes applied/failed | The terminal status is preserved; no duplicate event falsely changes the final status | [ ] |
| RC-04 | The server changes config version between snapshot fetch and envelope response | Stale envelope is not returned; ESP32 retries on a fresh poll | [ ] |
| RC-05 | Tamper with envelope ciphertext/tag | Firmware rejects it and does not apply the Wi-Fi settings | [ ] |
| RC-06 | Use the envelope for another board or version | Authentication fails because board/version associated data does not match | [ ] |
| RC-07 | Revoke the device token | Subsequent device-agent requests are rejected and remote operations stop | [ ] |

The automated envelope and contract tests cover part of RC-05 and RC-06. The remaining tests require integration or controlled device testing.

## 8. Automated checks before/after PR update

Run from the repository root:

```bash
npm ci
npm run test:device-management
npm run build
```

The GitHub Actions workflow additionally compiles `esp32.cpp` with Arduino-ESP32 core 3.1.0 and the configured ArduinoJson/WebSockets dependencies. Check the latest run, not an older successful run. A CI compile does not replace a physical-board test.

## 9. Supabase deployment sequence

1. In Supabase Dashboard > SQL Editor, run the current `supabase/device_management.sql` against the intended project. Save the query and verify completion.
2. On the development computer, run `supabase login`, then `supabase projects list` and confirm the project reference.
3. Run `supabase link --project-ref YOUR_PROJECT_REF`.
4. Generate a strong random encryption key with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
5. Set it as a Supabase secret:
   ```bash
   supabase secrets set PROVISIONING_ENCRYPTION_KEY="YOUR_GENERATED_VALUE"
   supabase secrets list
   ```
6. Set exactly the same value as server-side `PROVISIONING_ENCRYPTION_KEY` in the Vercel project and redeploy Vercel. Do not use a `NEXT_PUBLIC_` variable.
7. Deploy the Edge Function from the repository root:
   ```bash
   supabase functions deploy device-agent --no-verify-jwt
   ```
8. Review Edge Function logs. Confirm the default `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` runtime variables are available. Do not set a new secret using the reserved `SUPABASE_` prefix and never put the service-role key in firmware.
9. Enroll one isolated test board, run RS-01 to RS-07 and WF-01 to WF-10, then test the mesh scenarios. Only proceed to the customer installation after the results are recorded.

Official references:
- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/reference/cli/global-flags

## 10. Test results record

- Repository commit / PR SHA: ______________________________________
- Supabase project reference (do not write secrets here): __________________
- Edge Function deployment time: ___________________________________
- Vercel deployment ID: ____________________________________________
- ESP32 board identifier under test: _________________________________
- Hardware model / firmware build: __________________________________
- Tester and date: __________________________________________________
- Failed test IDs and issue links: ____________________________________
- Approved to continue to customer installation: [ ] Yes  [ ] No

Do not record Wi-Fi passphrases, device bearer tokens, encryption keys or service-role credentials in this document.
