alter table if exists public.profiles
  add column if not exists history_total_count integer;

update public.profiles
set history_total_count = coalesce(history_total_count, 0)
where history_total_count is null;

alter table if exists public.profiles
  alter column history_total_count set default 0;
