-- Add broker_channels and channel_items to Supabase Realtime publication
-- Required for the stream page (/stream) to receive instant updates via Supabase Realtime

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'broker_channels'
    ) then
        alter publication supabase_realtime add table public.broker_channels;
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
          and tablename = 'channel_items'
    ) then
        alter publication supabase_realtime add table public.channel_items;
    end if;
end
$$;