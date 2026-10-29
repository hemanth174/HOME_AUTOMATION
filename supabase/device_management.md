# VikaTech ESP32 Device Management

This migration adds authenticated per-board configuration and remote software-restart commands. It does not actuate the physical EN pin; it requests ESP.restart() from the device-agent firmware.

## Deployment order (do this in sequence)

**Do not start with the Admin Panel.** The database schema and Edge Function must be deployed before a board can enroll or receive configuration updates.

1. Confirm the base VikaTech schema exists: `boards`, `devices`, `alarms`, `schedules`, `activity_logs`, `provisioning_records`, `account_approval_requests`, and `approval_audit_log`.
2. In the Supabase Dashboard, open **SQL Editor**, create a new query, paste the complete current `supabase/device_management.sql` from this branch, and run it against the intended VikaTech project. Verify the tables and `public.device_agent_snapshot(text, text)` function were created. This file is currently a standalone SQL script, not a file under `supabase/migrations`; do not assume `supabase db push` will apply it automatically.
3. Generate a random encryption secret locally using the command below. Store it in a password manager. Set the exact same value as `PROVISIONING_ENCRYPTION_KEY` in the Supabase Edge Function secrets and the Vercel server environment. Never commit it, put it in a browser variable, or prefix it with `NEXT_PUBLIC_`.
4. Confirm the Vercel server has `NEXT_PUBLIC_SUPABASE_URL` set to the intended Supabase project URL and has its existing server-only admin credentials configured. Never put the service-role key into the ESP32 or browser bundle.
5. Link the local repository to the target Supabase project using the steps below, then deploy `device-agent` with JWT verification disabled. This function authenticates the ESP32 using its unique random bearer token and validates board ownership inside the function.
6. Verify the function is deployed and inspect its logs for missing environment variables or SQL/RPC errors. Only then prepare the one-time enrollment firmware for an existing board.
7. Wi-Fi configuration requires a recent direct check-in from that exact ESP32. Remote restart may instead use a live authenticated mesh leader when the selected member is currently visible on that leader's mesh.
8. After changing the Vercel server environment variables, redeploy the Vercel application. Save the Supabase and Vercel deployments before flashing any customer board.

### Supabase CLI commands

Run these commands from the repository root on your development computer. Replace the project reference with the correct VikaTech project ID; do not paste the project's service key in any command.

```bash
# Authenticate the CLI and identify the target project.
supabase login
supabase projects list

# Connect this checkout to the intended project.
supabase link --project-ref YOUR_PROJECT_REF

# Generate a strong random secret. Copy the output into a password manager.
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# Set the generated value as a production Edge Function secret.
supabase secrets set PROVISIONING_ENCRYPTION_KEY="PASTE_THE_GENERATED_RANDOM_VALUE"

# Deploy using the device's custom Bearer-token authentication.
supabase functions deploy device-agent --no-verify-jwt

# Confirm configured secret names (this does not print their values).
supabase secrets list
```

