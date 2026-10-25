-- Supabase -> local MQTT server dispatch.
--
-- The Edge Function reads public.app_discovery on every invocation, so a new
-- Cloudflare Quick Tunnel URL is used without redeploying the function.
-- Deploy the function first:
--   supabase functions deploy mqtt-dispatch --no-verify-jwt
-- Then run this file.

create extension if not exists pg_net with schema extensions;

-- The friend-run MQTT Supabase project owns app_discovery. Configure its URL
-- and service-role key as Edge Function secrets instead of creating this table
-- in the app project.

create or replace function public.dispatch_device_state_to_mqtt()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- This is asynchronous. The device update is not blocked on the tunnel.
  perform net.http_post(
     url := 'https://ojuvphlkzbxwjhqzexbt.supabase.co/functions/v1/mqtt-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists devices_mqtt_dispatch on public.devices;

create trigger devices_mqtt_dispatch
after update of is_on on public.devices
for each row
when (OLD.is_on is distinct from NEW.is_on)
execute function public.dispatch_device_state_to_mqtt();

-- Confirm the trigger after installation:
-- select tgname, tgenabled
-- from pg_trigger
-- where tgrelid = 'public.devices'::regclass
--   and tgname = 'devices_mqtt_dispatch';
