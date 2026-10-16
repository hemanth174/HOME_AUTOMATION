create table if not exists public.feature_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  action_url text,
  created_at timestamptz not null default now()
);

alter table public.feature_announcements enable row level security;

grant select on table public.feature_announcements to authenticated;

drop policy if exists "Authenticated users can read feature announcements"
  on public.feature_announcements;
create policy "Authenticated users can read feature announcements"
  on public.feature_announcements
  for select to authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.feature_announcements;
exception
  when duplicate_object then null;
end;
$$;
