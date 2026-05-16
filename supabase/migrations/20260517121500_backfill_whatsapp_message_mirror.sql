alter table if exists public.whatsapp_message_mirror
    alter column message_key set default md5(random()::text || clock_timestamp()::text);

create unique index if not exists idx_whatsapp_message_mirror_tenant_message_key
    on public.whatsapp_message_mirror (tenant_id, message_key);

insert into public.whatsapp_message_mirror (
    tenant_id,
    session_label,
    message_key,
    remote_jid,
    chat_type,
    sender_jid,
    sender_name,
    text,
    timestamp,
    direction,
    message_type,
    is_revoked,
    raw_payload,
    created_at,
    updated_at
)
select
    m.tenant_id,
    null,
    'legacy:' || md5(
        coalesce(m.tenant_id::text, '') || '|' ||
        coalesce(m.remote_jid, '') || '|' ||
        coalesce(m.sender, '') || '|' ||
        coalesce(m.text, '') || '|' ||
        coalesce(m.timestamp::text, '')
    ),
    m.remote_jid,
    case when m.remote_jid like '%@g.us' then 'group' else 'direct' end,
    null,
    m.sender,
    coalesce(m.text, ''),
    m.timestamp,
    case
        when lower(coalesce(m.sender, '')) = 'ai'
            or coalesce(m.sender, '') like '%@%'
            or lower(coalesce(m.sender, '')) like '%broker%'
            or lower(coalesce(m.sender, '')) like '%workspace%'
        then 'outbound'
        else 'inbound'
    end,
    'text',
    coalesce(m.is_revoked, false),
    null,
    coalesce(m.created_at, now()),
    now()
from public.messages m
on conflict (tenant_id, message_key) do nothing;
