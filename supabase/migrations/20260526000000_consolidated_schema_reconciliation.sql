create table if not exists public.workspaces (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  agency_name text,
  primary_city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_service_areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(owner_id) on delete cascade,
  city text not null,
  locality text not null,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, city, locality)
);

create index if not exists workspace_service_areas_workspace_id_idx
  on public.workspace_service_areas (workspace_id);

create table if not exists wa_click_events (
    id uuid primary key default gen_random_uuid(),
    listing_id text not null,
    broker_phone text not null,
    user_id text not null,
    workspace_id text not null,
    source text not null default 'stream',
    device text not null default 'web',
    clicked_at timestamptz not null default now()
);

create index if not exists idx_wa_click_events_workspace_clicked
    on wa_click_events (workspace_id, clicked_at desc);

create index if not exists idx_wa_click_events_listing
    on wa_click_events (listing_id);

create table if not exists public.whatsapp_presence_events (
    id uuid primary key default gen_random_uuid(),
    workspace_owner_id uuid not null references public.profiles(id) on delete cascade,
    actor_user_id uuid references public.profiles(id) on delete set null,
    session_label text,
    source text not null default 'extension',
    event_type text not null,
    status text not null,
    remote_jid text,
    tab_id text,
    url text,
    metadata jsonb not null default '{}'::jsonb,
    observed_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_presence_events_workspace_observed_at
    on public.whatsapp_presence_events (workspace_owner_id, observed_at desc);

create index if not exists idx_whatsapp_presence_events_workspace_session
    on public.whatsapp_presence_events (workspace_owner_id, session_label, observed_at desc);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    subscription JSONB NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_id ON push_subscriptions(tenant_id);

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

CREATE TABLE IF NOT EXISTS broadcast_unsubscribes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  reason TEXT,
  source TEXT DEFAULT 'manual',
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_unsubscribes_tenant ON broadcast_unsubscribes(tenant_id);

ALTER TABLE broadcast_unsubscribes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'broadcast_unsubscribes'
      AND policyname = 'broadcast_unsubscribes_tenant_access'
  ) THEN
    CREATE POLICY broadcast_unsubscribes_tenant_access
      ON broadcast_unsubscribes
      FOR ALL
      USING (tenant_id = auth.uid());
  END IF;
END $$;

ALTER TABLE stream_items ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE stream_items SET expires_at = created_at + INTERVAL '30 days' WHERE expires_at IS NULL;

