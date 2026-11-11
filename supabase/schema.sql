-- TIXO CITY: additive, repeatable schema setup for the existing Supabase project.
-- This file does not delete rows. Review before applying to any other project.
-- Admin role must be assigned in Auth app_metadata: { "role": "admin" }.

alter table public.cameras enable row level security;
alter table public.city_events enable row level security;

alter table public.city_events
  add column if not exists is_public boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists city_events_public_time_idx
  on public.city_events (is_public, occurred_at desc);

create or replace function public.tixo_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
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

-- One SELECT policy per table: public sees published rows; admins see all rows.
-- Wrapping auth.jwt() in a scalar SELECT avoids per-row re-evaluation.
drop policy if exists "Public can read listed cameras" on public.cameras;
drop policy if exists "Public can read published cameras" on public.cameras;
drop policy if exists "Admins can manage cameras" on public.cameras;
drop policy if exists "Public and admins can read cameras" on public.cameras;
create policy "Public and admins can read cameras"
on public.cameras for select to anon, authenticated
using (
  is_public = true
  or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists "Admins can insert cameras" on public.cameras;
create policy "Admins can insert cameras"
on public.cameras for insert to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can update cameras" on public.cameras;
create policy "Admins can update cameras"
on public.cameras for update to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can delete cameras" on public.cameras;
create policy "Admins can delete cameras"
on public.cameras for delete to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Public can read city events" on public.city_events;
drop policy if exists "Public can read published events" on public.city_events;
drop policy if exists "Admins can manage events" on public.city_events;
drop policy if exists "Public and admins can read events" on public.city_events;
create policy "Public and admins can read events"
on public.city_events for select to anon, authenticated
using (
  is_public = true
  or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists "Admins can insert events" on public.city_events;
create policy "Admins can insert events"
on public.city_events for insert to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can update events" on public.city_events;
create policy "Admins can update events"
on public.city_events for update to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can delete events" on public.city_events;
create policy "Admins can delete events"
on public.city_events for delete to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select on public.cameras, public.city_events to anon, authenticated;
grant insert, update, delete on public.cameras, public.city_events to authenticated;

-- Do not put a service_role key in browser code.
-- Keep cameras/events unpublished until their sources are verified and lawful to display.
