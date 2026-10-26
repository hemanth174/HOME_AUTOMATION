-- VikaTech ESP32 device management: remote config, restart commands and status.
-- Apply this migration before enabling /admin/hardware.
create extension if not exists pgcrypto;

alter table public.provisioning_records
  add column if not exists device_auth_token_hash text,
  add column if not exists encrypted_device_auth_token text;

create table if not exists public.esp32_configurations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null unique references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_identifier text not null unique,
  device_auth_token_hash text not null,
  wifi_ssid text not null check (char_length(wifi_ssid) between 1 and 32),
  wifi_security text not null default 'wpa2_psk' check (wifi_security in ('open', 'wpa2_psk')),
  wifi_password_encrypted text,
  config_version integer not null default 1 check (config_version > 0),
  last_applied_config_version integer not null default 0 check (last_applied_config_version >= 0),
  device_online boolean not null default false,
  last_seen_at timestamptz,
  last_boot_at timestamptz,
  last_boot_id text,
  last_ip text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint esp32_open_wifi_has_no_password check (
    (wifi_security = 'open' and wifi_password_encrypted is null) or wifi_security = 'wpa2_psk'
  )
);

create index if not exists esp32_configurations_user_idx
  on public.esp32_configurations(user_id);
create index if not exists esp32_configurations_last_seen_idx
  on public.esp32_configurations(last_seen_at desc);

create table if not exists public.esp32_commands (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  command_type text not null check (command_type in ('restart', 'apply_config')),
  status text not null default 'queued'
    check (status in ('queued', 'accepted', 'completed', 'failed', 'expired')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists esp32_commands_board_status_idx
  on public.esp32_commands(board_id, status, created_at);
create index if not exists esp32_commands_expiry_idx
  on public.esp32_commands(expires_at) where status in ('queued', 'accepted');

alter table public.esp32_configurations enable row level security;
alter table public.esp32_commands enable row level security;

-- These tables are accessed only by authenticated server routes / device API.
-- Do not add browser-facing policies. Supabase service role is used server-side only.
revoke all on public.esp32_configurations from anon, authenticated;
revoke all on public.esp32_commands from anon, authenticated;

comment on table public.esp32_configurations is
  'Server-only board configuration and liveness metadata. Never expose encrypted Wi-Fi credentials to browser clients.';
comment on table public.esp32_commands is
  'Server-only command queue for authenticated ESP32 boards; browser clients must use protected admin API routes.';
