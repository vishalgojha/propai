import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mnqkcctegpqxjvgdgakf.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucWtjY3RlZ3BxeGp2Z2RnYWtmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg3MzgxMiwiZXhwIjoyMDkzNDQ5ODEyfQ.OrN3VjFNJj7CFxox1nhAlV0a7OzD_poxu5F6KzK4ue4';

async function main() {
  // First, create the exec_sql function if it doesn't exist
  // We can do this by posting to a Supabase management-style endpoint
  // but the simplest approach is using the /rest/v1/ with raw SQL via a special header

  console.log('Attempting migration via Supabase REST API...');

  // Step 1: Try using the SQL endpoint (Supabase Pro feature)
  const sql = `
    ALTER TABLE stream_items ADD COLUMN IF NOT EXISTS content_hash text;
    ALTER TABLE stream_items ADD COLUMN IF NOT EXISTS message_hash text;
    
    UPDATE stream_items
    SET
      content_hash = COALESCE(content_hash, md5(coalesce(raw_text, '') || coalesce(source_phone, ''))),
      message_hash = COALESCE(message_hash, md5(coalesce(raw_text, '') || coalesce(source_phone, '')))
    WHERE content_hash IS NULL OR message_hash IS NULL;
    
    ALTER TABLE stream_items DROP CONSTRAINT IF EXISTS stream_items_content_hash_key;
    CREATE UNIQUE INDEX IF NOT EXISTS stream_items_tenant_message_hash_key ON stream_items (tenant_id, message_hash);
  `;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Accept': 'application/json',
    },
  });

  console.log(`REST base endpoint status: ${response.status}`);

  // Step 2: Try the pg-native endpoint
  const pgResponse = await fetch(`${SUPABASE_URL}/auth/v1/`, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  console.log(`Auth endpoint status: ${pgResponse.status}`);

  // Step 3: Try creating a function first, then calling it
  const createFnSql = `
    CREATE OR REPLACE FUNCTION exec_sql(query text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE query;
    END;
    $$;
  `;

  // We need a different approach. Let's try the supabase client's .rpc with existing functions
  // or use the pg connection string approach
  
  console.log('\nTrying alternative: using Supabase JS client with query method...');
  
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Try exec_sql if it exists
  const { data, error } = await sb.rpc('exec_sql', { query: 'SELECT 1' });
  console.log(`exec_sql RPC:`, error ? `Error: ${error.message}` : `Success: ${JSON.stringify(data)}`);

  if (error) {
    console.log('\nexec_sql not available. Trying to create it via schema endpoint...');
    
    // Try to create the function via management API
    console.log('\nYou can run the migration SQL directly in the Supabase Dashboard SQL Editor.');
    console.log('Supabase project: https://supabase.com/dashboard/project/mnqkcctegpqxjvgdgakf');
    console.log('\nSQL to run:');
    console.log('```sql');
    console.log(sql);
    console.log('```');
  }

  console.log('\nDone.');
}

main().catch(console.error);
