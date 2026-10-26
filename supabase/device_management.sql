-- VikaTech managed ESP32 configuration and remote commands.
-- Apply this migration before deploying the matching firmware / Edge Function.
create extension if not exists pgcrypto;

alter table public.boards
  add column if not exists last_seen timestamptz,
  add column if not exists hardware_model text not null default 'ESP32-4CH';

alter table public.provisioning_records
  add column if not exists board_id uuid references public.boards(id) on delete set null,
  add column if not exists encrypted_device_token text;

create table if not exists public.device_runtime_configs (
  board_id uuid primary key references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text unique,
  encrypted_device_token text,
  mesh_ssid text not null default 'HOME-AUTO-LEADER',
  encrypted_mesh_password text,
  first_seen_at timestamptz,
  wifi_ssid text not null default '',
  wifi_security text not null default 'wpa2_psk'
    check (wifi_security in ('open', 'wpa2_psk')),
  encrypted_wifi_password text,
  config_version integer not null default 1 check (config_version > 0),
  applied_config_version integer not null default 0 check (applied_config_version >= 0),
  config_update_status text not null default 'unprovisioned'
    check (config_update_status in ('unprovisioned','pending','checking_wifi','sending','applying','applied','failed')),
  last_seen_at timestamptz,
  last_error text,
  last_ip text,
  config_requested_at timestamptz,
  config_applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  command_type text not null check (command_type in ('restart')),
  status text not null default 'pending'
    check (status in ('pending','accepted','completed','failed','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb not null default '{}'::jsonb
);

alter table public.device_runtime_configs
  add column if not exists encrypted_device_token text,
  add column if not exists mesh_ssid text not null default 'HOME-AUTO-LEADER',
  add column if not exists encrypted_mesh_password text,
  add column if not exists first_seen_at timestamptz;

-- Backfill enrollment timestamps for devices which already checked in before this migration.
update public.device_runtime_configs
set first_seen_at = coalesce(first_seen_at, last_seen_at)
where last_seen_at is not null and first_seen_at is null;

create index if not exists device_runtime_configs_user_id_idx
  on public.device_runtime_configs(user_id);
create index if not exists device_runtime_configs_last_seen_idx
  on public.device_runtime_configs(last_seen_at desc);
create index if not exists device_commands_board_status_idx
  on public.device_commands(board_id, status, requested_at);

alter table public.device_runtime_configs enable row level security;
alter table public.device_commands enable row level security;

-- No client policies are granted: these tables are accessed only through
-- the authenticated admin API and the device-agent Edge Function service role.
revoke all on public.device_runtime_configs from anon, authenticated;
revoke all on public.device_commands from anon, authenticated;

comment on table public.device_runtime_configs is
  'Server-managed per-board Wi-Fi configuration and device agent status. Sensitive Wi-Fi passwords are AES-256-GCM encrypted.';
comment on column public.device_runtime_configs.device_token_hash is
  'SHA-256 hash of a unique per-board bearer token. Never store or return the plaintext token here.';
comment on table public.device_commands is
  'Auditable server-to-board commands. Devices receive commands through the device-agent Edge Function.';


create table if not exists public.device_config_events (
  id bigint generated always as identity primary key,
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  config_version integer not null,
  status text not null,
  message text,
  created_by text not null default 'device',
  created_at timestamptz not null default now()
);
create index if not exists device_config_events_board_time_idx
  on public.device_config_events(board_id, created_at desc);
alter table public.device_config_events enable row level security;
revoke all on public.device_config_events from anon, authenticated;
comment on table public.device_config_events is
  'Append-only status timeline for remote ESP32 configuration updates; read via the admin API only.';


-- One authenticated device poll returns its configuration, relay rows,
-- alarms, schedules, and pending commands in one database round trip.
create or replace function public.device_agent_snapshot(
  p_device_token_hash text,
  p_board_identifier text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.device_runtime_configs%rowtype;
  v_board public.boards%rowtype;
  v_devices jsonb := '[]'::jsonb;
  v_device_ids uuid[] := array[]::uuid[];
  v_alarms jsonb := '[]'::jsonb;
  v_schedules jsonb := '[]'::jsonb;
  v_commands jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  select c.* into v_config
  from public.device_runtime_configs c
  join public.boards b on b.id = c.board_id and b.user_id = c.user_id
  where c.device_token_hash = p_device_token_hash
    and b.board_identifier = p_board_identifier
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'device_auth_failed');
  end if;

  update public.device_runtime_configs
  set first_seen_at = coalesce(first_seen_at, v_now),
      last_seen_at = v_now,
      updated_at = case
        when last_seen_at is null or last_seen_at < v_now - interval '15 seconds' then v_now
        else updated_at
      end
  where board_id = v_config.board_id
  returning * into v_config;

  update public.boards set last_seen = v_now where id = v_config.board_id
    and (last_seen is null or last_seen < v_now - interval '15 seconds');

  select b.* into v_board
  from public.boards b
  where b.id = v_config.board_id;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'relay_index', d.relay_index,
      'is_on', d.is_on,
      'last_changed', d.last_changed
    ) order by d.relay_index), '[]'::jsonb),
    coalesce(array_agg(d.id), array[]::uuid[])
  into v_devices, v_device_ids
  from public.devices d
  where d.board_id = v_config.board_id and d.user_id = v_config.user_id;

  if cardinality(v_device_ids) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'device_id', a.device_id,
      'trigger_at', a.trigger_at,
      'action', a.action,
      'fired', a.fired
    ) order by a.trigger_at), '[]'::jsonb)
    into v_alarms
    from public.alarms a
    where a.device_id = any(v_device_ids) and a.user_id = v_config.user_id and a.fired = false;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'device_id', s.device_id,
      'time', s.time,
      'days', s.days,
      'action', s.action,
      'enabled', s.enabled
    ) order by s.time), '[]'::jsonb)
    into v_schedules
    from public.schedules s
    where s.device_id = any(v_device_ids) and s.user_id = v_config.user_id and s.enabled = true;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'command_type', c.command_type,
    'requested_at', c.requested_at
  ) order by c.requested_at), '[]'::jsonb)
  into v_commands
  from (
    select *
    from public.device_commands
    where board_id = v_config.board_id
      and user_id = v_config.user_id
      and status = 'pending'
    order by requested_at
    limit 5
  ) c;

  return jsonb_build_object(
    'ok', true,
    'board', jsonb_build_object(
      'id', v_board.id,
      'user_id', v_board.user_id,
      'board_identifier', v_board.board_identifier
    ),
    'config', to_jsonb(v_config),
    'devices', v_devices,
    'alarms', v_alarms,
    'schedules', v_schedules,
    'commands', v_commands,
    'server_time', v_now
  );
end;
$$;

revoke all on function public.device_agent_snapshot(text, text) from public, anon, authenticated;
grant execute on function public.device_agent_snapshot(text, text) to service_role;
