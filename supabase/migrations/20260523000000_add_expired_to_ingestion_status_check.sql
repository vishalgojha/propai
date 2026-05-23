-- Add 'expired' to the ingestion_status check constraint so the 30-day TTL
-- pg_cron cleanup job (expire-stream-items) can succeed without constraint violations.
alter table public.stream_items
    drop constraint if exists stream_items_ingestion_status_check;

alter table public.stream_items
    add constraint stream_items_ingestion_status_check
    check (ingestion_status in (
        'accepted',
        'expired',
        'suppressed_low_effort',
        'suppressed_bulk_spam',
        'suppressed_unresolved_context'
    ));
