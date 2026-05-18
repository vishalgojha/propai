alter table public.whatsapp_group_health
    add column if not exists is_active boolean not null default true,
    add column if not exists last_group_sync_at timestamptz,
    add column if not exists last_parsed_at timestamptz,
    add column if not exists messages_received_24h integer not null default 0,
    add column if not exists messages_parsed_24h integer not null default 0,
    add column if not exists messages_failed_24h integer not null default 0;

alter table public.whatsapp_group_health
    drop constraint if exists whatsapp_group_health_status_check;

alter table public.whatsapp_group_health
    add constraint whatsapp_group_health_status_check
    check (status in ('active', 'quiet', 'stale', 'error', 'unknown'));

update public.whatsapp_group_health
set last_group_sync_at = coalesce(last_group_sync_at, last_sync_at)
where last_group_sync_at is null
  and last_sync_at is not null;

notify pgrst, 'reload schema';
