-- Child stream tables use configuration as the canonical property descriptor.
-- Do not require or backfill the legacy bhk column.
alter table public.stream_items_residential
    add column if not exists configuration text;

alter table public.stream_items_commercial
    add column if not exists configuration text;

-- Residential is the only child table that has the legacy bhk field.
update public.stream_items_residential
set configuration = bhk
where configuration is null
  and bhk is not null;

create index if not exists idx_stream_items_res_configuration
    on public.stream_items_residential (tenant_id, configuration);

create index if not exists idx_stream_items_com_configuration
    on public.stream_items_commercial (tenant_id, configuration);

-- The previous RPC exposed bhk in its result row type. PostgreSQL requires a
-- drop before replacing it with the configuration-based result contract.
drop function if exists public.match_listings(vector(768), double precision, integer, uuid, text, text, text);
drop function if exists public.market_stats(text, integer);

create or replace function match_listings(
    query_embedding vector(768),
    match_threshold float default 0.7,
    match_count int default 10,
    p_tenant_id uuid default null,
    p_locality text default null,
    p_configuration text default null,
    p_type text default null
)
returns table (
    id uuid,
    tenant_id uuid,
    message_id text,
    locality text,
    configuration text,
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
        si.configuration,
        si.price_numeric,
        si.price_label,
        si.type,
        si.raw_text,
        1 - (si.embedding <=> query_embedding) as similarity
    from (
        select id, tenant_id, message_id, locality, configuration,
               price_numeric, price_label, type, raw_text, embedding
        from public.stream_items_residential
        where embedding is not null
        union all
        select id, tenant_id, message_id, locality, configuration,
               price_numeric, price_label, type, raw_text, embedding
        from public.stream_items_commercial
        where embedding is not null
    ) si
    where 1 - (si.embedding <=> query_embedding) > match_threshold
      and (p_tenant_id is null or si.tenant_id = p_tenant_id)
      and (p_locality is null or si.locality = p_locality)
      and (p_configuration is null or si.configuration = p_configuration)
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
    configuration_distribution jsonb,
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
            (
                select jsonb_object_agg(configuration, cnt)
                from (
                    select si2.configuration, count(*) as cnt
                    from (
                        select locality, configuration, created_at
                        from public.stream_items_residential
                        union all
                        select locality, configuration, created_at
                        from public.stream_items_commercial
                    ) si2
                    where si2.locality = si.locality
                      and si2.created_at >= now() - (p_days || ' days')::interval
                      and si2.configuration is not null
                    group by si2.configuration
                ) configurations
            ),
            '{}'::jsonb
        ) as configuration_distribution,
        coalesce(
            (
                select jsonb_object_agg(type, cnt)
                from (
                    select si2.type, count(*) as cnt
                    from (
                        select locality, type, created_at
                        from public.stream_items_residential
                        union all
                        select locality, type, created_at
                        from public.stream_items_commercial
                    ) si2
                    where si2.locality = si.locality
                      and si2.created_at >= now() - (p_days || ' days')::interval
                    group by si2.type
                ) types
            ),
            '{}'::jsonb
        ) as type_distribution
    from (
        select locality, price_numeric, created_at
        from public.stream_items_residential
        where price_numeric is not null and locality is not null
        union all
        select locality, price_numeric, created_at
        from public.stream_items_commercial
        where price_numeric is not null and locality is not null
    ) si
    where si.created_at >= now() - (p_days || ' days')::interval
      and (p_locality is null or si.locality = p_locality)
    group by si.locality;
end;
$func$;

