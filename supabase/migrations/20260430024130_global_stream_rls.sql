alter table public.stream_items
    add column if not exists is_global boolean not null default false;

create index if not exists idx_stream_items_global_created
    on public.stream_items (is_global, created_at desc);

update public.stream_items
set is_global = true
where price_numeric is not null
  and confidence_score > 0.6;

alter table public.stream_items enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'stream_items'
          and policyname = 'stream_items_select_own_or_global_paid'
    ) then
        create policy stream_items_select_own_or_global_paid
            on public.stream_items
            for select
            to authenticated
            using (
                tenant_id = auth.uid()
                or (
                    is_global = true
                    and exists (
                        select 1
                        from public.subscriptions s
                        where s.tenant_id = auth.uid()
                          and s.status = 'active'
                          and s.plan in ('Pro', 'Team')
                    )
                )
            );
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'stream_items'
    ) then
        alter publication supabase_realtime add table public.stream_items;
    end if;
end
$$;
