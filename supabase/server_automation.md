# Server-owned schedules and alarms

The website stores alarms and schedules in the VikaTech Supabase project. After a
successful edit, it invokes the JWT-protected `automation-dispatch` Edge
Function. That function discovers the current Cloudflare tunnel and sends an
HMAC-signed refresh request to the custom MQTT backend. A 15-second backend
refresh also catches missed browser requests and edits made outside the site.

The backend checks due times in the user's `user_settings.timezone`, claims an
alarm or a `schedule_runs` occurrence, updates `devices.is_on`, and writes an
activity log. The existing `devices_mqtt_dispatch` trigger and `mqtt-dispatch`
Edge Function send changed device states over MQTT/WSS. When a timed action
requests a state already stored in the database, the backend publishes the same
retained MQTT command directly. If the MQTT path is down,
the ESP32 reconciles the same `devices` row through its cloud polling fallback.
The backend uses a five-minute catch-up window after a restart; older missed
alarms do not actuate unexpectedly.

The custom backend needs `APP_SUPABASE_URL` and
`APP_SUPABASE_SERVICE_ROLE_KEY` from the **VikaTech app** project in its private
`.env`. Its existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` continue to
point at the separate MQTT discovery project. Both keys must stay on the
server. The Docker image includes `automationScheduler.js`.

Flash the updated `esp32_code_optimized.cpp` for the active optimized firmware.
`esp32.cpp` in this repository and the custom server's `esp32_code.cpp` and
`esp_test.cpp` have also had local alarm/schedule execution removed. Existing boards keep their old
firmware until flashed. NTP remains for TLS certificate validation and event
timestamps; it no longer decides when an alarm or schedule should switch a
relay. An old `sched_cache` NVS entry is removed once during boot.

## Which firmware to run and what the blue LED means

For the current board, copy the contents of `esp32_code_optimized.cpp` from the
custom MQTT server folder into an Arduino sketch (`.ino`), select the ESP32
board with the `huge_app` partition scheme, and upload it. The website and server code
alone cannot update firmware already on the board. The website's provisioning
download routes still default to the older GitHub `esp32.cpp` template, so do
not use that download as a substitute for the optimized file until its source
is updated and board credentials are provisioned there. Do not upload
`esp32_code.cpp` or `esp_test.cpp` for this rollout.

GPIO2 drives the blue status LED. While WSS is connected it repeats three
quick flashes (90 ms on, 110 ms between flashes) followed by a 900 ms pause.
It stays off when WSS is disconnected. Change `WSS_STATUS_LED` if the physical
board uses another LED pin, or `WSS_LED_ACTIVE_HIGH` if its LED is active low.
The pattern indicates the WSS socket is connected; it does not prove the MQTT
broker is healthy. The node monitor's `MQTT: HEALTHY` field confirms the full
command path. The animation uses the existing main loop and no extra task.

## Diagnosing glitches

Previous serial logs showed a TLS BIGNUM allocation failure during old
device-agent HTTPS requests. The optimized firmware disables that agent,
serializes cloud TLS calls, and defers them when the largest internal free
memory block is too small. Discovery and fallback polling still use TLS, so
watch `Heap free/min/largest` in the node monitor. The firmware deliberately
restarts after a 30-second main-loop stall or more than two minutes below 16 KB
free heap. It does not restart just because Wi-Fi is unavailable.

A WSS drop alone does not change relay state. It enables database polling while
the socket reconnects. A reboot is different: startup first drives every
active-low relay OFF, then restores any saved ON state with 150 ms spacing.
That can briefly interrupt a connected load. If the light flickers, compare
the serial reset reason and `MAIN LOOP STALL` / `CRITICAL WATCHDOG` lines with
the event time. A connected LED with `MQTT: FALLBACK` means the WSS connection
exists but the broker path is not currently healthy.

The optimized firmware now skips cloud device-state polling entirely while the
WSS gateway reports a healthy MQTT broker path. If that path goes down, it
starts an immediate fallback poll, then polls every 10 seconds while offline.
Polling stops again when MQTT recovers. Cloud sync and heartbeat work are
separate from this device-state polling rule. An HTTP poll already in progress
when MQTT recovers may finish; no new poll should start while the path is
healthy. The former 3-second healthy-path poll was visible in the serial log
and added avoidable TLS memory pressure.

If the gateway socket disconnects, offline discovery now recreates the WSS
client even when the discovered URL text is unchanged. Previously it waited
for six 30-second discovery cycles before doing that, which could leave it
trying a stale socket until the board was reset. A changed Cloudflare Quick
Tunnel address still requires discovery to succeed; the serial monitor now
prints its HTTP status when discovery fails. The board keeps the local mesh
and cloud polling fallback during reconnection.

## Automations when MQTT or the Node server is down

Run `supabase/esp32_automation_fallback.sql` once in the **VikaTech app**
Supabase SQL editor before flashing the updated firmware. On each 10-second
fallback poll, the ESP32 invokes this database function. Supabase uses its own
clock and the user's timezone to find due alarms and schedules, atomically
claims them using the same `alarms.fired` and `schedule_runs` records used by
the Node scheduler, updates the device state, and returns current relay states.
The ESP32 applies those states immediately. It does not cache alarm or schedule
rows locally or perform timing calculations. When MQTT is healthy, this request
stops and the Node scheduler remains the normal execution path.
The SQL function also updates `boards.last_seen` on each successful fallback
request, so the website can show that the board is reachable through cloud
polling even when WSS is down. Re-run the SQL file if an earlier version was
already installed.

If device-state polling works but due automations do not, re-run the current
SQL file. An older version rejected the RPC by reading a legacy PostgREST JWT
setting even for the service role. The current version relies on explicit
`REVOKE`/`GRANT` permissions instead. The firmware logs the RPC HTTP status
when it falls back to device-only reads, so a successful device poll no longer
looks like proof that automations were checked.

The function uses a five-minute catch-up window and requires the existing
`schedule_runs` table. If the SQL has not been installed yet, the firmware
still falls back to reading device states, but due automations cannot run when
the Node server is down. HTTPS certificate failures or an unreachable Supabase
project also prevent this cloud fallback; local switches and mesh remain
available.
