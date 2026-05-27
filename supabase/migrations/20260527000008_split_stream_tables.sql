-- Split stream_items into residential and commercial tables
-- Quality data is the moat. Separate tables enable separate filters, indexes, and search.

-- ── Residential stream ─────────────────────────────────────────────────────
create table if not exists stream_items_residential (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    message_id text not null,
    source_message_id text,
    source_group_id text,
    source_group_name text,
    source_phone text,
    raw_text text not null,
    type text not null default 'Sale',
    record_type text not null default 'unknown',
    locality text,
    city text,
    bhk text,
    price_label text,
    price_numeric numeric,
    deal_type text,
    asset_class text default 'residential',
    property_category text default 'residential',
    area_sqft numeric,
    furnishing text,
    floor_number text,
    total_floors text,
    parking text,
    property_use text default 'residential',
    building_name text,
    micro_location text,
    confidence_score numeric not null default 0,
    ingestion_status text not null default 'accepted'
        check (ingestion_status in ('accepted', 'expired', 'suppressed_low_effort', 'suppressed_bulk_spam', 'suppressed_unresolved_context')),
    parsed_payload jsonb not null default '{}'::jsonb,
    message_hash text,
    content_hash text,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    embedding vector(768),
    unique (tenant_id, message_id)
);

create index if not exists idx_stream_res_tenant_created
    on stream_items_residential (tenant_id, created_at desc);

create index if not exists idx_stream_res_tenant_locality
    on stream_items_residential (tenant_id, locality);

create index if not exists idx_stream_res_tenant_bhk
    on stream_items_residential (tenant_id, bhk);

create index if not exists idx_stream_res_tenant_ingestion
    on stream_items_residential (tenant_id, ingestion_status, created_at desc);

create index if not exists idx_stream_res_building_name
    on stream_items_residential (building_name);

create index if not exists idx_stream_res_message_hash
    on stream_items_residential (tenant_id, message_hash)
    where message_hash is not null;

create index if not exists idx_stream_res_complete
    on stream_items_residential (tenant_id, created_at desc)
    where ingestion_status = 'accepted';

-- ── Commercial stream ──────────────────────────────────────────────────────
create table if not exists stream_items_commercial (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    message_id text not null,
    source_message_id text,
    source_group_id text,
    source_group_name text,
    source_phone text,
    raw_text text not null,
    type text not null default 'Sale',
    record_type text not null default 'unknown',
    locality text,
    city text,
    price_label text,
    price_numeric numeric,
    deal_type text,
    asset_class text,
    property_category text default 'commercial',
    area_sqft numeric,
    furnishing text,
    floor_number text,
    total_floors text,
    parking text,
    property_use text,
    building_name text,
    micro_location text,
    confidence_score numeric not null default 0,
    ingestion_status text not null default 'accepted'
        check (ingestion_status in ('accepted', 'expired', 'suppressed_low_effort', 'suppressed_bulk_spam', 'suppressed_unresolved_context')),
    parsed_payload jsonb not null default '{}'::jsonb,
    message_hash text,
    content_hash text,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    embedding vector(768),
    unique (tenant_id, message_id)
);

create index if not exists idx_stream_com_tenant_created
    on stream_items_commercial (tenant_id, created_at desc);

create index if not exists idx_stream_com_tenant_locality
    on stream_items_commercial (tenant_id, locality);

create index if not exists idx_stream_com_tenant_property_use
    on stream_items_commercial (tenant_id, property_use);

create index if not exists idx_stream_com_tenant_ingestion
    on stream_items_commercial (tenant_id, ingestion_status, created_at desc);

create index if not exists idx_stream_com_building_name
    on stream_items_commercial (building_name);

create index if not exists idx_stream_com_message_hash
    on stream_items_commercial (tenant_id, message_hash)
    where message_hash is not null;

create index if not exists idx_stream_com_complete
    on stream_items_commercial (tenant_id, created_at desc)
    where ingestion_status = 'accepted';

-- ── RLS policies ───────────────────────────────────────────────────────────
alter table stream_items_residential enable row level security;
alter table stream_items_commercial enable row level security;

create policy stream_res_select_own
    on stream_items_residential for select
    using (tenant_id = auth.uid());

create policy stream_com_select_own
    on stream_items_commercial for select
    using (tenant_id = auth.uid());

create policy stream_res_insert_own
    on stream_items_residential for insert
    with check (tenant_id = auth.uid());

create policy stream_com_insert_own
    on stream_items_commercial for insert
    with check (tenant_id = auth.uid());

