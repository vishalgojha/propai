-- Standalone migration to ensure workspace_activity_events exists.
-- Defined originally in 20260429211000 but may not have been applied.
-- Keeping this self-contained so it can be run independently.

create table if not exists workspace_activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_name text,
  actor_role text,
  event_type text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_activity_owner_created
  on workspace_activity_events(workspace_owner_id, created_at desc);

alter table workspace_activity_events enable row level security;

-- Basic RLS: workspace owner sees their own events
create policy if not exists workspace_activity_owner_access
  on workspace_activity_events
  for all
  using (workspace_owner_id = auth.uid());
