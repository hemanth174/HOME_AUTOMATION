-- Apply this in the MQTT discovery Supabase project (the project that owns
-- public.app_discovery), not the VikaTech application project.
-- Laptop controllers and the authenticated Admin API call these functions
-- with the MQTT project's server-only key. Never expose that key in the browser.

create table if not exists public.mqtt_server_control (
  id boolean primary key default true check (id),
  is_mqtt_on boolean not null default false,
  owner_name text check (owner_name in ('lrv', 'hemanth')),
  owner_instance text,
  owner_device text,
  runtime_details jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz,
  lease_until timestamptz,
  desired_run boolean not null default true,
  requested_owner text check (requested_owner in ('lrv', 'hemanth')),
  server_started_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((owner_name is null) = (owner_instance is null)),
  check ((owner_name is null) = (lease_until is null))
);

insert into public.mqtt_server_control (id) values (true)
on conflict (id) do nothing;

create table if not exists public.mqtt_server_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null check (owner_name in ('lrv', 'hemanth')),
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'started', 'skipped_running', 'missed', 'cancelled')),
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists mqtt_server_schedules_pending_idx
  on public.mqtt_server_schedules (scheduled_at) where status = 'pending';
alter table public.mqtt_server_schedules enable row level security;
revoke all on public.mqtt_server_schedules from anon, authenticated;
grant select on public.mqtt_server_schedules to service_role;

alter table public.mqtt_server_control enable row level security;
revoke all on public.mqtt_server_control from anon, authenticated;
grant select on public.mqtt_server_control to service_role;

create or replace function public.mqtt_request_start(p_owner text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.mqtt_server_control%rowtype;
begin
  if p_owner is not null and p_owner not in ('lrv', 'hemanth') then
    raise exception 'Invalid MQTT laptop owner';
  end if;
  select * into r from public.mqtt_server_control where id = true for update;
  if r.owner_name is not null and r.lease_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'already_running', 'owner_name', r.owner_name, 'lease_until', r.lease_until);
  end if;
  if r.desired_run and r.requested_owner is not null and r.requested_owner is distinct from p_owner then
    return jsonb_build_object('ok', false, 'reason', 'request_pending', 'requested_owner', r.requested_owner);
  end if;
  update public.mqtt_server_control
    set desired_run = true, requested_owner = p_owner, updated_at = now()
    where id = true;
  return jsonb_build_object('ok', true, 'requested_owner', p_owner, 'message', 'Start requested. A running laptop controller must claim the lease.');
end;
$$;

create or replace function public.mqtt_request_stop()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.mqtt_server_control%rowtype;
begin
  select * into r from public.mqtt_server_control where id = true for update;
  update public.mqtt_server_control set desired_run = false, requested_owner = null, updated_at = now() where id = true;
  return jsonb_build_object('ok', true, 'owner_name', r.owner_name, 'message', 'Stop requested. The owner controller will stop Docker and release the lease.');
end;
$$;

