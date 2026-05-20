create table if not exists public.whatsapp_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  session_label text not null default 'workspace',
  remote_jid text not null,
  chat_type text not null default 'direct',
  title text,
  preview text,
  phone_number text,
  message_count integer not null default 0,
  inbound_count integer not null default 0,
  outbound_count integer not null default 0,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_sender text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, session_label, remote_jid)
);

create index if not exists idx_whatsapp_threads_tenant_session_last_message
  on public.whatsapp_threads (tenant_id, session_label, last_message_at desc);

create index if not exists idx_whatsapp_threads_tenant_chat_type
  on public.whatsapp_threads (tenant_id, chat_type);

create index if not exists idx_whatsapp_threads_tenant_phone
  on public.whatsapp_threads (tenant_id, phone_number);
