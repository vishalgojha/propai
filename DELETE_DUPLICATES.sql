DELETE FROM supabase_migrations.schema_migrations 
WHERE ctid NOT IN (
    SELECT MIN(ctid) FROM supabase_migrations.schema_migrations GROUP BY version
);
