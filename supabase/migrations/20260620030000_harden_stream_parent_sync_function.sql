-- The project has role-level EXECUTE grants in addition to PostgreSQL's PUBLIC
-- default. This trigger-only SECURITY DEFINER function must not be exposed as
-- a PostgREST RPC.
revoke all on function public.sync_stream_item_to_parent() from public;
revoke execute on function public.sync_stream_item_to_parent() from anon, authenticated;
