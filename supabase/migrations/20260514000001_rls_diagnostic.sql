-- Phase 7: RLS Alignment Diagnostic
-- Run this against your Supabase project to check if tenant_id values
-- in stream_items match the auth UIDs of users who should see them.
--
-- Usage: psql connection-string -f this-file.sql
-- Or run each query individually in the Supabase SQL editor.

-- 1. Check stream_items tenant_id distribution
SELECT tenant_id, COUNT(*) as item_count
FROM stream_items
GROUP BY tenant_id
ORDER BY item_count DESC
LIMIT 20;

-- 2. Check if any stream_items have tenant_id values that don't match
--    any profile (potential workspace ID vs auth UID mismatch)
SELECT si.tenant_id, p.id as profile_id, p.email, p.app_role
FROM stream_items si
LEFT JOIN profiles p ON p.id = si.tenant_id
WHERE p.id IS NULL
GROUP BY si.tenant_id
LIMIT 20;

-- 3. Compare tenant_id to actual user auth UIDs
--    (run this per user if needed)
-- Replace '<USER_AUTH_UID>' with the actual user UUID from auth.users
-- SELECT auth.uid();  -- run this as the logged-in user to get their UID

-- 4. Check what RLS returns for a specific user
-- Run as the target user's auth context:
-- SET LOCAL jwt.claims.sub = '<USER_AUTH_UID>';
-- SELECT COUNT(*) FROM stream_items;

-- 5. Verify RLS policy exists and is active
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'stream_items'
ORDER BY policyname;

-- 6. Check if stream_items count differs between admin and anon context
-- Admin (bypasses RLS):
SELECT COUNT(*) FROM stream_items;
-- User (honors RLS) - will be 0 if tenant_id mismatch exists