create table if not exists public.igr_enrichment_queue (
    id bigserial primary key,
    stream_item_id uuid references public.stream_items (id) on delete set null,
    building_name text not null,
    locality text not null default '',
    status text not null default 'pending'
        check (status in ('pending', 'done', 'failed')),
    last_checked_at timestamptz,
    created_at timestamptz not null default now(),
    unique (building_name, locality)
);

create index if not exists idx_igr_enrichment_queue_status_created
    on public.igr_enrichment_queue (status, created_at asc);

create index if not exists idx_igr_enrichment_queue_stream_item
    on public.igr_enrichment_queue (stream_item_id);

alter table public.igr_enrichment_queue enable row level security;
