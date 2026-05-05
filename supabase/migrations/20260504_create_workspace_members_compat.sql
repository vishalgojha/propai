create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.profiles(id) on delete cascade not null,
  tenant_id uuid references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  email text,
  full_name text,
  role text not null default 'owner',
  status text not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamp with time zone,
  joined_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint workspace_members_role_check check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint workspace_members_status_check check (status in ('active', 'invited', 'disabled')),
  constraint workspace_members_workspace_user_unique unique (workspace_id, user_id)
);

update public.workspace_members
set tenant_id = workspace_id
where tenant_id is null;

alter table public.workspace_members
  alter column tenant_id set not null;

create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);
create index if not exists workspace_members_tenant_id_idx on public.workspace_members(tenant_id);
create index if not exists workspace_members_workspace_id_idx on public.workspace_members(workspace_id);

insert into public.workspace_members (workspace_id, tenant_id, user_id, email, full_name, role, status, joined_at)
select p.id, p.id, p.id, p.email, p.full_name, 'owner', 'active', coalesce(p.created_at, timezone('utc'::text, now()))
from public.profiles p
on conflict (workspace_id, user_id) do update
set tenant_id = excluded.tenant_id,
    email = excluded.email,
    full_name = excluded.full_name,
    role = case when public.workspace_members.role = 'owner' then public.workspace_members.role else excluded.role end,
    status = 'active',
    updated_at = timezone('utc'::text, now());

alter table public.workspace_members enable row level security;

drop policy if exists workspace_members_select_own on public.workspace_members;
create policy workspace_members_select_own
  on public.workspace_members
  for select
  using (auth.uid() = user_id or auth.uid() = workspace_id or auth.uid() = tenant_id);

drop policy if exists workspace_members_insert_owner on public.workspace_members;
create policy workspace_members_insert_owner
  on public.workspace_members
  for insert
  with check (auth.uid() = workspace_id or auth.uid() = tenant_id or auth.uid() = user_id);

drop policy if exists workspace_members_update_owner on public.workspace_members;
create policy workspace_members_update_owner
  on public.workspace_members
  for update
  using (auth.uid() = workspace_id or auth.uid() = tenant_id)
  with check (auth.uid() = workspace_id or auth.uid() = tenant_id);

drop policy if exists workspace_members_delete_owner on public.workspace_members;
create policy workspace_members_delete_owner
  on public.workspace_members
  for delete
  using (auth.uid() = workspace_id or auth.uid() = tenant_id);
