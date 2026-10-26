# MQTT Dispatch Edge Function

## Project mapping

This function runs in the VikaTech application project:

```text
SUPABASE_URL=https://ojuvphlkzbxwjhqzexbt.supabase.co
```

The checked-in friend bridge frontend currently uses this separate project for
`public.app_discovery`:

```text
MQTT_SUPABASE_URL=https://htlrmrkhuzunrceshsrk.supabase.co
```

Do not swap these URLs. The application project owns `boards` and `devices`;
the friend project owns the current Cloudflare tunnel discovery row.

Required secrets:

```text
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
MQTT_SUPABASE_URL=<friend MQTT Supabase project URL>
MQTT_SUPABASE_ANON_KEY=<friend MQTT Supabase anon key>
MQTT_INGEST_SECRET=<same value configured in mqtt-server/.env>
```

Optional secret:

```text
MQTT_DISPATCH_WEBHOOK_SECRET=<secret checked in x-dispatch-secret>
```

Leave `MQTT_DISPATCH_WEBHOOK_SECRET` unset when dispatch is triggered by
`supabase/mqtt_dispatch.sql`, because the database trigger intentionally sends
no secret header. Configure this optional secret only when an external caller
will send the matching `x-dispatch-secret` header, or update the database
trigger and deploy the matching secret together.

The function queries `public.app_discovery` on every request. The row with
`id = true` must contain the current HTTPS Cloudflare tunnel URL. It then
signs a command and posts it to `/api/device/command` on the local server.

## Deployment order

1. Keep `mqtt-server/` running with matching `MQTT_INGEST_SECRET`, MQTT broker
   settings, and its device gateway token.
2. Run `mqtt-server/start-tunnel.ps1` so the discovery project's
   `public.app_discovery.backend_url` contains the current HTTPS tunnel URL.
3. Deploy this function with the required secrets:

```text
supabase functions deploy mqtt-dispatch --no-verify-jwt
```

4. Run `supabase/mqtt_dispatch.sql` in the VikaTech application project.
5. Change one device's `is_on` value and verify the bridge receives
   `POST /api/device/command`, then publishes
   `home/<boardIdentifier>/device/<relayIndex>/set`.

The ESP32 firmware (`esp32.cpp` and `test_1_board-vikatech.ino`) now contains a
PubSubClient MQTT client. It subscribes to
`home/<boardIdentifier>/device/+/set`, publishes retained state on `.../state`,
and publishes a retained `{"online":true}` heartbeat/LWT on `.../status`.
Successful bridge publication still only proves cloud-to-broker dispatch; the
direct ESP32 path must be confirmed on hardware via the serial log lines
`-> MQTT connected`, `-> MQTT subscribed`, and `<< MQTT command`.
