-- Replace the locality-only trigger with one that creates channels
-- split by locality + record_type (listing/requirement) + asset_class (residential/commercial).
-- This gives brokers focused channels like "Andheri West Residential" and "Bandra Commercial"
-- instead of a single broad "Andheri West" that mixes everything.

create or replace function public.seed_locality_channel_from_stream_item()
returns trigger
language plpgsql
as $$
declare
    normalized_locality text;
    record_type_key text;
    asset_class_key text;
    channel_name text;
    channel_slug text;
    channel_type text;
    channel_asset_classes jsonb;
    channel_deal_types jsonb;
begin
    if new.tenant_id is null then
        return new;
    end if;

    if lower(coalesce(new.ingestion_status, 'accepted')) <> 'accepted' then
        return new;
    end if;

    normalized_locality := public.normalize_locality_value(new.locality);
    if normalized_locality is null then
        return new;
    end if;

    if lower(normalized_locality) in ('mumbai market', 'mumbai', 'navi mumbai', 'thane', 'pune') then
        return new;
    end if;

    record_type_key := lower(coalesce(new.record_type, ''));
    if record_type_key not in ('listing', 'requirement') then
        return new;
    end if;

    asset_class_key := lower(coalesce(new.asset_class, ''));
    channel_type := case when record_type_key = 'requirement' then 'requirement' else 'listing' end;

    -- Build name + slug + asset_classes based on whether we have a specific asset class
    if asset_class_key in ('residential', 'commercial') then
        channel_name := normalized_locality || ' ' || initcap(asset_class_key);
        channel_slug := public.slugify_locality_value(normalized_locality)
            || '-' || asset_class_key;
        channel_asset_classes := jsonb_build_array(initcap(asset_class_key));
    else
        channel_name := normalized_locality;
        channel_slug := public.slugify_locality_value(normalized_locality)
            || '-' || record_type_key || 's';
        channel_asset_classes := '[]'::jsonb;
    end if;

    -- Insert the specific channel; on conflict (tenant_id, slug) silently skip
    insert into broker_channels (
        tenant_id, created_by, name, slug, channel_type,
        localities, keywords_include, keywords_exclude,
        deal_types, record_types, bhk_values, asset_classes,
        budget_min, budget_max, confidence_min,
        pinned, is_active, created_at, updated_at
    ) values (
        new.tenant_id, new.tenant_id,
        channel_name, channel_slug, channel_type,
        jsonb_build_array(normalized_locality),
        '[]'::jsonb, '[]'::jsonb,
        '[]'::jsonb,
        jsonb_build_array(record_type_key),
        '[]'::jsonb,
        channel_asset_classes,
        null, null, 0,
        true, true, now(), now()
    )
    on conflict (tenant_id, slug) do nothing;

    -- Also ensure a broad locality-only channel exists as a catch-all
    insert into broker_channels (
        tenant_id, created_by, name, slug, channel_type,
        localities, keywords_include, keywords_exclude,
        deal_types, record_types, bhk_values, asset_classes,
        budget_min, budget_max, confidence_min,
        pinned, is_active, created_at, updated_at
    )
    select
        new.tenant_id, new.tenant_id,
        normalized_locality,
        public.slugify_locality_value(normalized_locality),
        'mixed',
        jsonb_build_array(normalized_locality),
        '[]'::jsonb, '[]'::jsonb,
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
        null, null, 0,
        true, true, now(), now()
    where not exists (
        select 1
        from broker_channels bc
        where bc.tenant_id = new.tenant_id
          and bc.is_active = true
          and exists (
              select 1
              from jsonb_array_elements_text(coalesce(bc.localities, '[]'::jsonb)) ln
              where lower(trim(ln)) = lower(normalized_locality)
          )
    )
    on conflict (tenant_id, slug) do nothing;

    return new;
end;
$$;

