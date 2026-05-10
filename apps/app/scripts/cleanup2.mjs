import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mnqkcctegpqxjvgdgakf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucWtjY3RlZ3BxeGp2Z2RnYWtmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg3MzgxMiwiZXhwIjoyMDkzNDQ5ODEyfQ.OrN3VjFNJj7CFxox1nhAlV0a7OzD_poxu5F6KzK4ue4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Retry tables that failed due to no 'id' column — try with tenant_id
async function deleteByCol(table, col) {
  const { error } = await supabase.from(table).delete().neq(col, '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}

const RETRY = [
  ['model_preferences', 'tenant_id'],
  ['subscriptions', 'tenant_id'],
  ['api_keys', 'tenant_id'],
  ['group_configs', 'tenant_id'],
  ['workspace_settings', 'tenant_id'],
  ['whatsapp_ingestion_health', 'tenant_id'],
];

for (const [table, col] of RETRY) {
  try {
    await deleteByCol(table, col);
    console.log(`  OK: ${table} (via ${col})`);
  } catch (err) {
    console.error(`  FAILED: ${table} — ${err.message}`);
  }
}

// Try broker_identity with broker_id
try {
  await deleteByCol('broker_identity', 'broker_id');
  console.log('  OK: broker_identity');
} catch (err) {
  console.error('  FAILED: broker_identity — retry with direct REST');
  // Direct REST fallback
  const url = `${SUPABASE_URL}/rest/v1/broker_identity`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (resp.ok || resp.status === 406) {
    console.log(`  OK: broker_identity (REST direct, status ${resp.status})`);
  } else {
    const text = await resp.text();
    console.error(`  FAILED broker_identity REST: ${resp.status} ${text.slice(0, 200)}`);
  }
}

console.log('\nDone with retries.');
