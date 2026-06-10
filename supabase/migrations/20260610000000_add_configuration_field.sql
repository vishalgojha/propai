-- Replace residential-only "bhk" terminology with broker-facing "configuration".
-- Keep legacy columns during the app transition, but make configuration canonical.

alter table public.stream_items
    add column if not exists configuration text;

alter table public.stream_items_residential
    add column if not exists configuration text;

alter table public.stream_items_commercial
    add column if not exists configuration text;

alter table public.canonical_records
    add column if not exists configuration text;

alter table public.wa_click_events
    add column if not exists configuration text;

alter table public.broker_channels
    add column if not exists configuration_values jsonb not null default '[]'::jsonb;

update public.stream_items
set configuration = coalesce(configuration, bhk)
where configuration is null and bhk is not null;

update public.stream_items_residential
set configuration = coalesce(configuration, bhk)
where configuration is null and bhk is not null;

update public.stream_items_commercial
set configuration = coalesce(configuration, bhk)
where configuration is null and bhk is not null;

update public.canonical_records
set configuration = coalesce(configuration, bhk)
where configuration is null and bhk is not null;

update public.wa_click_events
set configuration = coalesce(configuration, bhk)
where configuration is null and bhk is not null;

update public.broker_channels
set configuration_values = coalesce(configuration_values, bhk_values, '[]'::jsonb)
where configuration_values = '[]'::jsonb
  and coalesce(bhk_values, '[]'::jsonb) <> '[]'::jsonb;

create index if not exists idx_stream_items_configuration
    on public.stream_items (tenant_id, configuration);

create index if not exists idx_stream_items_res_configuration
    on public.stream_items_residential (tenant_id, configuration);

create index if not exists idx_stream_items_com_configuration
    on public.stream_items_commercial (tenant_id, configuration);

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
        coalesce(si.configuration, si.bhk) as configuration,
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
      and (p_configuration is null or coalesce(si.configuration, si.bhk) = p_configuration)
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
            (select jsonb_object_agg(configuration, cnt) from (
                select coalesce(si2.configuration, si2.bhk) as configuration, count(*) as cnt
                from stream_items si2
                where si2.locality = si.locality
                  and si2.created_at >= now() - (p_days || ' days')::interval
                  and coalesce(si2.configuration, si2.bhk) is not null
                group by coalesce(si2.configuration, si2.bhk)
            ) t),
            '{}'::jsonb
        ) as configuration_distribution,
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
    group by si.locality;
end;
$func$;

notify pgrst, 'reload schema';
