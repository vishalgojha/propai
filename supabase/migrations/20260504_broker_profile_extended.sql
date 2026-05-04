alter table public.profiles
  add column if not exists agency_name text,
  add column if not exists city text,
  add column if not exists primary_phone text,
  add column if not exists locations text[] default '{}'::text[],
  add column if not exists team_contacts jsonb default '[]'::jsonb;

create table if not exists public.channels (
  id uuid default gen_random_uuid() primary key,
  broker_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  city text not null,
  locality text not null,
  auto_created boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (broker_id, name),
  unique (broker_id, city, locality)
);

create index if not exists channels_broker_id_idx
  on public.channels (broker_id);

create index if not exists channels_broker_city_idx
  on public.channels (broker_id, city);

create index if not exists channels_broker_locality_idx
  on public.channels (broker_id, locality);

alter table public.profiles enable row level security;
alter table public.channels enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles
  for select
  using ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Brokers can manage their own channels" on public.channels;

create policy "Brokers can manage their own channels"
  on public.channels
  for all
  using ((select auth.uid()) = broker_id)
  with check ((select auth.uid()) = broker_id);