create or replace function public.sync_stream_item_to_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
    insert into public.stream_items (
        id, tenant_id, message_id, source_message_id, source_group_id,
        source_group_name, source_phone, raw_text, type, record_type,
        locality, city, configuration, price_label, price_numeric,
        deal_type, asset_class, property_category, area_sqft, furnishing,
        floor_number, total_floors, property_use, building_name,
        confidence_score, parsed_payload, embedding, ingestion_status,
        content_hash, expires_at, created_at
    )
    values (
        NEW.id, NEW.tenant_id, NEW.message_id, NEW.source_message_id, NEW.source_group_id,
        NEW.source_group_name, NEW.source_phone, NEW.raw_text, NEW.type, NEW.record_type,
        NEW.locality, NEW.city, NEW.configuration, NEW.price_label, NEW.price_numeric,
        NEW.deal_type, NEW.asset_class, NEW.property_category, NEW.area_sqft, NEW.furnishing,
        NEW.floor_number, NEW.total_floors, NEW.property_use, NEW.building_name,
        NEW.confidence_score, NEW.parsed_payload, NEW.embedding, NEW.ingestion_status,
        NEW.content_hash, NEW.expires_at, NEW.created_at
    )
    on conflict (tenant_id, message_id)
    do update set
        raw_text = excluded.raw_text,
        type = excluded.type,
        record_type = excluded.record_type,
        locality = excluded.locality,
        city = excluded.city,
        configuration = excluded.configuration,
        price_label = excluded.price_label,
        price_numeric = excluded.price_numeric,
        deal_type = excluded.deal_type,
        asset_class = excluded.asset_class,
        property_category = excluded.property_category,
        area_sqft = excluded.area_sqft,
        furnishing = excluded.furnishing,
        floor_number = excluded.floor_number,
        total_floors = excluded.total_floors,
        property_use = excluded.property_use,
        building_name = excluded.building_name,
        confidence_score = excluded.confidence_score,
        parsed_payload = excluded.parsed_payload,
        embedding = excluded.embedding,
        ingestion_status = excluded.ingestion_status,
        content_hash = excluded.content_hash,
        expires_at = excluded.expires_at;
    return NEW;
end;
$func$;

drop trigger if exists trigger_sync_stream_item_to_parent_res on public.stream_items_residential;
create trigger trigger_sync_stream_item_to_parent_res
  after insert or update on public.stream_items_residential
  for each row
  execute function public.sync_stream_item_to_parent();

drop trigger if exists trigger_sync_stream_item_to_parent_com on public.stream_items_commercial;
create trigger trigger_sync_stream_item_to_parent_com
  after insert or update on public.stream_items_commercial
  for each row
  execute function public.sync_stream_item_to_parent();

insert into public.stream_items (
    id, tenant_id, message_id, source_message_id, source_group_id,
    source_group_name, source_phone, raw_text, type, record_type,
    locality, city, configuration, price_label, price_numeric,
    deal_type, asset_class, property_category, area_sqft, furnishing,
    floor_number, total_floors, property_use, building_name,
    confidence_score, parsed_payload, ingestion_status,
    content_hash, expires_at, created_at
)
select
    id, tenant_id, message_id, source_message_id, source_group_id,
    source_group_name, source_phone, raw_text, type, record_type,
    locality, city, configuration, price_label, price_numeric,
    deal_type, asset_class, property_category, area_sqft, furnishing,
    floor_number, total_floors, property_use, building_name,
    confidence_score, parsed_payload, ingestion_status,
    content_hash, expires_at, created_at
from public.stream_items_residential
on conflict (tenant_id, message_id) do nothing;

insert into public.stream_items (
    id, tenant_id, message_id, source_message_id, source_group_id,
    source_group_name, source_phone, raw_text, type, record_type,
    locality, city, configuration, price_label, price_numeric,
    deal_type, asset_class, property_category, area_sqft, furnishing,
    floor_number, total_floors, property_use, building_name,
    confidence_score, parsed_payload, ingestion_status,
    content_hash, expires_at, created_at
)
select
    id, tenant_id, message_id, source_message_id, source_group_id,
    source_group_name, source_phone, raw_text, type, record_type,
    locality, city, configuration, price_label, price_numeric,
    deal_type, asset_class, property_category, area_sqft, furnishing,
    floor_number, total_floors, property_use, building_name,
    confidence_score, parsed_payload, ingestion_status,
    content_hash, expires_at, created_at
from public.stream_items_commercial
on conflict (tenant_id, message_id) do nothing;

notify pgrst, 'reload schema';
