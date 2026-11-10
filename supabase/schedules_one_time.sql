-- One-time (specific-date) schedules.
--
-- When `run_date` is set, the schedule runs once on that local calendar date
-- at `time` and `days` stays empty so the ESP32 does not treat it as a weekly
-- schedule. When `run_date` is null the schedule behaves exactly as before
-- (weekly repeat on `days`).
--
-- Run this once in the Supabase SQL editor.

alter table public.schedules
  add column if not exists run_date date;

create index if not exists schedules_run_date_idx
  on public.schedules (run_date)
  where run_date is not null;

comment on column public.schedules.run_date is
  'When set, this schedule runs only once on this local calendar date at `time`; null means weekly repeat on `days`.';
