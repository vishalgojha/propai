create table if not exists public.whatsapp_message_mirror (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    session_label text null,
    message_key text null,
    remote_jid text not null,
    chat_type text not null check (chat_type in ('group', 'direct')),
    sender_jid text null,
    sender_name text null,
    text text not null default '',
    timestamp timestamptz not null,
    direction text not null check (direction in ('inbound', 'outbound')),
    message_type text not null default 'text',
    is_revoked boolean not null default false,
    raw_payload jsonb null,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_message_mirror_tenant_message_key_idx
    on public.whatsapp_message_mirror (tenant_id, message_key)
    where message_key is not null;

create index if not exists whatsapp_message_mirror_tenant_timestamp_idx
    on public.whatsapp_message_mirror (tenant_id, timestamp desc);

create index if not exists whatsapp_message_mirror_tenant_session_timestamp_idx
    on public.whatsapp_message_mirror (tenant_id, session_label, timestamp desc);