-- Backfill: create specific channels for existing accepted stream items
-- that don't already have a matching specific channel
insert into broker_channels (
    tenant_id, created_by, name, slug, channel_type,
    localities, keywords_include, keywords_exclude,
    deal_types, record_types, bhk_values, asset_classes,
    budget_min, budget_max, confidence_min,
    pinned, is_active, created_at, updated_at
)
select
    s.tenant_id,
    s.tenant_id,
    case
        when lower(coalesce(s.asset_class, '')) in ('residential', 'commercial')
            then public.normalize_locality_value(s.locality) || ' ' || initcap(lower(s.asset_class))
        else public.normalize_locality_value(s.locality)
    end,
    case
        when lower(coalesce(s.asset_class, '')) in ('residential', 'commercial')
            then public.slugify_locality_value(public.normalize_locality_value(s.locality)) || '-' || lower(s.asset_class)
        else public.slugify_locality_value(public.normalize_locality_value(s.locality)) || '-' || lower(s.record_type) || 's'
    end,
    case when lower(s.record_type) = 'requirement' then 'requirement' else 'listing' end,
    jsonb_build_array(public.normalize_locality_value(s.locality)),
    '[]'::jsonb, '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(lower(s.record_type)),
    '[]'::jsonb,
    case when lower(coalesce(s.asset_class, '')) in ('residential', 'commercial')
        then jsonb_build_array(initcap(lower(s.asset_class)))
        else '[]'::jsonb
    end,
    null, null, 0,
    true, true, now(), now()
from (
    select distinct
        s.tenant_id,
        s.locality,
        s.record_type,
        s.asset_class
    from stream_items s
    where s.tenant_id is not null
      and lower(coalesce(s.ingestion_status, 'accepted')) = 'accepted'
      and lower(coalesce(s.record_type, '')) in ('listing', 'requirement')
      and public.normalize_locality_value(s.locality) is not null
      and lower(public.normalize_locality_value(s.locality)) not in ('mumbai market', 'mumbai', 'navi mumbai', 'thane', 'pune')
) as s
where not exists (
    select 1
    from broker_channels existing
    where existing.tenant_id = s.tenant_id
      and existing.is_active = true
      and exists (
          select 1
          from jsonb_array_elements_text(coalesce(existing.localities, '[]'::jsonb)) ln
          where lower(trim(ln)) = lower(public.normalize_locality_value(s.locality))
      )
      and exists (
          select 1
          from jsonb_array_elements_text(coalesce(existing.record_types, '[]'::jsonb)) rt
          where lower(trim(rt)) = lower(s.record_type)
      )
      and (
          lower(coalesce(s.asset_class, '')) not in ('residential', 'commercial')
          or exists (
              select 1
              from jsonb_array_elements_text(coalesce(existing.asset_classes, '[]'::jsonb)) ac
              where lower(trim(ac)) = lower(s.asset_class)
          )
      )
)
on conflict (tenant_id, slug) do nothing;

-- Also ensure broad locality-only channels exist for all distinct localities
-- that don't already have one
insert into broker_channels (
    tenant_id, created_by, name, slug, channel_type,
    localities, keywords_include, keywords_exclude,
    deal_types, record_types, bhk_values, asset_classes,
    budget_min, budget_max, confidence_min,
    pinned, is_active, created_at, updated_at
)
select
    seeded.tenant_id,
    seeded.tenant_id,
    seeded.locality_name,
    seeded.locality_slug,
    'mixed',
    jsonb_build_array(seeded.locality_name),
    '[]'::jsonb, '[]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    null, null, 0,
    true, true, now(), now()
from (
    select distinct
        s.tenant_id,
        public.normalize_locality_value(s.locality) as locality_name,
        public.slugify_locality_value(public.normalize_locality_value(s.locality)) as locality_slug
    from stream_items s
    where s.tenant_id is not null
      and lower(coalesce(s.ingestion_status, 'accepted')) = 'accepted'
      and public.normalize_locality_value(s.locality) is not null
      and lower(public.normalize_locality_value(s.locality)) not in ('mumbai market', 'mumbai', 'navi mumbai', 'thane', 'pune')
) as seeded
where not exists (
    select 1
    from broker_channels existing
    where existing.tenant_id = seeded.tenant_id
      and existing.is_active = true
      and existing.slug = seeded.locality_slug
)
on conflict (tenant_id, slug) do nothing;
