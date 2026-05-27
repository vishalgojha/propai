create table if not exists public.location_cache (
  id bigserial primary key,
  building_name text not null,
  locality text not null,
  city text not null,
  pincode text,
  source text not null default 'unknown',
  created_at timestamptz not null default now()
);

create unique index if not exists location_cache_building_name_lower_idx
  on public.location_cache (lower(building_name));

create index if not exists location_cache_locality_idx
  on public.location_cache (locality);

alter table public.location_cache enable row level security;

grant select, insert, update, delete on public.location_cache to service_role;

create policy "service_role_full_access"
  on public.location_cache
  for all
  to service_role
  using (true)
  with check (true);
