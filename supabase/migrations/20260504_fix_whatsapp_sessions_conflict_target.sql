update public.whatsapp_sessions
set session_id = coalesce(session_id, label, 'Owner')
where session_id is null;

drop index if exists public.whatsapp_sessions_tenant_session_unique;

create unique index if not exists whatsapp_sessions_tenant_session_unique
  on public.whatsapp_sessions (tenant_id, session_id)
  nulls not distinct;

drop index if exists public.whatsapp_sessions_tenant_unique;
