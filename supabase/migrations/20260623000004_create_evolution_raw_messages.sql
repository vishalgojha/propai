create table if not exists evolution_raw_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  session_label text,
  remote_jid text not null,
  sender text,
  text_content text,
  raw_payload jsonb default '{}',
  message_id text,
  source_group_jid text,
  source_group_name text,
  sender_jid text,
  is_parsed boolean default false,
  parse_attempts integer default 0,
  last_parse_error text,
  parsed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_evolution_raw_messages_unparsed
  on evolution_raw_messages(tenant_id, is_parsed, created_at)
  where is_parsed = false;

create index if not exists idx_evolution_raw_messages_group
  on evolution_raw_messages(tenant_id, source_group_jid, created_at desc);
