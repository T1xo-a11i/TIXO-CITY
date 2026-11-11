-- TIXO CITY: минимальная схема Supabase для каталога публичных камер и городских событий.
-- Безопасный старт: публичное чтение только опубликованных записей; запись — только admin.
-- Назначайте роль через Supabase Auth app_metadata, а не user_metadata:
-- { "role": "admin" }

create extension if not exists pgcrypto;

create table if not exists public.cameras (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  address text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  source_url text,
  status text not null default 'unknown'
    check (status in ('online', 'offline', 'maintenance', 'unknown')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cameras_coordinates_pair check (
    (latitude is null and longitude is null) or
    (latitude is not null and longitude is not null)
  )
);

create table if not exists public.city_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 200),
  description text,
  category text not null default 'прочее',
  importance text not null default 'normal'
    check (importance in ('normal', 'important', 'critical')),
  source_url text,
  occurred_at timestamptz,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cameras_public_idx
  on public.cameras (is_public, status);
create index if not exists city_events_public_time_idx
  on public.city_events (is_public, occurred_at desc);

create or replace function public.tixo_set_updated_at()
returns trigger
language plpgsql
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

alter table public.cameras enable row level security;
alter table public.city_events enable row level security;

drop policy if exists "Public can read published cameras" on public.cameras;
create policy "Public can read published cameras"
on public.cameras for select
to anon, authenticated
using (is_public = true);

drop policy if exists "Admins can manage cameras" on public.cameras;
create policy "Admins can manage cameras"
on public.cameras for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Public can read published events" on public.city_events;
create policy "Public can read published events"
on public.city_events for select
to anon, authenticated
using (is_public = true);

drop policy if exists "Admins can manage events" on public.city_events;
create policy "Admins can manage events"
on public.city_events for all
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select on public.cameras, public.city_events to anon, authenticated;
grant insert, update, delete on public.cameras, public.city_events to authenticated;

-- Важно:
-- 1) Не помещайте service_role key в index.html.
-- 2) Не публикуйте камеры/события без проверки законности и достоверности источника.
-- 3) После применения SQL добавляйте записи через доверенную админ-панель/SQL Editor.
