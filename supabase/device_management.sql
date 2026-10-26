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
