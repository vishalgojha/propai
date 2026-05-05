create table if not exists public.whatsapp_groups (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references public.profiles(id) on delete cascade not null,
  session_label text,
  group_jid text not null,
  group_name text,
  member_count integer not null default 0,
  parse_enabled boolean not null default false,
  last_active_at timestamptz,
  consent_updated_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (tenant_id, group_jid)
);

alter table public.whatsapp_groups
  add column if not exists session_label text,
  add column if not exists group_name text,
  add column if not exists member_count integer not null default 0,
  add column if not exists parse_enabled boolean not null default false,
  add column if not exists last_active_at timestamptz,
  add column if not exists consent_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

update public.whatsapp_groups
set parse_enabled = false
where parse_enabled is null;

create index if not exists whatsapp_groups_tenant_parse_idx
  on public.whatsapp_groups (tenant_id, parse_enabled, last_active_at desc);

create table if not exists public.whatsapp_dm_permissions (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid references public.profiles(id) on delete cascade not null,
  session_label text,
  remote_jid text not null,
  display_name text,
  normalized_phone text,
  parse_enabled boolean not null default false,
  last_message_at timestamptz,
  consent_updated_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (tenant_id, remote_jid)
);

update public.whatsapp_dm_permissions
set parse_enabled = false
where parse_enabled is null;

create index if not exists whatsapp_dm_permissions_tenant_parse_idx
  on public.whatsapp_dm_permissions (tenant_id, parse_enabled, last_message_at desc);

create index if not exists whatsapp_dm_permissions_tenant_phone_idx
  on public.whatsapp_dm_permissions (tenant_id, normalized_phone);

alter table public.whatsapp_groups enable row level security;
alter table public.whatsapp_dm_permissions enable row level security;

drop policy if exists whatsapp_groups_tenant_manage on public.whatsapp_groups;
create policy whatsapp_groups_tenant_manage
  on public.whatsapp_groups
  for all
  using ((select auth.uid()) = tenant_id)
  with check ((select auth.uid()) = tenant_id);

drop policy if exists whatsapp_dm_permissions_tenant_manage on public.whatsapp_dm_permissions;
create policy whatsapp_dm_permissions_tenant_manage
  on public.whatsapp_dm_permissions
  for all
  using ((select auth.uid()) = tenant_id)
  with check ((select auth.uid()) = tenant_id);
