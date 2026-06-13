-- Add missing group_count column if it doesn't exist (production DB missing it)
alter table public.whatsapp_ingestion_health
    add column if not exists group_count integer not null default 0;
