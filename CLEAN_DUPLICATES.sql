-- Check what duplicates exist
SELECT version, COUNT(*) FROM supabase_migrations.schema_migrations GROUP BY version HAVING COUNT(*) > 1;

-- Delete them keeping only the first one per version
WITH ranked AS (
    SELECT version, ctid, ROW_NUMBER() OVER (PARTITION BY version ORDER BY ctid) as rn
    FROM supabase_migrations.schema_migrations
)
DELETE FROM supabase_migrations.schema_migrations
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

-- Verify cleanup
SELECT version, COUNT(*) FROM supabase_migrations.schema_migrations GROUP BY version HAVING COUNT(*) > 1;
