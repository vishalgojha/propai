alter table public.stream_items
    add column if not exists ingestion_status text not null default 'accepted',
    add column if not exists suppression_reason text,
    add column if not exists suppressed_at timestamptz,
    add column if not exists resolution_context jsonb not null default '{}'::jsonb;

alter table public.stream_items
    drop constraint if exists stream_items_ingestion_status_check;

alter table public.stream_items
    add constraint stream_items_ingestion_status_check
    check (ingestion_status in (
        'accepted',
        'suppressed_low_effort',
        'suppressed_bulk_spam',
        'suppressed_unresolved_context'
    ));

create index if not exists idx_stream_items_ingestion_status
    on public.stream_items (tenant_id, ingestion_status, created_at desc);
