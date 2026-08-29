-- VikaTech account approval, order approval, audit, and provisioning support.
-- Run this migration in Supabase SQL editor before enabling the new UI.
create extension if not exists pgcrypto;

create table if not exists public.account_approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  account_status text not null default 'pending' check (account_status in ('pending','approved','rejected','revoked')),
  admin_one_email text,
  admin_one_approved_at timestamptz,
  admin_two_email text,
  admin_two_approved_at timestamptz,
  rejection_reason text,
  requested_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  first_approved_at timestamptz,
  second_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_trackings add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.order_trackings add column if not exists approval_status text not null default 'approved' check (approval_status in ('awaiting_account_approval','awaiting_second_admin','approved','rejected'));
alter table public.order_trackings add column if not exists rejection_reason text;

create table if not exists public.provisioning_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null,
  board_name text not null,
  board_identifier text not null unique,
  encrypted_password text not null,
  setup_token_hash text,
  setup_token_expires_at timestamptz,
  setup_token_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  order_id text,
  actor_email text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.create_account_approval_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.account_approval_requests (user_id, email, account_status)
  values (new.id, lower(new.email), 'pending')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_approval on auth.users;
create trigger on_auth_user_created_approval
  after insert on auth.users
  for each row execute function public.create_account_approval_request();

-- Existing customer accounts must be reviewed. Only the two configured
-- administrators remain pre-approved so they can process the queue.
insert into public.account_approval_requests (user_id, email, account_status)
select id, lower(email), case when lower(email) in ('lrvkausthubh@gmail.com', 'ramasaiahemanth@gmail.com') then 'approved' else 'pending' end from auth.users
on conflict (user_id) do nothing;

update public.account_approval_requests
set account_status = 'pending', admin_one_email = null, admin_one_approved_at = null,
    admin_two_email = null, admin_two_approved_at = null, first_approved_at = null,
    second_approved_at = null, rejection_reason = null, updated_at = now()
where lower(email) not in ('lrvkausthubh@gmail.com', 'ramasaiahemanth@gmail.com');

update public.account_approval_requests
set account_status = 'approved', updated_at = now()
where lower(email) in ('lrvkausthubh@gmail.com', 'ramasaiahemanth@gmail.com');

update public.order_trackings o
set approval_status = case when lower(a.email) in ('lrvkausthubh@gmail.com', 'ramasaiahemanth@gmail.com') then 'approved' else 'awaiting_account_approval' end
from public.account_approval_requests a
where o.user_id = a.user_id;

alter table public.account_approval_requests enable row level security;
alter table public.provisioning_records enable row level security;
alter table public.approval_audit_log enable row level security;
create policy "users read own approval" on public.account_approval_requests for select using (auth.uid() = user_id);
create policy "users read own provisioning" on public.provisioning_records for select using (auth.uid() = user_id);
