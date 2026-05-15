import { supabase } from '../../../scripts/supabaseAdminClient.mjs';

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
