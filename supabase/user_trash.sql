-- Run once in the VikaTech application's Supabase SQL editor.
-- Trashed records stay in their original tables; no duplicate payloads are stored.

alter table public.boards add column if not exists deleted_at timestamptz;
alter table public.devices add column if not exists deleted_at timestamptz;
alter table public.devices add column if not exists trashed_with_board uuid;
alter table public.presets add column if not exists deleted_at timestamptz;
alter table public.schedules add column if not exists deleted_at timestamptz;
alter table public.schedules add column if not exists trashed_with_board uuid;
alter table public.alarms add column if not exists deleted_at timestamptz;
alter table public.alarms add column if not exists trashed_with_board uuid;
alter table public.activity_logs add column if not exists deleted_at timestamptz;

alter table public.boards enable row level security;
alter table public.devices enable row level security;
alter table public.presets enable row level security;
alter table public.schedules enable row level security;
alter table public.alarms enable row level security;
alter table public.activity_logs enable row level security;

create index if not exists boards_trash_owner_idx on public.boards(user_id, deleted_at) where deleted_at is not null;
create index if not exists presets_trash_owner_idx on public.presets(user_id, deleted_at) where deleted_at is not null;
create index if not exists schedules_trash_owner_idx on public.schedules(user_id, deleted_at) where deleted_at is not null;
create index if not exists alarms_trash_owner_idx on public.alarms(user_id, deleted_at) where deleted_at is not null;
create index if not exists activity_logs_trash_owner_idx on public.activity_logs(user_id, deleted_at) where deleted_at is not null;

-- Restrictive SELECT policies hide trash from normal signed-in app queries.
-- Existing ownership policies continue to decide which active rows are visible.
drop policy if exists boards_hide_trash on public.boards;
create policy boards_hide_trash on public.boards as restrictive for select to authenticated using (deleted_at is null);
drop policy if exists devices_hide_trash on public.devices;
create policy devices_hide_trash on public.devices as restrictive for select to authenticated using (deleted_at is null);
drop policy if exists presets_hide_trash on public.presets;
create policy presets_hide_trash on public.presets as restrictive for select to authenticated using (deleted_at is null);
drop policy if exists schedules_hide_trash on public.schedules;
create policy schedules_hide_trash on public.schedules as restrictive for select to authenticated using (deleted_at is null);
drop policy if exists alarms_hide_trash on public.alarms;
create policy alarms_hide_trash on public.alarms as restrictive for select to authenticated using (deleted_at is null);
drop policy if exists activity_logs_hide_trash on public.activity_logs;
create policy activity_logs_hide_trash on public.activity_logs as restrictive for select to authenticated using (deleted_at is null);

