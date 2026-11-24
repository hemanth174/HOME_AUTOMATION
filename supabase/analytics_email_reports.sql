-- Run once in the main VikaTech Supabase project's SQL Editor before deploying
-- the Settings and scheduled-report changes.
begin;

alter table public.user_settings
  add column if not exists analytics_report_frequency text not null default 'off';

alter table public.user_settings
  drop constraint if exists user_settings_analytics_report_frequency_check;
alter table public.user_settings
  add constraint user_settings_analytics_report_frequency_check
  check (analytics_report_frequency in ('off', 'weekly', 'monthly'));

create table if not exists public.analytics_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  unique (user_id, frequency, period_start)
);

alter table public.analytics_report_deliveries enable row level security;

create or replace function public.claim_analytics_report_delivery(
  p_user_id uuid, p_frequency text, p_period_start date, p_period_end date
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  insert into public.analytics_report_deliveries
    (user_id, frequency, period_start, period_end, status, claimed_at, error)
  values
    (p_user_id, p_frequency, p_period_start, p_period_end, 'sending', now(), null)
  on conflict (user_id, frequency, period_start) do update
    set status = 'sending', claimed_at = now(), error = null
    where analytics_report_deliveries.status = 'failed'
       or (analytics_report_deliveries.status = 'sending'
           and analytics_report_deliveries.claimed_at < now() - interval '2 hours')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.claim_analytics_report_delivery(uuid, text, date, date) from public, anon, authenticated;
grant execute on function public.claim_analytics_report_delivery(uuid, text, date, date) to service_role;

commit;
