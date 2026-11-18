-- PentHouse has an ESP32 heartbeat that overwrites a newer gateway heartbeat
-- with a device-clock timestamp about 15 minutes behind. Keep this correction
-- scoped to the affected board while the firmware is repaired.
create or replace function public.stamp_penthouse_presence_time()
returns trigger
language plpgsql
as $$
begin
  if new.id = '803c100e-b950-4f7b-b916-1d3431bdb80b'::uuid
     and new.last_seen is not null then
    new.last_seen := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger boards_stamp_penthouse_presence_time
before update of last_seen on public.boards
for each row
execute function public.stamp_penthouse_presence_time();
