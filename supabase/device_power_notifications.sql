-- ESP32 power-loss / offline notification preference.
-- Apply this migration before deploying the notification cron changes.
begin;

alter table public.user_settings
  add column if not exists notify_device_offline boolean not null default true;

comment on column public.user_settings.notify_device_offline is
  'Send a background notification when a provisioned ESP32 has no recent direct, mesh, or WSS gateway presence for two minutes.';

-- The notification cron writes both outage and recovery types.
-- Preserve the five existing types while allowing outage and recovery alerts.
alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in ('alarm', 'schedule', 'energy', 'ghost', 'system', 'device_offline', 'device_online'));

commit;
