-- ============================================================
-- PropAI Pending Migrations - Run all in Supabase SQL Editor
-- ============================================================

-- Step 1: Add messages to Realtime publication
alter publication supabase_realtime add table public.messages;

-- Step 2: Add broker_channels and channel_items to Realtime publication
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'broker_channels'
    ) then
        alter publication supabase_realtime add table public.broker_channels;
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'channel_items'
    ) then
        alter publication supabase_realtime add table public.channel_items;
    end if;
end
$$;

-- Step 3: Add is_revoked column to messages
alter table if exists public.messages
  add column if not exists is_revoked boolean not null default false;

drop index if exists idx_messages_tenant_revoked;
create index if not exists idx_messages_tenant_revoked
  on public.messages (tenant_id, is_revoked) where is_revoked = true;

-- ============================================================
-- Step 4: RLS diagnostic (run these SELECTs AFTER redeploy)
-- ============================================================
-- Check stream_items tenant_id distribution:
-- SELECT tenant_id, COUNT(*) as item_count
-- FROM stream_items
-- GROUP BY tenant_id
-- ORDER BY item_count DESC
-- LIMIT 20;

-- Check for orphan tenant_ids (no matching profile):
-- SELECT si.tenant_id, COUNT(*) as orphan_count
-- FROM stream_items si
-- LEFT JOIN profiles p ON p.id = si.tenant_id
-- WHERE p.id IS NULL
-- GROUP BY si.tenant_id
-- LIMIT 20;