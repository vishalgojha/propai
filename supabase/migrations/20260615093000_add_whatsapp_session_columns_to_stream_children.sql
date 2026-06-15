-- The parser writes directly to the split stream child tables, while the
-- WhatsApp session/thread linkage migration only added these columns to the
-- legacy parent stream_items table. Keep the child tables aligned so live
-- WhatsApp parsing can persist rows and the dashboard can scope by session.

alter table if exists public.stream_items_residential
  add column if not exists session_label text,
  add column if not exists source_thread_jid text;

alter table if exists public.stream_items_commercial
  add column if not exists session_label text,
  add column if not exists source_thread_jid text;

update public.stream_items_residential
set session_label = coalesce(session_label, 'workspace'),
    source_thread_jid = coalesce(source_thread_jid, source_group_id)
where session_label is null
   or (source_thread_jid is null and source_group_id is not null);

update public.stream_items_commercial
set session_label = coalesce(session_label, 'workspace'),
    source_thread_jid = coalesce(source_thread_jid, source_group_id)
where session_label is null
   or (source_thread_jid is null and source_group_id is not null);

create index if not exists idx_stream_res_tenant_session_created
  on public.stream_items_residential (tenant_id, session_label, created_at desc);

create index if not exists idx_stream_com_tenant_session_created
  on public.stream_items_commercial (tenant_id, session_label, created_at desc);

create index if not exists idx_stream_res_tenant_thread_created
  on public.stream_items_residential (tenant_id, source_thread_jid, created_at desc);

create index if not exists idx_stream_com_tenant_thread_created
  on public.stream_items_commercial (tenant_id, source_thread_jid, created_at desc);
