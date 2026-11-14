-- ESP32 power-loss / offline notification preference.
-- Apply this migration before deploying the notification cron changes.
alter table public.user_settings
  add column if not exists notify_device_offline boolean not null default true;

comment on column public.user_settings.notify_device_offline is
  'Send a background notification when a provisioned ESP32 misses its direct heartbeat for two minutes.';