create policy stream_res_update_own
    on stream_items_residential for update
    using (tenant_id = auth.uid())
    with check (tenant_id = auth.uid());

create policy stream_com_update_own
    on stream_items_commercial for update
    using (tenant_id = auth.uid())
    with check (tenant_id = auth.uid());

create policy stream_res_delete_own
    on stream_items_residential for delete
    using (tenant_id = auth.uid());

create policy stream_com_delete_own
    on stream_items_commercial for delete
    using (tenant_id = auth.uid());

-- ── Expiry trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_stream_item_expiry_res()
RETURNS TRIGGER AS $$
BEGIN
    NEW.expires_at := COALESCE(NEW.expires_at, now() + INTERVAL '30 days');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_stream_item_expiry_com()
RETURNS TRIGGER AS $$
BEGIN
    NEW.expires_at := COALESCE(NEW.expires_at, now() + INTERVAL '30 days');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_stream_res_expiry ON stream_items_residential;
CREATE TRIGGER trigger_stream_res_expiry
    BEFORE INSERT ON stream_items_residential
    FOR EACH ROW
    EXECUTE FUNCTION set_stream_item_expiry_res();

DROP TRIGGER IF EXISTS trigger_stream_com_expiry ON stream_items_commercial;
CREATE TRIGGER trigger_stream_com_expiry
    BEFORE INSERT ON stream_items_commercial
    FOR EACH ROW
    EXECUTE FUNCTION set_stream_item_expiry_com();

-- ── Realtime ───────────────────────────────────────────────────────────────
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'stream_items_residential'
    ) then
        alter publication supabase_realtime add table public.stream_items_residential;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'stream_items_commercial'
    ) then
        alter publication supabase_realtime add table public.stream_items_commercial;
    end if;
end $$;

-- ── Backfill: migrate existing data ────────────────────────────────────────
insert into stream_items_residential (
    tenant_id, message_id, source_message_id, source_group_id, source_group_name,
    source_phone, raw_text, type, record_type, locality, city, bhk,
    price_label, price_numeric, deal_type, asset_class, property_category,
    area_sqft, furnishing, floor_number, total_floors, parking, property_use,
    building_name, micro_location, confidence_score, ingestion_status,
    parsed_payload, message_hash, content_hash, expires_at, created_at, embedding
)
select
    tenant_id, message_id, source_message_id, source_group_id, source_group_name,
    source_phone, raw_text, type, record_type, locality, city, bhk,
    price_label, price_numeric, deal_type, asset_class,
    coalesce(parsed_payload->>'propertyCategory', 'residential'),
    area_sqft, furnishing, floor_number, total_floors,
    parsed_payload->>'parking',
    coalesce(property_use, parsed_payload->>'propertyUse', 'residential'),
    building_name,
    parsed_payload->>'microLocation',
    confidence_score, ingestion_status,
    parsed_payload, message_hash, content_hash, expires_at, created_at, embedding
from stream_items
where coalesce(asset_class, parsed_payload->>'assetClass', 'residential') = 'residential'
   or coalesce(property_use, parsed_payload->>'propertyUse', 'residential') = 'residential'
on conflict (tenant_id, message_id) do nothing;

insert into stream_items_commercial (
    tenant_id, message_id, source_message_id, source_group_id, source_group_name,
    source_phone, raw_text, type, record_type, locality, city,
    price_label, price_numeric, deal_type, asset_class, property_category,
    area_sqft, furnishing, floor_number, total_floors, parking, property_use,
    building_name, micro_location, confidence_score, ingestion_status,
    parsed_payload, message_hash, content_hash, expires_at, created_at, embedding
)
select
    tenant_id, message_id, source_message_id, source_group_id, source_group_name,
    source_phone, raw_text, type, record_type, locality, city,
    price_label, price_numeric, deal_type, asset_class,
    coalesce(parsed_payload->>'propertyCategory', 'commercial'),
    area_sqft, furnishing, floor_number, total_floors,
    parsed_payload->>'parking',
    coalesce(property_use, parsed_payload->>'propertyUse'),
    building_name,
    parsed_payload->>'microLocation',
    confidence_score, ingestion_status,
    parsed_payload, message_hash, content_hash, expires_at, created_at, embedding
from stream_items
where coalesce(asset_class, parsed_payload->>'assetClass') in ('commercial', 'office', 'retail', 'showroom', 'warehouse', 'industrial')
   or coalesce(property_use, parsed_payload->>'propertyUse') in ('office', 'retail', 'showroom', 'warehouse', 'industrial')
on conflict (tenant_id, message_id) do nothing;

notify pgrst, 'reload schema';
