create table if not exists whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  session_label text,
  group_jid text not null,
  group_name text not null,
  normalized_name text not null,
  locality text,
  city text,
  category text default 'other',
  tags text[] default '{}',
  member_count integer default 0,
  last_active_at timestamptz,
  broadcast_enabled boolean default true,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, group_jid)
);

create index if not exists idx_whatsapp_groups_tenant_name on whatsapp_groups(tenant_id, normalized_name);
create index if not exists idx_whatsapp_groups_tenant_locality on whatsapp_groups(tenant_id, locality);
create index if not exists idx_whatsapp_groups_tenant_category on whatsapp_groups(tenant_id, category);
create index if not exists idx_whatsapp_groups_tenant_enabled on whatsapp_groups(tenant_id, broadcast_enabled, is_archived);