CREATE OR REPLACE FUNCTION set_stream_item_expiry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at := COALESCE(NEW.expires_at, now() + INTERVAL '30 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_stream_items_expiry ON stream_items;

CREATE TRIGGER trigger_stream_items_expiry
  BEFORE INSERT ON stream_items
  FOR EACH ROW
  EXECUTE FUNCTION set_stream_item_expiry();

SELECT cron.schedule(
  'expire-stream-items',
  '0 3 * * *',
  $$UPDATE stream_items SET ingestion_status = 'expired' WHERE expires_at < now() AND ingestion_status != 'expired'$$
);

alter table public.whatsapp_group_health
    add column if not exists last_group_sync_at timestamptz,
    add column if not exists last_parsed_at timestamptz,
    add column if not exists messages_received_24h integer not null default 0,
    add column if not exists messages_parsed_24h integer not null default 0,
    add column if not exists messages_failed_24h integer not null default 0;

update public.whatsapp_group_health
set last_group_sync_at = coalesce(last_group_sync_at, last_sync_at)
where last_group_sync_at is null
  and last_sync_at is not null;

alter table public.whatsapp_group_health
    drop constraint if exists whatsapp_group_health_status_check;

alter table public.whatsapp_group_health
    add constraint whatsapp_group_health_status_check
    check (status in ('active', 'quiet', 'stale', 'error', 'unknown'));

alter table public.stream_items
    drop constraint if exists stream_items_ingestion_status_check;

UPDATE stream_items SET ingestion_status = 'accepted'
WHERE ingestion_status IS NULL OR ingestion_status NOT IN ('accepted', 'expired', 'suppressed_low_effort', 'suppressed_bulk_spam', 'suppressed_unresolved_context');

alter table public.stream_items
    add constraint stream_items_ingestion_status_check
    check (ingestion_status in ('accepted', 'expired', 'suppressed_low_effort', 'suppressed_bulk_spam', 'suppressed_unresolved_context'));

drop policy if exists workspace_members_delete_owner on workspace_members;
drop policy if exists workspace_members_insert_owner on workspace_members;
drop policy if exists workspace_members_select_own on workspace_members;
drop policy if exists workspace_members_update_owner on workspace_members;

alter table workspace_members drop constraint if exists workspace_members_workspace_user_unique;

alter table workspace_members rename column workspace_id to workspace_owner_id;
alter table workspace_members rename column user_id to member_user_id;
alter table workspace_members rename column email to member_email;
alter table workspace_members rename column full_name to member_name;

alter table workspace_members add column if not exists member_phone text;
alter table workspace_members add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table workspace_members add column if not exists last_active_at timestamptz;

create unique index if not exists idx_workspace_members_owner_email
  on workspace_members(workspace_owner_id, member_email);

create unique index if not exists idx_workspace_members_owner_user
  on workspace_members(workspace_owner_id, member_user_id)
  where member_user_id is not null;

create index if not exists idx_workspace_members_member_user
  on workspace_members(member_user_id);

create policy workspace_members_delete_owner on workspace_members
  for delete using ((auth.uid() = workspace_owner_id) OR (auth.uid() = tenant_id));

create policy workspace_members_insert_owner on workspace_members
  for insert with check ((auth.uid() = workspace_owner_id) OR (auth.uid() = tenant_id) OR (auth.uid() = member_user_id));

create policy workspace_members_select_own on workspace_members
  for select using ((auth.uid() = member_user_id) OR (auth.uid() = workspace_owner_id) OR (auth.uid() = tenant_id));

create policy workspace_members_update_owner on workspace_members
  for update using ((auth.uid() = workspace_owner_id) OR (auth.uid() = tenant_id))
  with check ((auth.uid() = workspace_owner_id) OR (auth.uid() = tenant_id));

create or replace function public.invoke_worker_function(function_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $func$
declare
  request_id bigint;
  project_url text := null;
  anon_key text := null;
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'vault'
  ) then
    select decrypted_secret into project_url
    from vault.decrypted_secrets
    where name = 'project_url'
    limit 1;
    select decrypted_secret into anon_key
    from vault.decrypted_secrets
    where name = 'anon_key'
    limit 1;
  end if;
  if project_url is null or anon_key is null then
    raise exception 'Vault secrets project_url and anon_key must be configured';
  end if;
  select net.http_post(
    url := project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := payload,
    timeout_milliseconds := 5000
  ) into request_id;
  return request_id;
end;
$func$;

revoke execute on function public.invoke_worker_function(text, jsonb) from public, anon;
grant execute on function public.invoke_worker_function(text, jsonb) to authenticated;

create or replace function match_listings(
    query_embedding vector(768),
    match_threshold float default 0.7,
    match_count int default 10,
    p_tenant_id uuid default null,
    p_locality text default null,
    p_bhk text default null,
    p_type text default null
)
returns table (
    id uuid,
    tenant_id uuid,
    message_id text,
    locality text,
    bhk text,
    price_numeric numeric,
    price_label text,
    type text,
    raw_text text,
    similarity float
)
language plpgsql
set search_path = public
as $func$
begin
    return query
    select
        si.id::uuid,
        si.tenant_id,
        si.message_id,
        si.locality,
        si.bhk,
        si.price_numeric,
        si.price_label,
        si.type,
        si.raw_text,
        1 - (si.embedding <=> query_embedding) as similarity
    from stream_items si
    where si.embedding is not null
      and 1 - (si.embedding <=> query_embedding) > match_threshold
      and (p_tenant_id is null or si.tenant_id = p_tenant_id)
      and (p_locality is null or si.locality = p_locality)
      and (p_bhk is null or si.bhk = p_bhk)
      and (p_type is null or si.type = p_type)
    order by si.embedding <=> query_embedding
    limit match_count;
end;
$func$;

create or replace function market_stats(
    p_locality text default null,
    p_days int default 30
)
returns table (
    locality text,
    avg_price numeric,
    min_price numeric,
    max_price numeric,
    listing_count bigint,
    bhk_distribution jsonb,
    type_distribution jsonb
)
language plpgsql
set search_path = public
as $func$
begin
    return query
    select
        si.locality,
        avg(si.price_numeric) as avg_price,
        min(si.price_numeric) as min_price,
        max(si.price_numeric) as max_price,
        count(*)::bigint as listing_count,
        coalesce(
            (select jsonb_object_agg(bhk, cnt) from (
                select si2.bhk, count(*) as cnt
                from stream_items si2
                where si2.locality = si.locality
                  and si2.created_at >= now() - (p_days || ' days')::interval
                group by si2.bhk
            ) t),
            '{}'::jsonb
        ) as bhk_distribution,
        coalesce(
            (select jsonb_object_agg(type, cnt) from (
                select si2.type, count(*) as cnt
                from stream_items si2
                where si2.locality = si.locality
                  and si2.created_at >= now() - (p_days || ' days')::interval
                group by si2.type
            ) t),
            '{}'::jsonb
        ) as type_distribution
    from stream_items si
    where si.created_at >= now() - (p_days || ' days')::interval
      and si.price_numeric is not null
      and si.locality is not null
      and (p_locality is null or si.locality = p_locality)
    group by si.locality
    order by si.locality;
end;
$func$;

do $fixfuncs$
declare
  func_oid oid;
  func_sig text;
begin
  for func_oid, func_sig in
    select p.oid, p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updated_at', 'sync_profiles_app_role_from_is_admin')
  loop
    execute 'alter function ' || func_sig || ' set search_path = public';
  end loop;
end;
$fixfuncs$;

alter view public.users set (security_invoker = on);
alter view public.broker_profiles set (security_invoker = on);

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
end $$;

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
end $$;

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'messages'
    ) then
        alter publication supabase_realtime add table public.messages;
    end if;
end $$;

DROP TABLE IF EXISTS wabro_message_status_events;
DROP TABLE IF EXISTS wabro_device_registrations;
DROP TABLE IF EXISTS wabro_device_send_progress;
DROP TABLE IF EXISTS wabro_devices;
DROP TABLE IF EXISTS wabro_send_logs;
DROP TABLE IF EXISTS wabro_campaign_contacts;
DROP TABLE IF EXISTS wabro_contacts;
DROP TABLE IF EXISTS wabro_campaigns;
DROP FUNCTION IF EXISTS set_wabro_device_registration_updated_at;

notify pgrst, 'reload schema';
