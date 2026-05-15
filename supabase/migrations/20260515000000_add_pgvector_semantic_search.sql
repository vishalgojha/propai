-- Enable pgvector extension
create extension if not exists vector with schema public;

-- Add embedding column to stream_items (768-dim for nomic-embed-text)
alter table public.stream_items
    add column if not exists embedding vector(768);

-- Create index for cosine similarity search
create index if not exists idx_stream_items_embedding
    on public.stream_items
    using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 200);

-- Match function: find similar listings by vector similarity
create or replace function match_listings(
    query_embedding vector(768),
    match_threshold float default 0.7,
    match_count int default 10,
    p_tenant_id uuid default null,
    p_locality text default null,
    p_bhk text default null,
    p_type text default null
)
returns table (
    id bigint,
    tenant_id uuid,
    message_id text,
    locality text,
    bhk text,
    price_numeric numeric,
    price_label text,
    type text,
    raw_text text,
    similarity float
)
language plpgsql
as $$
begin
    return query
    select
        si.id,
        si.tenant_id,
        si.message_id,
        si.locality,
        si.bhk,
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
      and (p_bhk is null or si.bhk = p_bhk)
      and (p_type is null or si.type = p_type)
    order by si.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- Market stats function: price analytics by locality
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
    bhk_distribution jsonb,
    type_distribution jsonb
)
language plpgsql
as $$
begin
    return query
    select
        si.locality,
        avg(si.price_numeric) as avg_price,
        min(si.price_numeric) as min_price,
        max(si.price_numeric) as max_price,
        count(*)::bigint as listing_count,
        coalesce(
            (select jsonb_object_agg(bhk, cnt) from (
                select si2.bhk, count(*) as cnt
                from stream_items si2
                where si2.locality = si.locality
                  and si2.created_at >= now() - (p_days || ' days')::interval
                group by si2.bhk
            ) t),
            '{}'::jsonb
        ) as bhk_distribution,
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
    group by si.locality
    order by si.locality;
end;
$$;
