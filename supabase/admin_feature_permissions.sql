-- Run in the main VikaTech website Supabase project after admin_staff_support.sql.
begin;

alter table public.admin_staff
  add column if not exists permissions jsonb not null
  default '{"support":true,"orders_view":true}'::jsonb;

alter table public.admin_staff
  drop constraint if exists admin_staff_permissions_object_check;
alter table public.admin_staff
  add constraint admin_staff_permissions_object_check
  check (jsonb_typeof(permissions) = 'object');

create table if not exists public.admin_feature_requests (
  id uuid primary key default gen_random_uuid(),
  staff_email text not null references public.admin_staff(email) on delete cascade,
  feature_key text not null check (feature_key in (
    'support', 'support_create', 'support_delete', 'orders_view', 'orders_manage',
    'approvals', 'hardware', 'mqtt', 'monitoring', 'voice_plans'
  )),
  reason text not null default '' check (char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create unique index if not exists admin_feature_requests_one_pending
  on public.admin_feature_requests(staff_email, feature_key) where status = 'pending';
create index if not exists admin_feature_requests_recent
  on public.admin_feature_requests(created_at desc);
alter table public.admin_feature_requests enable row level security;
revoke all on public.admin_feature_requests from anon, authenticated;
grant all on public.admin_feature_requests to service_role;

create or replace function public.set_sub_admin_permission(
  p_email text, p_feature text, p_enabled boolean, p_actor text
) returns public.admin_staff
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_staff public.admin_staff%rowtype;
  v_permissions jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_feature not in (
    'support', 'support_create', 'support_delete', 'orders_view', 'orders_manage',
    'approvals', 'hardware', 'mqtt', 'monitoring', 'voice_plans'
  ) or p_enabled is null then raise exception 'Invalid permission change'; end if;

  select * into v_staff from public.admin_staff
  where email = lower(trim(p_email)) and role = 'sub_admin' for update;
  if not found then raise exception 'Sub admin not found'; end if;

  v_permissions := jsonb_set(coalesce(v_staff.permissions, '{}'::jsonb), array[p_feature], to_jsonb(p_enabled), true);
  if p_enabled and p_feature in ('support_create', 'support_delete') then
    v_permissions := jsonb_set(v_permissions, '{support}', 'true'::jsonb, true);
  elsif p_enabled and p_feature = 'orders_manage' then
    v_permissions := jsonb_set(v_permissions, '{orders_view}', 'true'::jsonb, true);
  elsif not p_enabled and p_feature = 'support' then
    v_permissions := v_permissions || '{"support_create":false,"support_delete":false}'::jsonb;
  elsif not p_enabled and p_feature = 'orders_view' then
    v_permissions := jsonb_set(v_permissions, '{orders_manage}', 'false'::jsonb, true);
  end if;

  update public.admin_staff set permissions = v_permissions, updated_at = now()
  where email = v_staff.email returning * into v_staff;
  insert into public.admin_staff_audit(actor_email, staff_email, action)
  values (p_actor, v_staff.email, (case when p_enabled then 'granted:' else 'revoked:' end) || p_feature);

  if p_enabled then
    update public.admin_feature_requests
    set status = 'approved', resolved_at = now(), resolved_by = p_actor
    where staff_email = v_staff.email and feature_key = p_feature and status = 'pending';
  end if;
  return v_staff;
end;
$$;
revoke all on function public.set_sub_admin_permission(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.set_sub_admin_permission(text, text, boolean, text) to service_role;

create or replace function public.resolve_admin_feature_request(
  p_request_id uuid, p_approve boolean, p_actor text
) returns public.admin_feature_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_request public.admin_feature_requests%rowtype;
  v_staff_email text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_approve is null then raise exception 'Decision required'; end if;
  select staff_email into v_staff_email from public.admin_feature_requests
  where id = p_request_id and status = 'pending';
  if not found then raise exception 'Pending request not found'; end if;
  perform 1 from public.admin_staff where email = v_staff_email for update;
  select * into v_request from public.admin_feature_requests
  where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'Pending request not found'; end if;
  if p_approve then
    perform public.set_sub_admin_permission(v_request.staff_email, v_request.feature_key, true, p_actor);
  end if;
  update public.admin_feature_requests
  set status = case when p_approve then 'approved' else 'denied' end,
      resolved_at = now(), resolved_by = p_actor
  where id = v_request.id returning * into v_request;
  if not p_approve then
    insert into public.admin_staff_audit(actor_email, staff_email, action)
    values (p_actor, v_request.staff_email, 'denied_request:' || v_request.feature_key);
  end if;
  return v_request;
end;
$$;
revoke all on function public.resolve_admin_feature_request(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.resolve_admin_feature_request(uuid, boolean, text) to service_role;

commit;
