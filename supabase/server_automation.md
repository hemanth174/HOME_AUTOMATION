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
