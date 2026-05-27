-- Show duplicates
SELECT version, COUNT(*) FROM supabase_migrations.schema_migrations GROUP BY version HAVING COUNT(*) > 1;

-- Delete ALL rows for versions that have local file duplicates
DELETE FROM supabase_migrations.schema_migrations 
WHERE version IN ('20260504', '20260527000007', '20260527000008', '20260527000009');

-- Verify
SELECT COUNT(*) FROM supabase_migrations.schema_migrations;
