-- Enable pgvector extension
create extension if not exists vector with schema public;

-- Add embedding column to stream_items (384-dim for all-MiniLM-L6-v2)
alter table public.stream_items
    add column if not exists embedding vector(384);

-- Create index for cosine similarity search
create index if not exists idx_stream_items_embedding
    on public.stream_items
    using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 64);

-- Match function: find similar listings by vector similarity
create or replace function match_listings(
    query_embedding vector(384),
    match_threshold float default 0.7,
    match_count int default 10,
    p_tenant_id uuid default null,
    p_locality text default null,
    p_bhk text default null,
    p_type text default null
)
returns table (
    id uuid,
    tenant_id uuid,
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
      and (p_locality is null or si.locality ilike '%' || p_locality || '%')
      and (p_bhk is null or si.bhk = p_bhk)
      and (p_type is null or si.type ilike p_type)
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
    bhk text,
    type text,
    listing_count bigint,
    avg_price_numeric numeric,
    min_price_numeric numeric,
    max_price_numeric numeric,
    avg_area_sqft numeric
)
language plpgsql
as $$
begin
    return query
    select
        si.locality,
        si.bhk,
        si.type,
        count(*)::bigint as listing_count,
        avg(si.price_numeric) as avg_price_numeric,
        min(si.price_numeric) as min_price_numeric,
        max(si.price_numeric) as max_price_numeric,
        avg(si.area_sqft) as avg_area_sqft
    from stream_items si
    where si.created_at >= now() - (p_days || ' days')::interval
      and si.price_numeric is not null
      and si.locality is not null
      and (p_locality is null or si.locality ilike '%' || p_locality || '%')
    group by si.locality, si.bhk, si.type
    having count(*) > 1
    order by si.locality, si.bhk;
end;
$$;