create or replace function public.mqtt_try_claim(p_owner text, p_instance text, p_lease_seconds integer default 45, p_device_name text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.mqtt_server_control%rowtype;
begin
  if p_owner is null or p_owner not in ('lrv', 'hemanth') or length(coalesce(p_instance, '')) < 8 then
    raise exception 'Invalid MQTT controller identity';
  end if;
  select * into r from public.mqtt_server_control where id = true for update;
  if not r.desired_run then return jsonb_build_object('ok', false, 'reason', 'stopped'); end if;
  if r.requested_owner is not null and r.requested_owner <> p_owner then
    return jsonb_build_object('ok', false, 'reason', 'requested_for_other_laptop', 'requested_owner', r.requested_owner);
  end if;
  if r.owner_name is not null and r.lease_until > now()
     and (r.owner_name <> p_owner or r.owner_instance <> p_instance) then
    return jsonb_build_object('ok', false, 'reason', 'lease_held', 'owner_name', r.owner_name, 'lease_until', r.lease_until);
  end if;
  update public.mqtt_server_control
    set is_mqtt_on = true, owner_name = p_owner, owner_instance = p_instance, owner_device = p_device_name,
        runtime_details = '{}'::jsonb, requested_owner = null,
        heartbeat_at = now(), lease_until = now() + make_interval(secs => greatest(20, least(p_lease_seconds, 120))),
        updated_at = now()
    where id = true;
  return jsonb_build_object('ok', true, 'owner_name', p_owner, 'lease_until', now() + make_interval(secs => greatest(20, least(p_lease_seconds, 120))));
end;
$$;

create or replace function public.mqtt_renew_lease(p_owner text, p_instance text, p_lease_seconds integer default 45, p_runtime_details jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.mqtt_server_control%rowtype;
begin
  select * into r from public.mqtt_server_control where id = true for update;
  if p_owner is null or p_instance is null or not r.desired_run or r.owner_name is distinct from p_owner or r.owner_instance is distinct from p_instance or r.lease_until is null or r.lease_until <= now() then
    return jsonb_build_object('ok', false, 'reason', 'lease_lost_or_stop_requested');
  end if;
  update public.mqtt_server_control
    set heartbeat_at = now(), lease_until = now() + make_interval(secs => greatest(20, least(p_lease_seconds, 120))),
        runtime_details = coalesce(p_runtime_details, '{}'::jsonb), updated_at = now()
    where id = true;
  return jsonb_build_object('ok', true, 'lease_until', now() + make_interval(secs => greatest(20, least(p_lease_seconds, 120))));
end;
$$;

create or replace function public.mqtt_mark_started(p_owner text, p_instance text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.mqtt_server_control set server_started_at = now(), updated_at = now()
   where id = true and desired_run and owner_name = p_owner and owner_instance = p_instance and lease_until > now();
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.mqtt_release_lease(p_owner text, p_instance text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.mqtt_server_control
    set is_mqtt_on = false, owner_name = null, owner_instance = null,
        heartbeat_at = null, lease_until = null, server_started_at = null, owner_device = null,
        runtime_details = '{}'::jsonb, updated_at = now()
    where id = true and owner_name = p_owner and owner_instance = p_instance;
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.mqtt_schedule_start(p_owner text, p_scheduled_at timestamptz, p_created_by text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare new_id uuid;
begin
  if p_owner is null or p_owner not in ('lrv', 'hemanth') or p_scheduled_at is null then raise exception 'Choose a laptop and a valid date and time'; end if;
  insert into public.mqtt_server_schedules (owner_name, scheduled_at, created_by)
  values (p_owner, p_scheduled_at, left(coalesce(p_created_by, 'admin'), 200)) returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

create or replace function public.mqtt_cancel_schedule(p_schedule_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  update public.mqtt_server_schedules set status = 'cancelled', completed_at = now()
    where id = p_schedule_id and status = 'pending';
  get diagnostics affected = row_count;
  return jsonb_build_object('ok', affected = 1);
end;
$$;

create or replace function public.mqtt_run_due_schedule(p_owner text, p_instance text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.mqtt_server_schedules%rowtype; control_row public.mqtt_server_control%rowtype;
begin
  update public.mqtt_server_schedules set status = 'missed', completed_at = now()
    where status = 'pending' and scheduled_at < now() - interval '60 seconds';
  select * into r from public.mqtt_server_schedules
   where status = 'pending' and owner_name = p_owner and scheduled_at <= now()
     and scheduled_at >= now() - interval '60 seconds'
   order by scheduled_at limit 1 for update skip locked;
  if not found then return jsonb_build_object('ok', false, 'reason', 'none_due'); end if;
  select * into control_row from public.mqtt_server_control where id = true for update;
  if control_row.owner_name is not null and control_row.lease_until > now() then
    update public.mqtt_server_schedules set status = 'skipped_running', completed_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'server_already_running', 'id', r.id);
  end if;
  if control_row.desired_run and control_row.requested_owner is not null and control_row.requested_owner <> p_owner then
    update public.mqtt_server_schedules set status = 'skipped_running', completed_at = now() where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'another_start_requested', 'id', r.id);
  end if;
  update public.mqtt_server_schedules set status = 'started', completed_at = now() where id = r.id;
  update public.mqtt_server_control set desired_run = true, requested_owner = p_owner, updated_at = now() where id = true;
  return jsonb_build_object('ok', true, 'id', r.id, 'owner_name', p_owner);
end;
$$;

revoke all on function public.mqtt_request_start(text) from public, anon, authenticated;
revoke all on function public.mqtt_request_stop() from public, anon, authenticated;
revoke all on function public.mqtt_try_claim(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.mqtt_renew_lease(text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.mqtt_mark_started(text, text) from public, anon, authenticated;
revoke all on function public.mqtt_release_lease(text, text) from public, anon, authenticated;
grant execute on function public.mqtt_request_start(text) to service_role;
grant execute on function public.mqtt_request_stop() to service_role;
grant execute on function public.mqtt_try_claim(text, text, integer, text) to service_role;
grant execute on function public.mqtt_renew_lease(text, text, integer, jsonb) to service_role;
grant execute on function public.mqtt_mark_started(text, text) to service_role;
grant execute on function public.mqtt_release_lease(text, text) to service_role;
revoke all on function public.mqtt_schedule_start(text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.mqtt_cancel_schedule(uuid) from public, anon, authenticated;
revoke all on function public.mqtt_run_due_schedule(text, text) from public, anon, authenticated;
grant execute on function public.mqtt_schedule_start(text, timestamptz, text) to service_role;
grant execute on function public.mqtt_cancel_schedule(uuid) to service_role;
grant execute on function public.mqtt_run_due_schedule(text, text) to service_role;
