create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.conversations
  add column if not exists session_id uuid references public.chat_sessions(id) on delete set null;

create index if not exists idx_chat_sessions_user_updated
  on public.chat_sessions(user_id, updated_at desc);

create index if not exists idx_conversations_session_id
  on public.conversations(session_id);

alter table public.chat_sessions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_sessions'
      and policyname = 'chat_sessions_select_own'
  ) then
    create policy chat_sessions_select_own
      on public.chat_sessions
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_sessions'
      and policyname = 'chat_sessions_insert_own'
  ) then
    create policy chat_sessions_insert_own
      on public.chat_sessions
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_sessions'
      and policyname = 'chat_sessions_update_own'
  ) then
    create policy chat_sessions_update_own
      on public.chat_sessions
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_sessions'
      and policyname = 'chat_sessions_delete_own'
  ) then
    create policy chat_sessions_delete_own
      on public.chat_sessions
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.set_chat_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_chat_sessions_updated_at on public.chat_sessions;
create trigger set_chat_sessions_updated_at
before update on public.chat_sessions
for each row
execute function public.set_chat_sessions_updated_at();
