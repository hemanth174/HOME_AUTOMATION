  -- Run in the VikaTech app Supabase project before flashing the fallback firmware.
  -- Called only when MQTT is unhealthy. One database transaction claims due
  -- automations and returns the current relay states without a device-side cache.
  create table if not exists public.schedule_runs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    schedule_id uuid not null references public.schedules(id) on delete cascade,
    occurrence_at timestamptz not null,
    source text not null default 'server',
    executed_at timestamptz,
    unique (schedule_id, occurrence_at)
  );
  alter table public.schedule_runs enable row level security;
  revoke all on public.schedule_runs from anon, authenticated;

  create or replace function public.esp32_automation_fallback(p_board_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_now timestamptz := clock_timestamp();
    v_board public.boards%rowtype;
    v_zone text;
    v_local timestamp;
    v_occurrence timestamptz;
    v_alarm_claimed public.alarms.id%type;
    v_run_claimed public.schedule_runs.id%type;
    v_runs integer := 0;
    v_alarm record;
    v_schedule record;
    v_devices jsonb;
  begin
    -- Execute permission is granted only to service_role below. Do not read
    -- version-dependent PostgREST JWT settings inside this SECURITY DEFINER RPC.
    select * into v_board from public.boards where id = p_board_id and deleted_at is null;
    if not found then raise exception 'board not found'; end if;
    -- A successful fallback call is a real board check-in even if WSS is down.
    update public.boards set last_seen = v_now where id = p_board_id;
    select coalesce(timezone, 'Asia/Kolkata') into v_zone
      from public.user_settings where user_id = v_board.user_id;
    v_zone := coalesce(v_zone, 'Asia/Kolkata');
    if not exists (select 1 from pg_timezone_names where name = v_zone) then
      v_zone := 'Asia/Kolkata';
    end if;
    v_local := timezone(v_zone, v_now);

    for v_alarm in
      select a.*, d.name as device_name
      from public.alarms a
      join public.devices d on d.id = a.device_id and d.board_id = p_board_id and d.deleted_at is null
      where a.user_id = v_board.user_id and a.fired = false
        and a.deleted_at is null
        and a.trigger_at between v_now - interval '5 minutes' and v_now
      order by a.trigger_at
      limit 100
    loop
      update public.alarms set fired = true
        where id = v_alarm.id and user_id = v_board.user_id and fired = false
          and trigger_at = v_alarm.trigger_at and device_id = v_alarm.device_id
          and action = v_alarm.action and deleted_at is null
        returning id into v_alarm_claimed;
      if v_alarm_claimed is null then continue; end if;
      update public.devices set is_on = v_alarm.action, last_changed = v_now
        where id = v_alarm.device_id and board_id = p_board_id and user_id = v_board.user_id;
      insert into public.activity_logs(user_id, device_id, device_name, action, triggered_by)
        values (v_board.user_id, v_alarm.device_id, v_alarm.device_name,
          case when v_alarm.action then 'turned ON' else 'turned OFF' end,
          'Alarm (ESP32 fallback)');
      v_runs := v_runs + 1;
      v_alarm_claimed := null;
    end loop;

    for v_schedule in
      select s.*, d.name as device_name
      from public.schedules s
      join public.devices d on d.id = s.device_id and d.board_id = p_board_id and d.deleted_at is null
      where s.user_id = v_board.user_id and s.enabled = true
        and s.deleted_at is null
        and (s.run_date is null or s.run_date between v_local::date - 1 and v_local::date)
      limit 100
    loop
      if v_schedule.run_date is null then
        if not (to_jsonb(v_schedule.days) @>
                jsonb_build_array(extract(dow from v_local)::integer)) then continue; end if;
        v_occurrence := (v_local::date + v_schedule.time::time) at time zone v_zone;
      else
        v_occurrence := (v_schedule.run_date + v_schedule.time::time) at time zone v_zone;
      end if;
      if v_occurrence > v_now or v_occurrence < v_now - interval '5 minutes' then continue; end if;
      insert into public.schedule_runs(user_id, schedule_id, occurrence_at, source)
        values (v_board.user_id, v_schedule.id, v_occurrence, 'server')
        on conflict (schedule_id, occurrence_at) do nothing
        returning id into v_run_claimed;
      if v_run_claimed is null then continue; end if;
      update public.devices set is_on = v_schedule.action, last_changed = v_now
        where id = v_schedule.device_id and board_id = p_board_id and user_id = v_board.user_id;
      update public.schedule_runs set executed_at = v_now where id = v_run_claimed;
      if v_schedule.run_date is not null then
        update public.schedules set enabled = false where id = v_schedule.id;
      end if;
      insert into public.activity_logs(user_id, device_id, device_name, action, triggered_by)
        values (v_board.user_id, v_schedule.device_id, v_schedule.device_name,
          case when v_schedule.action then 'turned ON' else 'turned OFF' end,
          'Schedule (ESP32 fallback)');
      v_runs := v_runs + 1;
      v_run_claimed := null;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('id', d.id,
      'relay_index', d.relay_index, 'is_on', d.is_on,
      'last_changed', d.last_changed) order by d.relay_index), '[]'::jsonb)
      into v_devices from public.devices d
      where d.board_id = p_board_id and d.user_id = v_board.user_id and d.deleted_at is null;
    return jsonb_build_object('devices', v_devices, 'automation_runs', v_runs);
  end;
  $$;

  revoke all on function public.esp32_automation_fallback(uuid) from public, anon, authenticated;
  grant execute on function public.esp32_automation_fallback(uuid) to service_role;
