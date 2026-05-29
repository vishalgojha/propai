create or replace function public.normalize_locality_value(value text)
returns text
language sql
immutable
as $$
    select nullif(
        trim(
            regexp_replace(
                split_part(coalesce(value, ''), ',', 1),
                '\s+',
                ' ',
                'g'
            )
        ),
        ''
    );
$$;

create or replace function public.slugify_locality_value(value text)
returns text
language sql
immutable
as $$
    select nullif(
        regexp_replace(
            regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'),
            '(^-+|-+$)',
            '',
            'g'
        ),
        ''
    );
$$;

create or replace function public.seed_locality_channel_from_stream_item()
returns trigger
language plpgsql
as $$
declare
    normalized_locality text;
    locality_slug text;
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

    if exists (
        select 1
        from broker_channels bc
        where bc.tenant_id = new.tenant_id
          and bc.is_active = true
          and exists (
              select 1
              from jsonb_array_elements_text(coalesce(bc.localities, '[]'::jsonb)) locality_name
              where lower(trim(locality_name)) = lower(normalized_locality)
          )
    ) then
        return new;
    end if;

    locality_slug := public.slugify_locality_value(normalized_locality);
    if locality_slug is null then
        return new;
    end if;

    insert into broker_channels (
        tenant_id,
        created_by,
        name,
        slug,
        channel_type,
        localities,
        keywords_include,
        keywords_exclude,
        deal_types,
        record_types,
        bhk_values,
        asset_classes,
        budget_min,
        budget_max,
        confidence_min,
        pinned,
        is_active,
        created_at,
        updated_at
    ) values (
        new.tenant_id,
        new.tenant_id,
        normalized_locality,
        locality_slug,
        'mixed',
        jsonb_build_array(normalized_locality),
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        null,
        null,
        0,
        true,
        true,
        now(),
        now()
    )
    on conflict (tenant_id, slug) do nothing;

    return new;
end;
$$;

drop trigger if exists trigger_seed_locality_channel_on_stream_item on public.stream_items;
create trigger trigger_seed_locality_channel_on_stream_item
after insert on public.stream_items
for each row
execute function public.seed_locality_channel_from_stream_item();

insert into broker_channels (
    tenant_id,
    created_by,
    name,
    slug,
    channel_type,
    localities,
    keywords_include,
    keywords_exclude,
    deal_types,
    record_types,
    bhk_values,
    asset_classes,
    budget_min,
    budget_max,
    confidence_min,
    pinned,
    is_active,
    created_at,
    updated_at
)
select
    seeded.tenant_id,
    seeded.tenant_id,
    seeded.locality_name,
    seeded.locality_slug,
    'mixed',
    jsonb_build_array(seeded.locality_name),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    null,
    null,
    0,
    true,
    true,
    now(),
    now()
from (
    select distinct
        s.tenant_id,
        public.normalize_locality_value(s.locality) as locality_name,
        public.slugify_locality_value(public.normalize_locality_value(s.locality)) as locality_slug
    from public.stream_items s
    where s.tenant_id is not null
      and lower(coalesce(s.ingestion_status, 'accepted')) = 'accepted'
      and lower(coalesce(s.record_type, '')) in ('listing', 'requirement')
) as seeded
where seeded.locality_name is not null
  and seeded.locality_slug is not null
  and lower(seeded.locality_name) not in ('mumbai market', 'mumbai', 'navi mumbai', 'thane', 'pune')
  and not exists (
      select 1
      from broker_channels existing
      where existing.tenant_id = seeded.tenant_id
        and existing.is_active = true
        and exists (
            select 1
            from jsonb_array_elements_text(coalesce(existing.localities, '[]'::jsonb)) locality_name
            where lower(trim(locality_name)) = lower(seeded.locality_name)
        )
  )
on conflict (tenant_id, slug) do nothing;
