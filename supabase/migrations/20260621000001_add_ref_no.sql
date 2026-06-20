-- Add ref_no (human-readable reference number, e.g. L-0001 / R-0001) 
-- to listings and requirements for traceability across WhatsApp, app, and www.

-- ============================================================
-- Part 1: Sequences
-- ============================================================
create sequence if not exists listing_ref_seq start 1;
create sequence if not exists requirement_ref_seq start 1;

-- ============================================================
-- Part 2: Add column to all relevant tables
-- ============================================================
alter table stream_items_residential add column if not exists ref_no text;
alter table stream_items_commercial add column if not exists ref_no text;
alter table stream_items add column if not exists ref_no text;
alter table public_listings add column if not exists ref_no text;

-- ============================================================
-- Part 3: Trigger to auto-generate ref_no on insert
-- ============================================================
create or replace function set_ref_no()
returns trigger
language plpgsql
as $$
begin
    if new.ref_no is null then
        if new.record_type = 'requirement' then
            new.ref_no := 'R-' || lpad(nextval('requirement_ref_seq')::text, 4, '0');
        else
            new.ref_no := 'L-' || lpad(nextval('listing_ref_seq')::text, 4, '0');
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_set_ref_no_res on stream_items_residential;
create trigger trg_set_ref_no_res
    before insert on stream_items_residential
    for each row
    execute function set_ref_no();

drop trigger if exists trg_set_ref_no_com on stream_items_commercial;
create trigger trg_set_ref_no_com
    before insert on stream_items_commercial
    for each row
    execute function set_ref_no();

-- ============================================================
-- Part 4: Update sync trigger to parent (copy ref_no)
-- ============================================================
create or replace function public.sync_stream_item_to_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.stream_items (
        id, tenant_id, message_id, source_message_id, source_group_id,
        source_group_name, source_phone, raw_text, type, record_type,
        locality, city, bhk, configuration, price_label, price_numeric,
        deal_type, asset_class, property_category, area_sqft, furnishing,
        floor_number, total_floors, property_use, building_name,
        confidence_score, parsed_payload, embedding, ingestion_status,
        content_hash, expires_at, created_at, ref_no
    )
    values (
        new.id, new.tenant_id, new.message_id, new.source_message_id, new.source_group_id,
        new.source_group_name, new.source_phone, new.raw_text, new.type, new.record_type,
        new.locality, new.city, new.bhk, new.configuration, new.price_label, new.price_numeric,
        new.deal_type, new.asset_class, new.property_category, new.area_sqft, new.furnishing,
        new.floor_number, new.total_floors, new.property_use, new.building_name,
        new.confidence_score, new.parsed_payload, new.embedding, new.ingestion_status,
        new.content_hash, new.expires_at, new.created_at, new.ref_no
    )
    on conflict (tenant_id, message_id)
    do update set
        raw_text = excluded.raw_text,
        type = excluded.type,
        record_type = excluded.record_type,
        locality = excluded.locality,
        city = excluded.city,
        bhk = excluded.bhk,
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
        expires_at = excluded.expires_at,
        ref_no = excluded.ref_no;
    return new;
end;
$$;

-- ============================================================
-- Part 5: Backfill ref_no for existing records
-- ============================================================
do $$
declare
    rec record;
begin
    for rec in select id, record_type from stream_items_residential where ref_no is null order by created_at
    loop
        if rec.record_type = 'requirement' then
            update stream_items_residential set ref_no = 'R-' || lpad(nextval('requirement_ref_seq')::text, 4, '0') where id = rec.id;
        else
            update stream_items_residential set ref_no = 'L-' || lpad(nextval('listing_ref_seq')::text, 4, '0') where id = rec.id;
        end if;
    end loop;

    for rec in select id, record_type from stream_items_commercial where ref_no is null order by created_at
    loop
        if rec.record_type = 'requirement' then
            update stream_items_commercial set ref_no = 'R-' || lpad(nextval('requirement_ref_seq')::text, 4, '0') where id = rec.id;
        else
            update stream_items_commercial set ref_no = 'L-' || lpad(nextval('listing_ref_seq')::text, 4, '0') where id = rec.id;
        end if;
    end loop;
end $$;

-- Sync ref_no to parent table
update stream_items p
set ref_no = coalesce(
    (select ref_no from stream_items_residential where id = p.id and ref_no is not null limit 1),
    (select ref_no from stream_items_commercial where id = p.id and ref_no is not null limit 1)
)
where p.ref_no is null;

-- Sync ref_no to public_listings (join via source_message_id ↔ message_id)
update public_listings pl
set ref_no = sub.ref_no
from (
    select message_id, ref_no from stream_items_residential where ref_no is not null
    union all
    select message_id, ref_no from stream_items_commercial where ref_no is not null
) sub
where pl.source_message_id = sub.message_id
  and pl.ref_no is null;

notify pgrst, 'reload schema';
