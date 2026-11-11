-- TIXO CITY: additive migration for the existing Supabase project.
-- Safe to run against the current cameras/city_events tables; no existing rows are deleted.
-- Admin role must be assigned in Auth app_metadata: { "role": "admin" }.

alter table public.city_events
  add column if not exists is_public boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists city_events_public_time_idx
  on public.city_events (is_public, occurred_at desc);

create or replace function public.tixo_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cameras_set_updated_at on public.cameras;
create trigger cameras_set_updated_at
before update on public.cameras
for each row execute function public.tixo_set_updated_at();

drop trigger if exists city_events_set_updated_at on public.city_events;
create trigger city_events_set_updated_at
before update on public.city_events
for each row execute function public.tixo_set_updated_at();

drop policy if exists "Public can read published cameras" on public.cameras;
create policy "Public can read published cameras"
on public.cameras for select to anon, authenticated
using (is_public = true);

drop policy if exists "Admins can manage cameras" on public.cameras;
create policy "Admins can manage cameras"
on public.cameras for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Public can read published events" on public.city_events;
create policy "Public can read published events"
on public.city_events for select to anon, authenticated
using (is_public = true);

drop policy if exists "Admins can manage events" on public.city_events;
create policy "Admins can manage events"
on public.city_events for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select on public.cameras, public.city_events to anon, authenticated;
grant insert, update, delete on public.cameras, public.city_events to authenticated;

-- Do not put a service_role key in browser code.
-- Keep cameras/events unpublished until their sources are verified and lawful to display.
