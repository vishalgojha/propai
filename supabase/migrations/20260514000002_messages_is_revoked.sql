alter table if exists public.messages
  add column if not exists is_revoked boolean not null default false;

drop index if exists idx_messages_tenant_id;
create index if not exists idx_messages_tenant_created
  on public.messages (tenant_id, created_at desc);

drop index if exists idx_messages_tenant_revoked;
create index if not exists idx_messages_tenant_revoked
  on public.messages (tenant_id, is_revoked) where is_revoked = true;