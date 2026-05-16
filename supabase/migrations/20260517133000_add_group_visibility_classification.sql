alter table if exists public.whatsapp_groups
    add column if not exists classification text not null default 'unknown';

alter table if exists public.whatsapp_groups
    add column if not exists visibility_status text not null default 'visible';

alter table if exists public.whatsapp_groups
    add column if not exists business_confidence integer not null default 0;

update public.whatsapp_groups
set classification = case
        when lower(coalesce(group_name, '')) ~ '\\m(family|friends|school|college|personal|trip|birthday|crypto|memes|sports|gaming|music|movie|travel|food|health|parents|alumni|batch|wedding)\\M' then 'personal'
        when lower(coalesce(group_name, '')) ~ '\\m(broker|realtor|realty|estate|inventory|requirement|rent|sale|commercial|property|flat|apartment|villa|plot|bhk|buyers|seller)\\M' then 'business'
        else 'unknown'
    end,
    visibility_status = case
        when lower(coalesce(group_name, '')) ~ '\\m(broker|realtor|realty|estate|inventory|requirement|rent|sale|commercial|property|flat|apartment|villa|plot|bhk|buyers|seller)\\M' then 'visible'
        else 'hidden'
    end,
    business_confidence = case
        when lower(coalesce(group_name, '')) ~ '\\m(broker|realtor|realty|estate|inventory|requirement|rent|sale|commercial|property|flat|apartment|villa|plot|bhk|buyers|seller)\\M' then 75
        when lower(coalesce(group_name, '')) ~ '\\m(family|friends|school|college|personal|trip|birthday|crypto|memes|sports|gaming|music|movie|travel|food|health|parents|alumni|batch|wedding)\\M' then 80
        else 40
    end
where classification is null
   or visibility_status is null
   or business_confidence = 0;

create index if not exists idx_whatsapp_groups_visibility_status
    on public.whatsapp_groups (tenant_id, visibility_status);
