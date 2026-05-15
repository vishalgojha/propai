create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete set null,
  member_email text not null,
  member_name text,
  member_phone text,
  role text not null default 'realtor' check (role in ('admin', 'realtor', 'ops', 'viewer')),
  status text not null default 'invited' check (status in ('invited', 'active', 'inactive')),
  invited_by uuid references auth.users(id) on delete set null,
  permissions jsonb not null default '{}'::jsonb,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_workspace_members_owner_email
  on workspace_members(workspace_owner_id, member_email);

create index if not exists idx_workspace_members_owner_status
  on workspace_members(workspace_owner_id, status);

create index if not exists idx_workspace_members_user
  on workspace_members(member_user_id);

alter table workspace_members enable row level security;

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
