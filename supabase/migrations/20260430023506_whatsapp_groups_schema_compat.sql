create table if not exists public.workspaces (
    id uuid primary key references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.workspaces (id)
select p.id
from public.profiles p
where not exists (
    select 1
    from public.workspaces w
    where w.id = p.id
);

create table if not exists public.whatsapp_groups (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid references public.workspaces(id) on delete cascade,
    session_id text,
    tenant_id uuid references public.profiles(id) on delete cascade,
    session_label text,
    group_jid text not null,
    group_name text not null,
    participant_count integer default 0,
    is_parsing boolean default true,
    last_message_at timestamptz,
    normalized_name text not null default '',
    locality text,
    city text,
    category text default 'other',
    tags text[] default '{}',
    member_count integer default 0,
    last_active_at timestamptz,
    broadcast_enabled boolean default true,
    is_archived boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.whatsapp_groups
    add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
    add column if not exists session_id text,
    add column if not exists tenant_id uuid references public.profiles(id) on delete cascade,
    add column if not exists session_label text,
    add column if not exists participant_count integer default 0,
    add column if not exists is_parsing boolean default true,
    add column if not exists last_message_at timestamptz,
    add column if not exists normalized_name text not null default '',
    add column if not exists locality text,
    add column if not exists city text,
    add column if not exists category text default 'other',
    add column if not exists tags text[] default '{}',
    add column if not exists member_count integer default 0,
    add column if not exists last_active_at timestamptz,
    add column if not exists broadcast_enabled boolean default true,
    add column if not exists is_archived boolean default false,
    add column if not exists created_at timestamptz default now(),
    add column if not exists updated_at timestamptz default now();

update public.whatsapp_groups
set workspace_id = tenant_id
where workspace_id is null
  and tenant_id is not null;

update public.whatsapp_groups
set tenant_id = workspace_id
where tenant_id is null
  and workspace_id is not null;

update public.whatsapp_groups
set session_id = tenant_id::text || ':' || session_label
where session_id is null
  and tenant_id is not null
  and session_label is not null;

update public.whatsapp_groups
set participant_count = member_count
where participant_count is null
  and member_count is not null;

update public.whatsapp_groups
set member_count = participant_count
where member_count is null
  and participant_count is not null;

update public.whatsapp_groups
set last_message_at = last_active_at
where last_message_at is null
  and last_active_at is not null;

update public.whatsapp_groups
set last_active_at = last_message_at
where last_active_at is null
  and last_message_at is not null;

insert into public.workspaces (id)
select distinct wg.workspace_id
from public.whatsapp_groups wg
where wg.workspace_id is not null
  and not exists (
      select 1
      from public.workspaces w
      where w.id = wg.workspace_id
  );

create unique index if not exists whatsapp_groups_workspace_group_uidx
    on public.whatsapp_groups(workspace_id, group_jid);

create unique index if not exists whatsapp_groups_tenant_group_uidx
    on public.whatsapp_groups(tenant_id, group_jid);

create index if not exists idx_whatsapp_groups_workspace_session
    on public.whatsapp_groups(workspace_id, session_id);

create index if not exists idx_whatsapp_groups_workspace_name
    on public.whatsapp_groups(workspace_id, normalized_name);

create index if not exists idx_whatsapp_groups_workspace_category
    on public.whatsapp_groups(workspace_id, category);

alter table public.whatsapp_groups enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'whatsapp_groups'
          and policyname = 'whatsapp_groups_select_workspace_members'
    ) then
        create policy whatsapp_groups_select_workspace_members
            on public.whatsapp_groups
            for select
            using (
                workspace_id = auth.uid()
                or exists (
                    select 1
                    from public.workspace_members wm
                    where wm.workspace_owner_id = public.whatsapp_groups.workspace_id
                      and wm.member_user_id = auth.uid()
                      and wm.status = 'active'
                )
            );
    end if;
end
$$;
