-- Efficient polling for the webhook queue worker
create index if not exists cloud_api_webhook_events_processed_created_at_idx
    on public.cloud_api_webhook_events (processed, created_at)
    where processed = false;
