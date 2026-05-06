drop policy if exists stream_items_select_own_or_global_paid on public.stream_items;

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
                  -- The app normalizes external "trialing" states to "trial" on read.
                  and s.status in ('active', 'trial', 'trialing')
                  and s.plan in ('Pro', 'Team')
            )
        )
    );
