-- Fix Security Advisor warnings
-- 1. Set search_path = public on all functions with mutable search paths
-- 2. Revoke public execute on invoke_worker_function (SECURITY DEFINER)

-- Fix functions that exist in migrations: recreate with SET search_path
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
    id uuid,
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
set search_path = public
as $$
begin
    return query
    select
        si.id::uuid,
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
set search_path = public
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

create or replace function public.invoke_worker_function(function_name text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id bigint;
  project_url text := null;
  anon_key text := null;
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'vault'
  ) then
    select decrypted_secret
      into project_url
    from vault.decrypted_secrets
    where name = 'project_url'
    limit 1;

    select decrypted_secret
      into anon_key
    from vault.decrypted_secrets
    where name = 'anon_key'
    limit 1;
  end if;

  if project_url is null or anon_key is null then
    raise exception 'Vault secrets project_url and anon_key must be configured';
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := payload,
    timeout_milliseconds := 5000
  ) into request_id;

  return request_id;
end;
$$;

-- Fix invoke_worker_function: restrict to authenticated role
-- (SECURITY DEFINER should not be callable by public/anonymous users)
revoke execute on function public.invoke_worker_function(text, jsonb) from public, anon;
grant execute on function public.invoke_worker_function(text, jsonb) to authenticated;

-- Fix functions not tracked in migrations:
-- Dynamically alter set search_path on any functions the advisor flagged
do $$
declare
  func_oid oid;
  func_sig text;
begin
  for func_oid, func_sig in
    select p.oid, p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updated_at', 'sync_profiles_app_role_from_is_admin')
  loop
    execute 'alter function ' || func_sig || ' set search_path = public';
  end loop;
end;
$$;
