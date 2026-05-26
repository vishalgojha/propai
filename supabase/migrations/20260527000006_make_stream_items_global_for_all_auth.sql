update public.stream_items
set is_global = true
where ingestion_status = 'accepted'
  and is_global = false;

alter table public.stream_items enable row level security;

drop policy if exists stream_items_select_own_or_global_paid on public.stream_items;
drop policy if exists stream_items_select_own_or_global_all_auth on public.stream_items;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'stream_items'
          and policyname = 'stream_items_select_own_or_global_all_auth'
    ) then
        create policy stream_items_select_own_or_global_all_auth
            on public.stream_items
            for select
            to authenticated
            using (
                tenant_id = auth.uid()
                or is_global = true
            );
    end if;
end
$$;
