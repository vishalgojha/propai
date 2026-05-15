create table if not exists public.whatsapp_sessions (
    session_id text primary key,
    tenant_id uuid references auth.users(id),
    label text not null default 'Owner',
    owner_name text,
    session_data jsonb not null default '{}'::jsonb,
    status text not null default 'disconnected',
    last_sync timestamptz not null default now(),
    creds jsonb,
    keys jsonb,
    updated_at timestamptz not null default now()
);

alter table public.whatsapp_sessions
    add column if not exists session_id text,
    add column if not exists creds jsonb,
    add column if not exists keys jsonb,
    add column if not exists updated_at timestamptz not null default now();

update public.whatsapp_sessions
set session_id = tenant_id::text || ':' || label
where session_id is null
  and tenant_id is not null
  and label is not null;

create unique index if not exists whatsapp_sessions_session_id_idx
    on public.whatsapp_sessions(session_id);
