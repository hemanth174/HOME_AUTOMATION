-- Device activity_logs use actions such as "turned ON" and "turned OFF".
-- The previous case-sensitive comparisons treated these as no activity.
create or replace function public.calculate_device_run_time_hours(
  target_device_id uuid,
  target_date date
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  day_start timestamptz := target_date::timestamptz;
  day_end timestamptz := (target_date + 1)::timestamptz;
  log_rec record;
  is_currently_on boolean := false;
  last_on_time timestamptz;
  total_seconds numeric := 0;
  calc_end timestamptz := least(now(), day_end);
  prior_action text;
  first_action text;
begin
  select action into prior_action
  from public.activity_logs
  where device_id = target_device_id and created_at < day_start
  order by created_at desc
  limit 1;

  if prior_action is not null then
    if prior_action ilike '%on%' or prior_action ilike '%activate%' then
      is_currently_on := true;
      last_on_time := day_start;
    end if;
  else
    select action into first_action
    from public.activity_logs
    where device_id = target_device_id
      and created_at >= day_start and created_at < day_end
    order by created_at
    limit 1;
    if first_action ilike '%off%' or first_action ilike '%deactivate%' then
      is_currently_on := true;
      last_on_time := day_start;
    end if;
  end if;

  for log_rec in
    select created_at, action
    from public.activity_logs
    where device_id = target_device_id
      and created_at >= day_start and created_at < day_end
    order by created_at
  loop
    if log_rec.action ilike '%on%' or log_rec.action ilike '%activate%' then
      if not is_currently_on then
        is_currently_on := true;
        last_on_time := log_rec.created_at;
      end if;
    elsif is_currently_on and
          (log_rec.action ilike '%off%' or log_rec.action ilike '%deactivate%') then
      total_seconds := total_seconds + greatest(0, extract(epoch from (log_rec.created_at - last_on_time)));
      is_currently_on := false;
      last_on_time := null;
    end if;
  end loop;

  if is_currently_on and last_on_time is not null then
    total_seconds := total_seconds + greatest(0, extract(epoch from (calc_end - last_on_time)));
  end if;

  return greatest(0, total_seconds / 3600);
end;
$$;

-- Activity logs are retained for seven days. Only that window can be rebuilt.
do $$
declare
  day_to_rebuild date;
begin
  for day_to_rebuild in
    select generate_series(current_date - 6, current_date, interval '1 day')::date
  loop
    perform public.summarize_daily_analytics(day_to_rebuild);
  end loop;
end;
$$;
