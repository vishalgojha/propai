create table if not exists public.workspaces (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  agency_name text,
  primary_city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_service_areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(owner_id) on delete cascade,
  city text not null,
  locality text not null,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, city, locality)
);

create index if not exists workspace_service_areas_workspace_id_idx
  on public.workspace_service_areas (workspace_id);

