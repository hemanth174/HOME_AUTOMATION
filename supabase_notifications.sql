-- VikaTech unified notifications + Web Push
-- Run this in the Supabase SQL editor after the base user_settings / devices /
-- schedules / alarms / activity_logs tables exist.

-- ---------------------------------------------------------------------------
-- 1. Preferences
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists notifications_enabled boolean not null default true,
  add column if not exists notify_alarm boolean not null default true,
  add column if not exists notify_schedule boolean not null default true,
  add column if not exists schedule_lead_minutes integer not null default 5
    check (schedule_lead_minutes between 0 and 60),
  add column if not exists notify_energy boolean not null default true,
  add column if not exists energy_device_kwh_threshold numeric(8,3) not null default 3
    check (energy_device_kwh_threshold > 0),
  add column if not exists notify_ghost boolean not null default true,
  add column if not exists ghost_summary_hour integer not null default 20
    check (ghost_summary_hour between 0 and 23),
  add column if not exists dashboard_view_switcher_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Persisted notification history
-- ---------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('alarm', 'schedule', 'energy', 'ghost', 'system')),
  title text not null,
  body text not null,
  url text not null default '/',
  dedupe_key text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

grant select, insert, update, delete on table public.user_notifications to authenticated;

drop policy if exists "Users can read their notifications" on public.user_notifications;
create policy "Users can read their notifications"
  on public.user_notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their notifications" on public.user_notifications;
create policy "Users can create their notifications"
  on public.user_notifications
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their notifications" on public.user_notifications;
create policy "Users can update their notifications"
  on public.user_notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their notifications" on public.user_notifications;
create policy "Users can delete their notifications"
  on public.user_notifications
  for delete to authenticated
  using (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.user_notifications;
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Web Push subscriptions (one row per browser / device)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on table public.push_subscriptions to authenticated;

drop policy if exists "Users can read their push subscriptions" on public.push_subscriptions;
create policy "Users can read their push subscriptions"
  on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their push subscriptions" on public.push_subscriptions;
create policy "Users can create their push subscriptions"
  on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their push subscriptions" on public.push_subscriptions;
create policy "Users can update their push subscriptions"
  on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their push subscriptions" on public.push_subscriptions;
create policy "Users can delete their push subscriptions"
  on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Schedule execution claims (prevents server + client double execution)
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  occurrence_at timestamptz not null,
  executed_at timestamptz not null default now(),
  source text not null default 'server',
  unique (schedule_id, occurrence_at)
);

create index if not exists schedule_runs_user_idx
  on public.schedule_runs (user_id, occurrence_at desc);

alter table public.schedule_runs enable row level security;

grant select, insert, delete on table public.schedule_runs to authenticated;

drop policy if exists "Users can read their schedule runs" on public.schedule_runs;
create policy "Users can read their schedule runs"
  on public.schedule_runs
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can claim their schedule runs" on public.schedule_runs;
create policy "Users can claim their schedule runs"
  on public.schedule_runs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.schedules s
      where s.id = schedule_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their schedule runs" on public.schedule_runs;
create policy "Users can delete their schedule runs"
  on public.schedule_runs
  for delete to authenticated
  using (user_id = auth.uid());
