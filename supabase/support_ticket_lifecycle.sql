-- Run in the VikaTech application Supabase project after admin_staff_support.sql.
-- Existing tickets stay active. Deleted tickets retain their messages for 30 days.
alter table public.support_tickets add column if not exists deleted_at timestamptz;
alter table public.support_tickets add column if not exists deleted_by uuid references auth.users(id) on delete set null;
create index if not exists support_tickets_deleted_idx
  on public.support_tickets(deleted_at) where deleted_at is not null;

-- Short-lived presenceseeeonly. Draft text is never stored.
create table if not exists public.support_ticket_typing (
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_role text not null check (actor_role in ('customer', 'staff')),
  expires_at timestamptz not null,
  primary key (ticket_id, user_id)
);
create index if not exists support_ticket_typing_expiry_idx
  on public.support_ticket_typing(expires_at);
alter table public.support_ticket_typing enable row level security;
revoke all on public.support_ticket_typing from anon, authenticated;

create or replace function public.purge_expired_support_tickets()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.support_ticket_typing where expires_at < now();
  delete from public.support_tickets where deleted_at < now() - interval '30 days';
end;
$$;
revoke all on function public.purge_expired_support_tickets() from public, anon, authenticated;
grant execute on function public.purge_expired_support_tickets() to service_role;
