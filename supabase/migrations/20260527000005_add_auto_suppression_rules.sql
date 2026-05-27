-- Add 'insufficient_data' to ingestion_status check constraint for auto-suppressed messages
alter table public.stream_items
    drop constraint if exists stream_items_ingestion_status_check;

alter table public.stream_items
    add constraint stream_items_ingestion_status_check
    check (ingestion_status in (
        'accepted',
        'expired',
        'price_error',
        'suppressed_low_effort',
        'suppressed_bulk_spam',
        'suppressed_unresolved_context',
        'insufficient_data'
    ));

-- Create index for the new status (optional but helpful for queries)
create index if not exists idx_stream_items_insufficient_data
    on public.stream_items (tenant_id, ingestion_status, created_at desc)
    where ingestion_status = 'insufficient_data';