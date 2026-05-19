create table if not exists public.wabro_message_status_events (
  event_id text primary key,
  tenant_id uuid not null,
  session_label text,
  message_id text not null,
  chat_id text not null,
  state text not null,
  status_timestamp timestamptz not null,
  error_code text,
  error_message text,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists wabro_message_status_events_tenant_message_idx
  on public.wabro_message_status_events (tenant_id, message_id, status_timestamp desc);

create index if not exists wabro_message_status_events_tenant_chat_idx
  on public.wabro_message_status_events (tenant_id, chat_id, status_timestamp desc);
