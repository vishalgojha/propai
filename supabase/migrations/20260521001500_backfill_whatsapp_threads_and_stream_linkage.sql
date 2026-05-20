alter table if exists public.messages
  add column if not exists session_label text;

create index if not exists idx_messages_tenant_session_timestamp
  on public.messages (tenant_id, session_label, "timestamp" desc);

alter table if exists public.stream_items
  add column if not exists session_label text,
  add column if not exists source_thread_jid text;

create index if not exists idx_stream_items_tenant_session_created
  on public.stream_items (tenant_id, session_label, created_at desc);

create index if not exists idx_stream_items_tenant_thread_created
  on public.stream_items (tenant_id, source_thread_jid, created_at desc);

update public.messages m
set session_label = coalesce(
  m.session_label,
  wg.session_label,
  'workspace'
)
from public.whatsapp_groups wg
where m.session_label is null
  and m.remote_jid = wg.group_jid
  and m.tenant_id = wg.tenant_id;

update public.messages
set session_label = 'workspace'
where session_label is null;

insert into public.whatsapp_threads (
  tenant_id,
  session_label,
  remote_jid,
  chat_type,
  title,
  preview,
  phone_number,
  message_count,
  inbound_count,
  outbound_count,
  last_message_at,
  last_inbound_at,
  last_outbound_at,
  last_sender,
  created_at,
  updated_at
)
with message_base as (
  select
    m.tenant_id,
    coalesce(m.session_label, 'workspace') as session_label,
    m.remote_jid,
    m.sender,
    coalesce(m.text, '') as text,
    m."timestamp",
    coalesce(m.created_at, now()) as created_at,
    case
      when m.remote_jid like '%@g.us' then 'group'
      else 'direct'
    end as chat_type,
    case
      when m.remote_jid like '%@g.us' then 'WhatsApp group'
      when lower(coalesce(m.sender, '')) = 'ai'
        or lower(coalesce(m.sender, '')) = 'propai ai'
        or coalesce(m.sender, '') like '%@%'
        or lower(coalesce(m.sender, '')) like '%broker%'
        or lower(coalesce(m.sender, '')) like '%workspace%'
      then
        case
          when split_part(split_part(m.remote_jid, '@', 1), ':', 1) ~ '^[0-9]{10,}$'
          then '+' || split_part(split_part(m.remote_jid, '@', 1), ':', 1)
          else 'Direct contact'
        end
      else coalesce(nullif(trim(m.sender), ''), 'Direct contact')
    end as derived_title,
    case
      when m.remote_jid like '%@g.us' then null
      when split_part(split_part(m.remote_jid, '@', 1), ':', 1) ~ '^[0-9]{10,}$'
      then split_part(split_part(m.remote_jid, '@', 1), ':', 1)
      else null
    end as phone_number,
    case
      when lower(coalesce(m.sender, '')) = 'ai'
        or lower(coalesce(m.sender, '')) = 'propai ai'
        or coalesce(m.sender, '') like '%@%'
        or lower(coalesce(m.sender, '')) like '%broker%'
        or lower(coalesce(m.sender, '')) like '%workspace%'
      then true
      else false
    end as is_outbound
  from public.messages m
),
last_message as (
  select distinct on (tenant_id, session_label, remote_jid)
    tenant_id,
    session_label,
    remote_jid,
    text,
    sender,
    "timestamp",
    derived_title,
    chat_type,
    phone_number
  from message_base
  order by tenant_id, session_label, remote_jid, "timestamp" desc, created_at desc
),
aggregated as (
  select
    tenant_id,
    session_label,
    remote_jid,
    max(chat_type) as chat_type,
    count(*)::integer as message_count,
    count(*) filter (where not is_outbound)::integer as inbound_count,
    count(*) filter (where is_outbound)::integer as outbound_count,
    max("timestamp") as last_message_at,
    max("timestamp") filter (where not is_outbound) as last_inbound_at,
    max("timestamp") filter (where is_outbound) as last_outbound_at,
    min(created_at) as created_at
  from message_base
  group by tenant_id, session_label, remote_jid
)
select
  a.tenant_id,
  a.session_label,
  a.remote_jid,
  a.chat_type,
  lm.derived_title,
  nullif(lm.text, '') as preview,
  lm.phone_number,
  a.message_count,
  a.inbound_count,
  a.outbound_count,
  a.last_message_at,
  a.last_inbound_at,
  a.last_outbound_at,
  lm.sender,
  a.created_at,
  now()
from aggregated a
join last_message lm
  on lm.tenant_id = a.tenant_id
 and lm.session_label = a.session_label
 and lm.remote_jid = a.remote_jid
on conflict (tenant_id, session_label, remote_jid) do update
set
  chat_type = excluded.chat_type,
  title = coalesce(public.whatsapp_threads.title, excluded.title),
  preview = excluded.preview,
  phone_number = coalesce(public.whatsapp_threads.phone_number, excluded.phone_number),
  message_count = greatest(public.whatsapp_threads.message_count, excluded.message_count),
  inbound_count = greatest(public.whatsapp_threads.inbound_count, excluded.inbound_count),
  outbound_count = greatest(public.whatsapp_threads.outbound_count, excluded.outbound_count),
  last_message_at = greatest(public.whatsapp_threads.last_message_at, excluded.last_message_at),
  last_inbound_at = greatest(public.whatsapp_threads.last_inbound_at, excluded.last_inbound_at),
  last_outbound_at = greatest(public.whatsapp_threads.last_outbound_at, excluded.last_outbound_at),
  last_sender = excluded.last_sender,
  updated_at = now();

update public.stream_items
set source_thread_jid = coalesce(source_thread_jid, source_group_id)
where source_thread_jid is null
  and source_group_id is not null;

update public.stream_items si
set session_label = coalesce(
  si.session_label,
  (
    select wg.session_label
    from public.whatsapp_groups wg
    where wg.tenant_id = si.tenant_id
      and wg.group_jid = si.source_group_id
    limit 1
  ),
  (
    select wt.session_label
    from public.whatsapp_threads wt
    where wt.tenant_id = si.tenant_id
      and wt.remote_jid = coalesce(si.source_thread_jid, si.source_group_id)
    order by wt.last_message_at desc nulls last
    limit 1
  ),
  'workspace'
)
where si.session_label is null;

update public.stream_items
set session_label = coalesce(session_label, 'workspace')
where session_label is null;
