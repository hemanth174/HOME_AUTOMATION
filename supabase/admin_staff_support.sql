-- Run in the VikaTech application Supabase project, not the MQTT project.
-- Main-admin authority stays in server code; this table grants only limited staff access.
create table if not exists public.admin_staff (
  email text primary key check (email = lower(trim(email))),
  role text not null default 'sub_admin' check (role = 'sub_admin'),
  active boolean not null default true,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_staff enable row level security;
revoke all on public.admin_staff from anon, authenticated;

create table if not exists public.admin_staff_audit (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  staff_email text not null,
  action text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_staff_audit enable row level security;
revoke all on public.admin_staff_audit from anon, authenticated;

insert into public.admin_staff (email, role, active, added_by)
values
  ('peacefulguy2005@gmail.com', 'sub_admin', true, 'initial_setup'),
  ('akschayra@gmail.com', 'sub_admin', true, 'initial_setup')
on conflict (email) do nothing;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_email text not null,
  subject text not null check (char_length(trim(subject)) between 5 and 120),
  category text not null default 'general' check (category in ('general', 'device', 'billing', 'account')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_customer', 'resolved')),
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reply_at timestamptz not null default now()
);
create index if not exists support_tickets_owner_idx on public.support_tickets(user_id, updated_at desc);
create index if not exists support_tickets_queue_idx on public.support_tickets(status, updated_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'staff')),
  sender_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at);
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_ticket_messages from anon, authenticated;

-- Keep each reply and its ticket status in the same database transaction.
create or replace function public.sync_support_ticket_reply()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.support_tickets
  set status = case when new.sender_role = 'staff' then 'waiting_customer' else 'open' end,
      last_reply_at = new.created_at,
      updated_at = new.created_at
  where id = new.ticket_id;
  return new;
end;
$$;
revoke all on function public.sync_support_ticket_reply() from public, anon, authenticated;
drop trigger if exists support_ticket_reply_status on public.support_ticket_messages;
create trigger support_ticket_reply_status after insert on public.support_ticket_messages
for each row execute function public.sync_support_ticket_reply();

create or replace function public.set_sub_admin_active(p_email text, p_active boolean, p_actor text)
returns public.admin_staff
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_staff public.admin_staff%rowtype;
begin
  update public.admin_staff
  set active = p_active, updated_at = now()
  where email = lower(trim(p_email)) and role = 'sub_admin'
  returning * into v_staff;
  if not found then raise exception 'Sub admin not found'; end if;
  insert into public.admin_staff_audit(actor_email, staff_email, action)
  values (p_actor, v_staff.email, case when p_active then 'access_enabled' else 'access_disabled' end);
  return v_staff;
end;
$$;
revoke all on function public.set_sub_admin_active(text, boolean, text) from public, anon, authenticated;
grant execute on function public.set_sub_admin_active(text, boolean, text) to service_role;
