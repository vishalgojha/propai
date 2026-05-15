create table if not exists broker_channels (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    created_by uuid,
    name text not null,
    slug text not null,
    channel_type text not null default 'mixed' check (channel_type in ('listing', 'requirement', 'mixed')),
    localities jsonb not null default '[]'::jsonb,
    keywords_include jsonb not null default '[]'::jsonb,
    keywords_exclude jsonb not null default '[]'::jsonb,
    deal_types jsonb not null default '[]'::jsonb,
    record_types jsonb not null default '[]'::jsonb,
    bhk_values jsonb not null default '[]'::jsonb,
    asset_classes jsonb not null default '[]'::jsonb,
    budget_min numeric,
    budget_max numeric,
    confidence_min numeric not null default 0,
    pinned boolean not null default true,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, slug)
);

create index if not exists idx_broker_channels_tenant_active
    on broker_channels (tenant_id, is_active, updated_at desc);

create table if not exists stream_items (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    message_id text not null,
    source_message_id text,
    source_group_id text,
    source_group_name text,
    source_phone text,
    raw_text text not null,
    type text not null default 'Sale',
    record_type text not null default 'unknown',
    locality text,
    city text,
    bhk text,
    price_label text,
    price_numeric numeric,
    deal_type text,
    asset_class text,
    confidence_score numeric not null default 0,
    parsed_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (tenant_id, message_id)
);

create index if not exists idx_stream_items_tenant_created
    on stream_items (tenant_id, created_at desc);

create index if not exists idx_stream_items_tenant_locality
    on stream_items (tenant_id, locality);

create table if not exists channel_items (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    channel_id uuid not null references broker_channels (id) on delete cascade,
    stream_item_id uuid not null references stream_items (id) on delete cascade,
    matched_by text not null default 'rule',
    match_score numeric not null default 0,
    is_read boolean not null default false,
    created_at timestamptz not null default now(),
    unique (channel_id, stream_item_id)
);

create index if not exists idx_channel_items_channel_created
    on channel_items (channel_id, created_at desc);

create index if not exists idx_channel_items_channel_unread
    on channel_items (channel_id, is_read);
