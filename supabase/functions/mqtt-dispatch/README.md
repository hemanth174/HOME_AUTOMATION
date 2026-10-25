# MQTT Dispatch Edge Function

Required secrets:

```text
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
MQTT_SUPABASE_URL=<friend MQTT Supabase project URL>
MQTT_SUPABASE_ANON_KEY=<friend MQTT Supabase anon key>
MQTT_INGEST_SECRET=<same value configured in custom_mqtt_server>
```

Optional secret:

```text
MQTT_DISPATCH_WEBHOOK_SECRET=<secret checked in x-dispatch-secret>
```

The function queries `public.app_discovery` on every request. The row with
`id = true` must contain the current HTTPS Cloudflare tunnel URL. It then
signs a command and posts it to `/api/device/command` on the local server.