Supabase injects its project URL and server API keys into the Edge Function runtime; do not attempt to create a custom secret whose name begins with `SUPABASE_`. The deployed `device-agent` uses `SUPABASE_URL` and the existing `SUPABASE_SERVICE_ROLE_KEY` runtime variable server-side. These credentials must never be sent to the ESP32. See the official [Supabase function deployment guide](https://supabase.com/docs/guides/functions/deploy), [secrets guide](https://supabase.com/docs/guides/functions/secrets), and [CLI command reference](https://supabase.com/docs/reference/cli/global-flags).

### Encryption contract

The saved Wi-Fi passphrase is first protected in database storage using AES-256-GCM with `PROVISIONING_ENCRYPTION_KEY`. After authenticating the exact device, the Edge Function decrypts that stored value only in server memory and wraps the pending configuration in a second AES-256-GCM envelope. The envelope key is derived from the per-device token, and its authenticated associated data binds it to `board_identifier` and `config_version`. The ESP32 uses mbedTLS to verify the authentication tag and version before applying the configuration. HTTPS certificate validation protects transport as well; the envelope is an additional device-bound layer.

The current SQL file is idempotent and includes the direct/mesh liveness columns, command expiry, one-active-restart constraint and service-role-only snapshot RPC. Reapply the whole script only after reviewing any SQL errors; do not ignore a failed statement and proceed to firmware enrollment.

## First-time board enrollment

1. In VikaTech, open Admin Panel -> Hardware.
2. Find the customer's board and select Prepare one-time enrollment firmware.
3. In the Wi-Fi drawer, enter the customer's Wi-Fi SSID, choose Open Network or WPA2-PSK, and enter the password when required. These credentials are built into the downloaded firmware.
4. Flash the generated firmware once over USB. The generated image contains that board's identifier, a unique revocable device-agent token, and the first-boot Wi-Fi credentials. It does not contain the Supabase service-role key.
5. Refresh Hardware in the Admin Panel until the board shows Online. The board's first authenticated device-agent check-in marks it as enrolled. There is no local setup page.

After that one-time flash and enrollment, supported Wi-Fi configuration updates and software restarts can be sent remotely. If the board is offline, the admin action remains unavailable or pending; a server cannot reach a device that has no network path.

## Remote Wi-Fi configuration

- The password is encrypted server-side using AES-256-GCM before storage in `device_runtime_configs.encrypted_wifi_password`.
- After the device's bearer token and board identity are verified, the Edge Function decrypts the stored value only in memory and encrypts the configuration into a second AES-256-GCM envelope bound to the exact board identifier and configuration version.
- The firmware verifies the envelope's GCM authentication tag and the version before applying anything. The configuration is also delivered over CA-validated HTTPS; plaintext configuration secrets are not returned in the device-agent JSON response.
- The ESP32 tests the selected SSID and then attempts a connection before it saves the accepted settings and config_version to NVS.
- On a failed attempt it tries to reconnect using the last known-good settings and reports a failure when connectivity is restored.
- Open-network mode is explicit. An empty password does not implicitly change a WPA2 configuration to an open network.
- The tracking page shows the server event log and the ESP32's actual checking_wifi, applying, applied, or failed acknowledgements. It must not display success merely because the server accepted a form submission.

## Remote restart

The admin API queues a row in device_commands with a five-minute expiry. The device-agent only returns an unexpired command to the authenticated board. The board checks the returned board identifier, acknowledges acceptance, restarts using ESP.restart(), then reports completion after it reconnects. A duplicate active restart request is rejected. This is a software restart, not electrical control of the board's EN/reset button. Relay outputs and connected loads can be affected by reboot/startup behavior; test safely before using it on a live installation.

Boards visible only through the local mesh are shown as mesh-reachable. Remote Wi-Fi configuration stays disabled until the target board checks in directly, because the leader must not apply another board's Wi-Fi configuration. A restart can be routed through a fresh mesh gateway: the device-agent assigns the command to one gateway using gateway_board_id, the leader forwards a signed request to the exact target node, the target validates its board identifier and HMAC, and the command is marked complete only after the target rejoins the mesh. Commands routed through a gateway are filtered out of the target's direct polling snapshot to avoid duplicate execution.

## Restart progress tracker

From Admin Panel -> Hardware, select the exact device card and confirm **Restart this ESP32**. After the server queues the command, the Admin Panel opens `/admin/devices/{boardId}/restart` with the returned command ID and delivery mode.

- Direct mode is marked successful only when the command is completed and the board has a fresh direct device-agent check-in.
- Mesh-gateway mode waits for the selected member to return to the mesh or a direct connection. A healthy leader by itself is not proof that the selected member restarted.
- The tracker polls command and configuration status; it does not re-submit the restart command when the user refreshes or leaves the page.
- If the command fails or expires, review the board's latest status and command history before requesting another restart.

## Run checks before deployment

From the repository root, run:

```bash
npm ci
npm run test:device-management
npm run build
```

The GitHub Actions workflow also compiles `esp32.cpp` with Arduino-ESP32 core 3.x. After merging a frontend-only tracker change, no new SQL migration or Edge Function deployment is required beyond the device-management migration and `device-agent` deployment described above. If those have not yet been deployed to this Supabase project, complete the pre-deployment steps first.

## Important security notes

- Never put the Supabase service-role key in shipped firmware or browser code. The device-agent function keeps it server-side and scopes operations to the authenticated device's board and customer.
- Each board has an independent random token. Only its SHA-256 hash is used to authenticate it from the database; the recoverable token is encrypted server-side for the pre-first-check-in firmware download. Treat the generated firmware file as a secret and restrict access.
- HTTPS verification requires Arduino-ESP32 core 3.x in this firmware branch. Older cores deliberately refuse device-agent requests instead of disabling certificate validation.
- The ESP32 Preferences (NVS) stores Wi-Fi credentials for offline startup. This code does not by itself enable encrypted NVS/flash. For production hardware, configure and test ESP32 flash encryption and Secure Boot (and NVS encryption where appropriate) for the exact ESP32 chip and manufacturing workflow.
- PROVISIONING_ENCRYPTION_KEY rotation requires a planned migration for already stored encrypted values; do not rotate it casually.
- No live cloud, firmware compilation, or physical relay test is implied by this code change. Validate the migration, secrets, Edge Function deployment, firmware compile, Wi-Fi rollback, restart acknowledgement, and hardware safely before relying on it.