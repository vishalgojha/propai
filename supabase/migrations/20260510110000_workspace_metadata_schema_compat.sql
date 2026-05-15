alter table if exists public.workspaces
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists agency_name text,
  add column if not exists primary_city text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspaces'
      and column_name = 'id'
  ) then
    execute '
      update public.workspaces
      set owner_id = coalesce(owner_id, id)
      where owner_id is null
    ';
  end if;
end $$;

create unique index if not exists workspaces_owner_id_uidx
  on public.workspaces (owner_id);

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
