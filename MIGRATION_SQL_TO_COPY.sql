-- Run this in Supabase Dashboard SQL Editor
-- https://supabase.com/dashboard/project/mnqkcctegpqxjvgdgakf/sql/new

-- Step 1: Clean duplicate migrations
DELETE FROM supabase_migrations.schema_migrations 
WHERE ctid NOT IN (
    SELECT MIN(ctid) FROM supabase_migrations.schema_migrations GROUP BY version
);

-- Step 2: Add commercial columns
alter table stream_items_commercial
    add column if not exists commercial_type text,
    add column if not exists fitout_status text,
    add column if not exists workstations_count integer,
    add column if not exists cabins_count integer;

create index if not exists idx_stream_com_commercial_type on stream_items_commercial (commercial_type);
create index if not exists idx_stream_com_fitout_status on stream_items_commercial (fitout_status);

-- Step 3: Enable fuzzy matching
create extension if not exists pg_trgm;

-- Step 4: Search reference table
create table if not exists search_reference (
    id uuid primary key default gen_random_uuid(),
    term text not null,
    term_type text not null check (term_type in ('locality', 'building', 'project', 'landmark')),
    standard_form text not null,
    city text default 'Mumbai',
    popularity integer default 0,
    created_at timestamptz not null default now(),
    unique (term, term_type, city)
);

create index if not exists idx_search_reference_trgm on search_reference using gin (term gin_trgm_ops);
create index if not exists idx_search_reference_type on search_reference (term_type, city);

-- Step 5: Seed data
insert into search_reference (term, term_type, standard_form, city, popularity)
select lower(locality), 'locality', max(locality), coalesce(city, 'Mumbai'), count(*)
from stream_items_residential where locality is not null and length(locality) > 2
group by lower(locality), city on conflict (term, term_type, city) do update set popularity = excluded.popularity;

insert into search_reference (term, term_type, standard_form, city, popularity)
select lower(locality), 'locality', max(locality), coalesce(city, 'Mumbai'), count(*)
from stream_items_commercial where locality is not null and length(locality) > 2
group by lower(locality), city on conflict (term, term_type, city) do update set popularity = excluded.popularity;

insert into search_reference (term, term_type, standard_form, city, popularity)
select lower(building_name), 'building', max(building_name), 'Mumbai', count(*)
from stream_items_residential where building_name is not null and length(building_name) > 2
group by lower(building_name) on conflict (term, term_type, city) do update set popularity = excluded.popularity;

insert into search_reference (term, term_type, standard_form, city, popularity)
select lower(building_name), 'building', max(building_name), 'Mumbai', count(*)
from stream_items_commercial where building_name is not null and length(building_name) > 2
group by lower(building_name) on conflict (term, term_type, city) do update set popularity = excluded.popularity;

-- Step 6: Fuzzy search function
create or replace function fuzzy_search_suggestions(search_term text, min_similarity float default 0.3, max_results integer default 3)
returns table (suggestion text, term_type text, similarity_score float) as $$
begin
    return query select sr.standard_form, sr.term_type, similarity(search_term, sr.term) as sim
    from search_reference sr where similarity(search_term, sr.term) > min_similarity
    order by similarity(search_term, sr.term) desc, sr.popularity desc limit max_results;
end;
$$ language plpgsql;

-- Step 7: Sync triggers
create or replace function sync_search_reference_res() returns trigger as $$
begin
    if new.locality is not null and length(new.locality) > 2 then
        insert into search_reference (term, term_type, standard_form, city, popularity)
        values (lower(new.locality), 'locality', new.locality, coalesce(new.city, 'Mumbai'), 1)
        on conflict (term, term_type, city) do update set popularity = search_reference.popularity + 1;
    end if;
    if new.building_name is not null and length(new.building_name) > 2 then
        insert into search_reference (term, term_type, standard_form, city, popularity)
        values (lower(new.building_name), 'building', new.building_name, 'Mumbai', 1)
        on conflict (term, term_type, city) do update set popularity = search_reference.popularity + 1;
    end if;
    return new;
end;
$$ language plpgsql;

create or replace function sync_search_reference_com() returns trigger as $$
begin
    if new.locality is not null and length(new.locality) > 2 then
        insert into search_reference (term, term_type, standard_form, city, popularity)
        values (lower(new.locality), 'locality', new.locality, coalesce(new.city, 'Mumbai'), 1)
        on conflict (term, term_type, city) do update set popularity = search_reference.popularity + 1;
    end if;
    if new.building_name is not null and length(new.building_name) > 2 then
        insert into search_reference (term, term_type, standard_form, city, popularity)
        values (lower(new.building_name), 'building', new.building_name, 'Mumbai', 1)
        on conflict (term, term_type, city) do update set popularity = search_reference.popularity + 1;
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_sync_search_ref_res on stream_items_residential;
create trigger trigger_sync_search_ref_res after insert on stream_items_residential for each row execute function sync_search_reference_res();

drop trigger if exists trigger_sync_search_ref_com on stream_items_commercial;
create trigger trigger_sync_search_ref_com after insert on stream_items_commercial for each row execute function sync_search_reference_com();
