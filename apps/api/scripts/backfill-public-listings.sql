-- One-time backfill: insert stream_items into public_listings
-- Run this in Supabase SQL Editor (or via psql) once.

INSERT INTO public_listings (
    source_message_id,
    source_group_id,
    source_group_name,
    listing_type,
    area,
    sub_area,
    location,
    price,
    price_type,
    size_sqft,
    furnishing,
    bhk,
    property_type,
    title,
    description,
    raw_message,
    cleaned_message,
    sender_number,
    primary_contact_name,
    primary_contact_number,
    primary_contact_wa,
    contacts,
    confidence,
    message_timestamp,
    search_text
)
SELECT
    COALESCE(si.source_message_id, si.message_id) AS source_message_id,
    si.source_group_id,
    si.source_group_name,
    CASE
        WHEN si.type = 'Rent' THEN 'listing_rent'
        WHEN si.type = 'Sale' THEN 'listing_sale'
        WHEN si.type = 'Pre-leased' THEN 'listing_rent'
        ELSE 'requirement'
    END AS listing_type,
    si.locality AS area,
    NULL AS sub_area,
    COALESCE(si.locality, 'Unknown') AS location,
    si.price_numeric AS price,
    CASE WHEN si.type = 'Rent' THEN 'monthly' WHEN si.type = 'Sale' THEN 'total' ELSE NULL END AS price_type,
    si.area_sqft AS size_sqft,
    si.furnishing,
    NULLIF(regexp_replace(si.bhk, '\D', '', 'g'), '')::int AS bhk,
    NULL AS property_type,
    TRIM(CONCAT_WS(' ', si.bhk, si.locality, CASE WHEN si.type = 'Rent' THEN 'for Rent' WHEN si.type = 'Sale' THEN 'for Sale' END)) AS title,
    COALESCE(si.raw_text, '') AS description,
    si.raw_text AS raw_message,
    NULL AS cleaned_message,
    COALESCE(si.source_phone, NULLIF(regexp_replace(si.raw_text, '.*(\+?91[6-9]\d{9}).*', '\1'), si.raw_text)) AS sender_number,
    si.source_group_name AS primary_contact_name,
    COALESCE(si.source_phone, NULLIF(regexp_replace(si.raw_text, '.*(\+?91[6-9]\d{9}).*', '\1'), si.raw_text)) AS primary_contact_number,
    CASE
        WHEN si.source_phone ~ '\+?91[6-9]\d{9}' THEN '91' || regexp_replace(si.source_phone, '^\+?91', '')
        ELSE NULL
    END AS primary_contact_wa,
    '[]'::jsonb AS contacts,
    COALESCE(si.confidence_score, 0.8) AS confidence,
    COALESCE(si.created_at, now()) AS message_timestamp,
    TRIM(CONCAT_WS(' ', si.raw_text, si.locality, si.bhk, si.type)) AS search_text
FROM stream_items si
LEFT JOIN public_listings pl ON pl.source_message_id = COALESCE(si.source_message_id, si.message_id)
WHERE pl.source_message_id IS NULL;
