create table if not exists public.whatsapp_presence_events (
    id uuid primary key default gen_random_uuid(),
    workspace_owner_id uuid not null references public.profiles(id) on delete cascade,
    actor_user_id uuid references public.profiles(id) on delete set null,
    session_label text,
    source text not null default 'extension',
    event_type text not null,
    status text not null,
    remote_jid text,
    tab_id text,
    url text,
    metadata jsonb not null default '{}'::jsonb,
    observed_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_presence_events_workspace_observed_at
    on public.whatsapp_presence_events (workspace_owner_id, observed_at desc);

create index if not exists idx_whatsapp_presence_events_workspace_session
    on public.whatsapp_presence_events (workspace_owner_id, session_label, observed_at desc);
