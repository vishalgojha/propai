alter table public.whatsapp_sessions
  add column if not exists session_id text,
  add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());

alter table public.whatsapp_sessions
  alter column session_data set default '{}'::jsonb,
  alter column session_data drop not null;

update public.whatsapp_sessions
set session_id = coalesce(session_id, label, 'Owner'),
    updated_at = coalesce(updated_at, last_sync, timezone('utc'::text, now()))
where session_id is null or updated_at is null;

drop index if exists public.whatsapp_sessions_tenant_session_unique;
create unique index if not exists whatsapp_sessions_tenant_session_unique
  on public.whatsapp_sessions (tenant_id, session_id)
  nulls not distinct;