create or replace function public.move_to_trash(p_kind text, p_id uuid default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_now timestamptz := now(); v_count integer := 0;
begin
  if v_user is null then raise exception 'Sign in to use Trash'; end if;
  if p_kind = 'board' and p_id is not null then
    update public.boards set deleted_at = v_now where id = p_id and user_id = v_user and deleted_at is null;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      update public.devices set deleted_at = v_now, trashed_with_board = p_id
        where board_id = p_id and user_id = v_user and deleted_at is null;
      update public.schedules set deleted_at = v_now, trashed_with_board = p_id
        where user_id = v_user and deleted_at is null and device_id in
          (select id from public.devices where board_id = p_id and user_id = v_user);
      update public.alarms set deleted_at = v_now, trashed_with_board = p_id
        where user_id = v_user and deleted_at is null and device_id in
          (select id from public.devices where board_id = p_id and user_id = v_user);
    end if;
  elsif p_kind = 'preset' and p_id is not null then
    update public.presets set deleted_at = v_now where id = p_id and user_id = v_user and deleted_at is null;
    get diagnostics v_count = row_count;
  elsif p_kind = 'schedule' then
    update public.schedules set deleted_at = v_now where user_id = v_user and deleted_at is null and (p_id is null or id = p_id);
    get diagnostics v_count = row_count;
  elsif p_kind = 'alarm' then
    update public.alarms set deleted_at = v_now where user_id = v_user and deleted_at is null and (p_id is null or id = p_id);
    get diagnostics v_count = row_count;
  elsif p_kind = 'activity_log' then
    update public.activity_logs set deleted_at = v_now where user_id = v_user and deleted_at is null and (p_id is null or id = p_id);
    get diagnostics v_count = row_count;
  else
    raise exception 'Unsupported Trash item';
  end if;
  return v_count;
end; $$;

create or replace function public.restore_from_trash(p_kind text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_count integer := 0;
begin
  if v_user is null or p_id is null then raise exception 'Sign in and choose an item'; end if;
  if p_kind = 'board' then
    update public.boards set deleted_at = null where id = p_id and user_id = v_user
      and deleted_at >= now() - interval '30 days';
    get diagnostics v_count = row_count;
    if v_count > 0 then
      update public.devices set deleted_at = null, trashed_with_board = null
        where user_id = v_user and trashed_with_board = p_id;
      update public.schedules set deleted_at = null, trashed_with_board = null
        where user_id = v_user and trashed_with_board = p_id;
      update public.alarms set deleted_at = null, trashed_with_board = null
        where user_id = v_user and trashed_with_board = p_id;
    end if;
  elsif p_kind = 'preset' then
    update public.presets set deleted_at = null where id = p_id and user_id = v_user
      and deleted_at >= now() - interval '30 days';
    get diagnostics v_count = row_count;
  elsif p_kind = 'schedule' then
    update public.schedules set deleted_at = null where id = p_id and user_id = v_user
      and deleted_at >= now() - interval '30 days' and trashed_with_board is null
      and device_id in (select d.id from public.devices d where d.deleted_at is null);
    get diagnostics v_count = row_count;
  elsif p_kind = 'alarm' then
    update public.alarms set deleted_at = null where id = p_id and user_id = v_user
      and deleted_at >= now() - interval '30 days' and trashed_with_board is null
      and device_id in (select d.id from public.devices d where d.deleted_at is null);
    get diagnostics v_count = row_count;
  elsif p_kind = 'activity_log' then
    update public.activity_logs set deleted_at = null where id = p_id and user_id = v_user
      and deleted_at >= now() - interval '30 days';
    get diagnostics v_count = row_count;
  else
    raise exception 'Unsupported Trash item';
  end if;
  return v_count > 0;
end; $$;

create or replace function public.restore_all_trash()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_board_ids uuid[]; v_count integer := 0; v_changed integer := 0;
begin
  if v_user is null then raise exception 'Sign in to use Trash'; end if;
  select coalesce(array_agg(id), array[]::uuid[]) into v_board_ids
    from public.boards where user_id = v_user and deleted_at >= now() - interval '30 days';
  update public.boards set deleted_at = null where user_id = v_user and id = any(v_board_ids);
  get diagnostics v_changed = row_count; v_count := v_count + v_changed;
  update public.devices set deleted_at = null, trashed_with_board = null
    where user_id = v_user and trashed_with_board = any(v_board_ids);
  update public.schedules set deleted_at = null, trashed_with_board = null
    where user_id = v_user and trashed_with_board = any(v_board_ids);
  update public.alarms set deleted_at = null, trashed_with_board = null
    where user_id = v_user and trashed_with_board = any(v_board_ids);
  update public.presets set deleted_at = null
    where user_id = v_user and deleted_at >= now() - interval '30 days';
  get diagnostics v_changed = row_count; v_count := v_count + v_changed;
  update public.schedules set deleted_at = null
    where user_id = v_user and deleted_at >= now() - interval '30 days'
      and trashed_with_board is null and device_id in
        (select id from public.devices where user_id = v_user and deleted_at is null);
  get diagnostics v_changed = row_count; v_count := v_count + v_changed;
  update public.alarms set deleted_at = null
    where user_id = v_user and deleted_at >= now() - interval '30 days'
      and trashed_with_board is null and device_id in
        (select id from public.devices where user_id = v_user and deleted_at is null);
  get diagnostics v_changed = row_count; v_count := v_count + v_changed;
  update public.activity_logs set deleted_at = null
    where user_id = v_user and deleted_at >= now() - interval '30 days';
  get diagnostics v_changed = row_count; v_count := v_count + v_changed;
  return v_count;
end; $$;

create or replace function public.list_trash(p_limit integer default 100, p_offset integer default 0, p_filter text default 'all')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Sign in to use Trash'; end if;
  select coalesce(jsonb_agg(to_jsonb(items) order by items.deleted_at desc), '[]'::jsonb) into v_result from (
    select * from (
    select 'board'::text as kind, id, name::text as title, deleted_at from public.boards where user_id = v_user and deleted_at is not null
    union all select 'preset', id, name, deleted_at from public.presets where user_id = v_user and deleted_at is not null
    union all select 'schedule', id, 'Schedule · ' || time::text, deleted_at from public.schedules where user_id = v_user and deleted_at is not null and trashed_with_board is null
    union all select 'alarm', id, 'Alarm · ' || to_char(trigger_at, 'DD Mon YYYY HH24:MI'), deleted_at from public.alarms where user_id = v_user and deleted_at is not null and trashed_with_board is null
    union all select 'activity_log', id, coalesce(device_name, 'Device') || ' · ' || coalesce(action, 'activity'), deleted_at from public.activity_logs where user_id = v_user and deleted_at is not null
    ) all_items
    where p_filter = 'all' or kind = p_filter or (p_filter = 'automation' and kind in ('schedule', 'alarm'))
    order by deleted_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  ) items;
  return v_result;
end; $$;

create or replace function public.purge_expired_trash()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.activity_logs where device_id in
    (select d.id from public.devices d join public.boards b on b.id = d.board_id
      where b.deleted_at < now() - interval '30 days');
  delete from public.activity_logs where deleted_at < now() - interval '30 days';
  delete from public.alarms where deleted_at < now() - interval '30 days';
  delete from public.schedules where deleted_at < now() - interval '30 days';
  delete from public.presets where deleted_at < now() - interval '30 days';
  delete from public.boards where deleted_at < now() - interval '30 days';
end; $$;

revoke all on function public.move_to_trash(text, uuid) from public, anon;
revoke all on function public.restore_from_trash(text, uuid) from public, anon;
revoke all on function public.restore_all_trash() from public, anon;
revoke all on function public.list_trash(integer, integer, text) from public, anon;
revoke all on function public.purge_expired_trash() from public, anon, authenticated;
grant execute on function public.move_to_trash(text, uuid) to authenticated;
grant execute on function public.restore_from_trash(text, uuid) to authenticated;
grant execute on function public.restore_all_trash() to authenticated;
grant execute on function public.list_trash(integer, integer, text) to authenticated;
grant execute on function public.purge_expired_trash() to service_role;

