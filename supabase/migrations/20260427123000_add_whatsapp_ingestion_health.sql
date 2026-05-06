create table if not exists public.whatsapp_ingestion_health (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.profiles (id) on delete cascade,
    session_label text not null,
    phone_number text,
    owner_name text,
    connection_status text not null default 'disconnected' check (connection_status in ('connecting', 'connected', 'disconnected')),
    connected_at timestamptz,
    last_seen_at timestamptz,
    last_group_sync_at timestamptz,
    group_count integer not null default 0,
    active_groups_24h integer not null default 0,
    messages_received_24h integer not null default 0,
    messages_parsed_24h integer not null default 0,
    messages_failed_24h integer not null default 0,
    last_inbound_message_at timestamptz,
    last_parsed_message_at timestamptz,
    last_parser_error_at timestamptz,
    parser_success_rate numeric not null default 100,
    updated_at timestamptz not null default now(),
    unique (tenant_id, session_label)
);

create index if not exists idx_whatsapp_ingestion_health_tenant
    on public.whatsapp_ingestion_health (tenant_id, updated_at desc);

create table if not exists public.whatsapp_group_health (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.profiles (id) on delete cascade,
    session_label text not null,
    group_id text not null,
    group_name text not null,
    is_active boolean not null default true,
    last_group_sync_at timestamptz,
    last_message_at timestamptz,
    last_parsed_at timestamptz,
    messages_received_24h integer not null default 0,
    messages_parsed_24h integer not null default 0,
    messages_failed_24h integer not null default 0,
    status text not null default 'quiet' check (status in ('active', 'quiet', 'stale', 'error')),
    updated_at timestamptz not null default now(),
    unique (tenant_id, session_label, group_id)
);

create index if not exists idx_whatsapp_group_health_tenant
    on public.whatsapp_group_health (tenant_id, session_label, updated_at desc);

create table if not exists public.whatsapp_event_logs (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.profiles (id) on delete cascade,
    session_label text not null,
    event_type text not null,
    message text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_event_logs_tenant
    on public.whatsapp_event_logs (tenant_id, created_at desc);
