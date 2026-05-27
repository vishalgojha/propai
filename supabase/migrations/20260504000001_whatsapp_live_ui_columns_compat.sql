alter table public.whatsapp_sessions
  add column if not exists creds jsonb,
  add column if not exists qr_code text,
  add column if not exists pairing_code text;

create unique index if not exists whatsapp_sessions_label_unique
  on public.whatsapp_sessions (label);

create unique index if not exists whatsapp_sessions_tenant_label_unique
  on public.whatsapp_sessions (tenant_id, label);

alter table public.whatsapp_ingestion_health
  add column if not exists connected_at timestamptz,
  add column if not exists disconnected_at timestamptz,
  add column if not exists last_qr_at timestamptz,
  add column if not exists session_id text,
  add column if not exists label text;
