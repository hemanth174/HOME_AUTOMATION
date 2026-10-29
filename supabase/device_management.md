# VikaTech ESP32 Device Management

This migration adds authenticated per-board configuration and remote software-restart commands. It does not actuate the physical EN pin; it requests ESP.restart() from the device-agent firmware.

## Before deployment

1. Confirm the base VikaTech schema exists, including boards, devices, alarms, schedules, activity_logs, provisioning_records, account_approval_requests, and approval_audit_log.
2. Apply supabase/device_management.sql in the VikaTech Supabase SQL Editor. It adds configuration, command and event tables, the service-role-only snapshot RPC, and first-seen enrollment tracking.
3. Configure the exact same PROVISIONING_ENCRYPTION_KEY in Vercel (server environment) and Supabase Edge Function secrets. Use a randomly generated value of at least 32 characters. Do not use a fallback/default key.
4. Apply the latest version of the migration before deploying the latest Edge Function; it adds separate direct and mesh timestamps plus an expiry time for restart commands. The migration is idempotent and backfills existing direct check-ins.
5. Remote Wi-Fi configuration requires a fresh direct authenticated check-in from the exact target ESP32. Remote restart can also be routed through a live leader when the target is visible as a fresh member of that leader's local mesh; the leader signs the board-specific request with the shared mesh secret, and the member must verify the signature and its own board identifier before rebooting.
6. Make sure the Vercel server has NEXT_PUBLIC_SUPABASE_URL set to the VikaTech Supabase project URL. This variable is the public project URL, not a service-role key.
7. Deploy the device-agent function without Supabase JWT verification because the ESP32 presents a unique random device token in its Bearer header; the function authenticates and scopes that token itself.

Example commands:

```bash
# Generate a strong secret locally, then use the same value in both environments.
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# From the repository root, link the CLI to the customer's VikaTech project once.
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Apply supabase/device_management.sql in the Supabase Dashboard SQL Editor
# before deploying the function, or copy it into a timestamped file under
# supabase/migrations/ and then run: supabase db push

# Deploy the function with per-device Bearer-token authentication.
# Keep the _shared/device-config-crypto.mjs file alongside the function.
supabase functions deploy device-agent --no-verify-jwt

# Set this exact secret in Supabase Edge Function secrets.
supabase secrets set PROVISIONING_ENCRYPTION_KEY="PASTE_THE_GENERATED_RANDOM_VALUE"
```

Set the same PROVISIONING_ENCRYPTION_KEY in the Vercel project server environment and redeploy Vercel. Never prefix this secret with NEXT_PUBLIC_.

The latest `supabase/functions/device-agent/index.ts` imports `supabase/functions/_shared/device-config-crypto.mjs`. Deploy the whole function with that shared file present; do not copy only `index.ts` into the Supabase Dashboard editor. The repository test command is `npm run test:device-management`. A GitHub Actions workflow runs those contract tests and compiles `esp32.cpp` against Arduino-ESP32 core 3.1.0.

## First-time board enrollment

1. In VikaTech, open Admin Panel -> Hardware.
2. Find the customer's board and select Prepare one-time enrollment firmware.
3. In the Wi-Fi drawer, enter the customer's Wi-Fi SSID, choose Open Network or WPA2-PSK, and enter the password when required. These credentials are built into the downloaded firmware.
4. Flash the generated firmware once over USB. The generated image contains that board's identifier, a unique revocable device-agent token, and the first-boot Wi-Fi credentials. It does not contain the Supabase service-role key.
5. Refresh Hardware in the Admin Panel until the board shows Online. The board's first authenticated device-agent check-in marks it as enrolled. There is no local setup page.

After that one-time flash and enrollment, supported Wi-Fi configuration updates and software restarts can be sent remotely. If the board is offline, the admin action remains unavailable or pending; a server cannot reach a device that has no network path.

## Remote Wi-Fi configuration

- The password is encrypted at rest with AES-256-GCM before storage in `device_runtime_configs.encrypted_wifi_password`. The Edge Function decrypts it only in memory.
- Before the configuration leaves the Edge Function, it is encrypted again with AES-256-GCM using a key derived from the authenticated board's unique device token. The additional authenticated data binds the envelope to the exact `board_identifier` and `config_version`.
- The Edge Function returns `configuration_envelope` (`A256GCM`, schema version, config version, random IV, and ciphertext-plus-tag), never a plaintext `config` object containing the Wi-Fi password.
- The ESP32 derives the same per-board key, authenticates/decrypts the envelope, checks the embedded version, and refuses to apply the settings if authentication fails. HTTPS remains mandatory; application-level encryption is an additional safeguard.
- The ESP32 tests the selected SSID and then attempts a connection before it saves the accepted settings and config_version to NVS.
- On a failed attempt it tries to reconnect using the last known-good settings and reports a failure when connectivity is restored.
- Open-network mode is explicit. An empty password does not implicitly change a WPA2 configuration to an open network.
- The tracking page shows the server event log and the ESP32's actual checking_wifi, applying, applied, or failed acknowledgements. It must not display success merely because the server accepted a form submission.

## Remote restart

The admin API queues a row in device_commands with a five-minute expiry. The device-agent only returns an unexpired command to the authenticated board. The board checks the returned board identifier, acknowledges acceptance, restarts using ESP.restart(), then reports completion after it reconnects. A duplicate active restart request is rejected. This is a software restart, not electrical control of the board's EN/reset button. Relay outputs and connected loads can be affected by reboot/startup behavior; test safely before using it on a live installation.

Boards visible only through the local mesh are shown as mesh-reachable. Remote Wi-Fi configuration stays disabled until the target board checks in directly, because the leader must not apply another board's Wi-Fi configuration. A restart can be routed through a fresh mesh gateway: the device-agent assigns the command to one gateway using gateway_board_id, the leader forwards a signed request to the exact target node, the target validates its board identifier and HMAC, and the command is marked complete only after the target rejoins the mesh. Commands routed through a gateway are filtered out of the target's direct polling snapshot to avoid duplicate execution.

## Important security notes

- Never put the Supabase service-role key in shipped firmware or browser code. The device-agent function keeps it server-side and scopes operations to the authenticated device's board and customer.
- Each board has an independent random token. Only its SHA-256 hash is used to authenticate it from the database; the recoverable token is encrypted server-side for the pre-first-check-in firmware download. Treat the generated firmware file as a secret and restrict access.
- HTTPS verification requires Arduino-ESP32 core 3.3.12 in this firmware branch. The GitHub workflow pins this version so the secure WebSocket CA-bundle wrapper and device-agent code compile against the same core. Older cores deliberately refuse device-agent requests instead of disabling certificate validation.
- The ESP32 Preferences (NVS) stores Wi-Fi credentials for offline startup. This code does not by itself enable encrypted NVS/flash. For production hardware, configure and test ESP32 flash encryption and Secure Boot (and NVS encryption where appropriate) for the exact ESP32 chip and manufacturing workflow.
- PROVISIONING_ENCRYPTION_KEY rotation requires a planned migration for already stored encrypted values; do not rotate it casually.
- No live cloud, firmware compilation, or physical relay test is implied by this code change. Validate the migration, secrets, Edge Function deployment, firmware compile, Wi-Fi rollback, restart acknowledgement, and hardware safely before relying on it.