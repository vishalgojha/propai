import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mnqkcctegpqxjvgdgakf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucWtjY3RlZ3BxeGp2Z2RnYWtmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg3MzgxMiwiZXhwIjoyMDkzNDQ5ODEyfQ.OrN3VjFNJj7CFxox1nhAlV0a7OzD_poxu5F6KzK4ue4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from('_supabase_migrations')
  .select('*')
  .order('version', { ascending: true });

if (error) {
  console.log('No _supabase_migrations table found or error:', error.message);
  // Try querying pg_tables to see what exists
  const { data: tables } = await supabase.rpc('exec_sql', { query: "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename" });
  if (tables) console.log('Public tables:', tables);
  else console.log('Cannot enumerate tables');
} else {
  console.log('Applied migrations:');
  for (const m of data) {
    console.log(`  ${m.version} — ${m.name || ''} (${m.executed_at || ''})`);
  }
}
