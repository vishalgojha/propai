alter table public.whatsapp_groups
  add column if not exists category text;

update public.whatsapp_groups
set category = case
  when lower(coalesce(group_name, '')) ~ '(broker|property|realty|inventory|listing|project|sale|rent|lease|deal|flat|apartment|commercial|office|shop|plot|land|andheri|bandra|powai|thane|borivali|mulund|chembur|navi mumbai)' then 'real_estate'
  when lower(coalesce(group_name, '')) ~ '(family|home|relative|cousin|sibling|mom|dad|parent|uncle|aunt|bhai|behen|shaadi|marriage)' then 'family'
  when lower(coalesce(group_name, '')) ~ '(team|office|work|company|corp|inc|pvt|ltd|llp|ops|operations|admin|hr|accounts|finance|marketing|staff|branch)' then 'work'
  else 'other'
end
where category is null;

alter table public.whatsapp_groups
  drop constraint if exists whatsapp_groups_category_check;

alter table public.whatsapp_groups
  add constraint whatsapp_groups_category_check
  check (category in ('real_estate', 'family', 'work', 'other'));

create index if not exists whatsapp_groups_tenant_category_idx
  on public.whatsapp_groups (tenant_id, category, parse_enabled, last_active_at desc);
