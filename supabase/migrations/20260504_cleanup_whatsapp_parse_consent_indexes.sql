drop index if exists public.whatsapp_groups_tenant_group_uidx;

drop policy if exists whatsapp_groups_tenant_manage on public.whatsapp_groups;
create policy whatsapp_groups_tenant_manage
  on public.whatsapp_groups
  for all
  using ((select auth.uid()) = tenant_id)
  with check ((select auth.uid()) = tenant_id);

drop policy if exists whatsapp_dm_permissions_tenant_manage on public.whatsapp_dm_permissions;
create policy whatsapp_dm_permissions_tenant_manage
  on public.whatsapp_dm_permissions
  for all
  using ((select auth.uid()) = tenant_id)
  with check ((select auth.uid()) = tenant_id);
