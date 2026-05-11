create table if not exists public.session_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  event_type text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists session_events_workspace_id_idx on public.session_events (workspace_id);
create index if not exists session_events_created_at_idx on public.session_events (created_at desc);

create table if not exists public.support_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  broker_number text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists support_logs_workspace_id_idx on public.support_logs (workspace_id);
