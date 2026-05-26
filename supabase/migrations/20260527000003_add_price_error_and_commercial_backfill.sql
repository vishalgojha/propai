-- Add 'price_error' to the ingestion_status check constraint
alter table public.stream_items
    drop constraint if exists stream_items_ingestion_status_check;

alter table public.stream_items
    add constraint stream_items_ingestion_status_check
    check (ingestion_status in (
        'accepted',
        'expired',
        'price_error',
        'suppressed_low_effort',
        'suppressed_bulk_spam',
        'suppressed_unresolved_context'
    ));

-- Backfill price_error for existing records with insane prices
update public.stream_items
set ingestion_status = 'price_error'
where ingestion_status = 'accepted'
and (
    (type ilike '%rent%' and price_numeric > 5000000)
    or (type ilike '%rent%' and price_numeric < 5000)
    or (type ilike '%sale%' and price_numeric > 500000000)
);

-- Backfill commercial property_category for records matching commercial keywords with N/A BHK
update public.stream_items
set property_category = 'commercial'
where (property_category is null or property_category = 'residential')
and (
    bhk is null or bhk = ''
)
and raw_text ilike any (array[
    '%gaming%',
    '%office%',
    '%shop%',
    '%showroom%',
    '%retail%',
    '%warehouse%',
    '%restaurant%',
    '%cafe%',
    '%salon%',
    '%clinic%',
    '%entertainment zone%',
    '%co-working%',
    '%co working%',
    '%coworking%',
    '%pcmc%'
]);
