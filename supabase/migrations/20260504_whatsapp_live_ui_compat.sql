create unique index if not exists whatsapp_sessions_session_id_unique
  on public.whatsapp_sessions (session_id);

create table if not exists public.whatsapp_ingestion_health (
  tenant_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'unknown',
  last_event_at timestamptz,
  last_error text,
  processed_count bigint not null default 0,
  failed_count bigint not null default 0,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.whatsapp_event_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.profiles(id) on delete cascade,
  session_id text,
  event_type text not null,
  level text not null default 'info',
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists whatsapp_event_logs_tenant_created_idx
  on public.whatsapp_event_logs (tenant_id, created_at desc);

create index if not exists whatsapp_event_logs_session_created_idx
  on public.whatsapp_event_logs (session_id, created_at desc);

alter table public.whatsapp_ingestion_health enable row level security;
alter table public.whatsapp_event_logs enable row level security;

drop policy if exists whatsapp_ingestion_health_select_own on public.whatsapp_ingestion_health;
create policy whatsapp_ingestion_health_select_own
  on public.whatsapp_ingestion_health
  for select
  using ((select auth.uid()) = tenant_id);

drop policy if exists whatsapp_event_logs_select_own on public.whatsapp_event_logs;
create policy whatsapp_event_logs_select_own
  on public.whatsapp_event_logs
  for select
  using ((select auth.uid()) = tenant_id);
