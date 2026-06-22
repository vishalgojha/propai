-- Live sync: stream_items_residential/commercial → public_listings
-- Previously public_listings was populated only via one-time backfill.
-- This trigger keeps it in sync as new listings are accepted.

-- Ensure unique constraint for upsert
create unique index if not exists public_listings_source_message_id_key
    on public.public_listings (source_message_id)
    where source_message_id is not null;

create or replace function public.sync_stream_item_to_public_listings()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
    if NEW.ingestion_status = 'accepted' and NEW.record_type = 'listing' then
        insert into public.public_listings (
            source_message_id, source_group_id, source_group_name,
            listing_type, area, location, price, price_type, size_sqft,
            furnishing, building_name, title, description,
            raw_message, sender_number, primary_contact_name,
            primary_contact_number, primary_contact_wa, confidence,
            message_timestamp, search_text, created_at
        )
        values (
            coalesce(NEW.message_id, NEW.source_message_id),
            NEW.source_group_id,
            NEW.source_group_name,
            case
                when NEW.type = 'Rent' then 'listing_rent'
                when NEW.type = 'Sale' then 'listing_sale'
                else 'requirement'
            end,
            NEW.locality,
            coalesce(NEW.locality, NEW.city, 'Unknown'),
            NEW.price_numeric,
            case
                when NEW.type = 'Rent' then 'monthly'
                when NEW.type = 'Sale' then 'total'
                else null
            end,
            NEW.area_sqft,
            NEW.furnishing,
            NEW.building_name,
            coalesce(
                nullif(trim(NEW.parsed_payload->>'title'), ''),
                coalesce(NEW.configuration || ' ' || NEW.locality, NEW.locality, 'Property in ' || NEW.city, 'Property')
            ),
            coalesce(NEW.raw_text, ''),
            NEW.raw_text,
            NEW.source_phone,
            null,
            NEW.source_phone,
            NEW.source_phone,
            NEW.confidence_score,
            NEW.created_at,
            coalesce(NEW.raw_text || ' ' || NEW.locality || ' ' || NEW.configuration || ' ' || NEW.type, NEW.raw_text),
            NEW.created_at
        )
        on conflict (source_message_id)
        do update set
            listing_type = excluded.listing_type,
            area = excluded.area,
            location = excluded.location,
            price = excluded.price,
            price_type = excluded.price_type,
            size_sqft = excluded.size_sqft,
            furnishing = excluded.furnishing,
            building_name = excluded.building_name,
            title = excluded.title,
            description = excluded.description,
            raw_message = excluded.raw_message,
            sender_number = excluded.sender_number,
            primary_contact_number = excluded.primary_contact_number,
            primary_contact_wa = excluded.primary_contact_wa,
            confidence = excluded.confidence,
            message_timestamp = excluded.message_timestamp,
            search_text = excluded.search_text;
    end if;
    return NEW;
end;
$func$;

drop trigger if exists trigger_sync_stream_item_to_public_listings_res on public.stream_items_residential;
create trigger trigger_sync_stream_item_to_public_listings_res
  after insert or update of ingestion_status, record_type
  on public.stream_items_residential
  for each row
  execute function public.sync_stream_item_to_public_listings();

drop trigger if exists trigger_sync_stream_item_to_public_listings_com on public.stream_items_commercial;
create trigger trigger_sync_stream_item_to_public_listings_com
  after insert or update of ingestion_status, record_type
  on public.stream_items_commercial
  for each row
  execute function public.sync_stream_item_to_public_listings();

-- Backfill any accepted listings that are missing from public_listings
insert into public.public_listings (
    source_message_id, source_group_id, source_group_name,
    listing_type, area, location, price, price_type, size_sqft,
    furnishing, building_name, title, description,
    raw_message, sender_number, primary_contact_name,
    primary_contact_number, primary_contact_wa, confidence,
    message_timestamp, search_text, created_at
)
select
    coalesce(r.message_id, r.source_message_id),
    r.source_group_id,
    r.source_group_name,
    case
        when r.type = 'Rent' then 'listing_rent'
        when r.type = 'Sale' then 'listing_sale'
        else 'requirement'
    end,
    r.locality,
    coalesce(r.locality, r.city, 'Unknown'),
    r.price_numeric,
    case
        when r.type = 'Rent' then 'monthly'
        when r.type = 'Sale' then 'total'
        else null
    end,
    r.area_sqft,
    r.furnishing,
    r.building_name,
    coalesce(
        nullif(trim(r.parsed_payload->>'title'), ''),
        coalesce(r.configuration || ' ' || r.locality, r.locality, 'Property in ' || r.city, 'Property')
    ),
    coalesce(r.raw_text, ''),
    r.raw_text,
    r.source_phone,
    null,
    r.source_phone,
    r.source_phone,
    r.confidence_score,
    r.created_at,
    coalesce(r.raw_text || ' ' || r.locality || ' ' || r.configuration || ' ' || r.type, r.raw_text),
    r.created_at
from (
    select distinct on (coalesce(message_id, source_message_id))
        message_id, source_message_id, source_group_id, source_group_name,
        type, locality, city, price_numeric, area_sqft, furnishing,
        configuration, building_name, parsed_payload, raw_text, source_phone,
        confidence_score, created_at
    from public.stream_items_residential
    where ingestion_status = 'accepted'
      and record_type = 'listing'

    union all

    select distinct on (coalesce(message_id, source_message_id))
        message_id, source_message_id, source_group_id, source_group_name,
        type, locality, city, price_numeric, area_sqft, furnishing,
        configuration, building_name, parsed_payload, raw_text, source_phone,
        confidence_score, created_at
    from public.stream_items_commercial
    where ingestion_status = 'accepted'
      and record_type = 'listing'
) r
on conflict (source_message_id) do nothing;

notify pgrst, 'reload schema';
