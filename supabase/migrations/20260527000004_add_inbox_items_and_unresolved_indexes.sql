create table if not exists public.inbox_items (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    listing_id uuid not null references public.stream_items (id) on delete cascade,
    requirement_id uuid not null references public.stream_items (id) on delete cascade,
    match_score numeric not null default 0,
    match_reasons jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, listing_id, requirement_id)
);

create index if not exists idx_inbox_items_tenant_updated
    on public.inbox_items (tenant_id, updated_at desc);

create index if not exists idx_inbox_items_listing_requirement
    on public.inbox_items (listing_id, requirement_id);

create index if not exists idx_stream_items_unresolved_admin
    on public.stream_items (created_at desc, tenant_id)
    where locality is null
       or locality in ('Mumbai', 'Mumbai market')
       or confidence_score < 0.4
       or bhk = 'N/A'
       or coalesce(price_numeric, 0) = 0;
