-- The original stream read-path migration backfilled only residential rows.
-- Keep public_listings complete for both public inventory categories.
insert into public.public_listings (
    source_message_id, source_group_id, source_group_name,
    listing_type, area, location, price, price_type, size_sqft,
    furnishing, building_name, title, description,
    raw_message, sender_number, primary_contact_name,
    primary_contact_number, primary_contact_wa, confidence,
    message_timestamp, search_text, created_at
)
select
    source_message_id,
    source_group_id,
    source_group_name,
    case
        when type = 'Rent' then 'listing_rent'
        when type = 'Sale' then 'listing_sale'
        else 'requirement'
    end as listing_type,
    locality as area,
    coalesce(locality, city, 'Unknown') as location,
    price_numeric as price,
    case
        when type = 'Rent' then 'monthly'
        when type = 'Sale' then 'total'
        else null
    end as price_type,
    area_sqft as size_sqft,
    furnishing,
    building_name,
    coalesce(
        nullif(trim(parsed_payload->>'title'), ''),
        coalesce(configuration || ' ' || locality, locality, 'Property in ' || city, 'Property')
    ) as title,
    coalesce(raw_text, '') as description,
    raw_text as raw_message,
    source_phone as sender_number,
    null as primary_contact_name,
    source_phone as primary_contact_number,
    source_phone as primary_contact_wa,
    confidence_score as confidence,
    created_at as message_timestamp,
    coalesce(raw_text || ' ' || locality || ' ' || configuration || ' ' || type, raw_text) as search_text,
    created_at
from (
    select
        coalesce(message_id, source_message_id) as source_message_id,
        source_group_id, source_group_name, type, locality, price_numeric,
        area_sqft, furnishing, configuration, building_name, parsed_payload,
        raw_text, source_phone, confidence_score, created_at, city
    from public.stream_items_residential
    where ingestion_status = 'accepted'
      and record_type = 'listing'

    union all

    select
        coalesce(message_id, source_message_id) as source_message_id,
        source_group_id, source_group_name, type, locality, price_numeric,
        area_sqft, furnishing, configuration, building_name, parsed_payload,
        raw_text, source_phone, confidence_score, created_at, city
    from public.stream_items_commercial
    where ingestion_status = 'accepted'
      and record_type = 'listing'
) as stream_rows
where source_message_id is not null
  and not exists (
      select 1
      from public.public_listings existing
      where existing.source_message_id = stream_rows.source_message_id
  );

notify pgrst, 'reload schema';
