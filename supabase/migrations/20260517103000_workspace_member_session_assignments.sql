alter table if exists public.workspace_members
    add column if not exists assigned_session_labels text[] not null default '{}'::text[];

alter table if exists public.workspace_members
    add column if not exists preferred_session_label text;

update public.workspace_members
set assigned_session_labels = '{}'::text[]
where assigned_session_labels is null;

create index if not exists idx_workspace_members_assigned_session_labels
    on public.workspace_members
    using gin (assigned_session_labels);
