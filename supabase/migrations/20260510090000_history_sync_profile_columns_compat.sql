alter table if exists public.profiles
  add column if not exists history_processed boolean,
  add column if not exists history_processed_at timestamptz,
  add column if not exists history_message_count integer,
  add column if not exists history_total_count integer;

update public.profiles
set
  history_processed = coalesce(history_processed, false),
  history_message_count = coalesce(history_message_count, 0),
  history_total_count = coalesce(history_total_count, 0)
where
  history_processed is null
  or history_message_count is null
  or history_total_count is null;

alter table if exists public.profiles
  alter column history_processed set default false,
  alter column history_message_count set default 0,
  alter column history_total_count set default 0;
