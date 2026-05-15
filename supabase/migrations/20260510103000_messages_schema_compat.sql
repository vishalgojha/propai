alter table if exists public.messages
  add column if not exists created_at timestamptz default timezone('utc'::text, now());

update public.messages
set created_at = coalesce(created_at, "timestamp")
where created_at is null;

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.messages'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%sender%';

  if constraint_name is not null then
    execute format('alter table public.messages drop constraint %I', constraint_name);
  end if;
end $$;
