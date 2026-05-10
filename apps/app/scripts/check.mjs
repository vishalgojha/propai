import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mnqkcctegpqxjvgdgakf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucWtjY3RlZ3BxeGp2Z2RnYWtmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg3MzgxMiwiZXhwIjoyMDkzNDQ5ODEyfQ.OrN3VjFNJj7CFxox1nhAlV0a7OzD_poxu5F6KzK4ue4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = [
  'listings', 'requirements', 'follow_up_tasks', 'leads', 'lead_records',
  'contacts', 'messages', 'conversations', 'agent_events',
  'agent_behavior_rules', 'model_preferences', 'subscriptions', 'api_keys',
  'group_configs', 'site_visits', 'outbound_message_queue',
  'workspace_settings', 'workspace_files', 'broker_identity',
  'source_reliability', 'stream_items', 'broker_channels',
  'whatsapp_sessions', 'whatsapp_groups', 'workspaces',
  'workspace_members', 'workspace_activity_events', 'workspace_service_areas',
  'profiles',
];

for (const table of TABLES) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`  ${table}: ERROR — ${error.message}`);
  } else {
    console.log(`  ${table}: ${count} rows`);
  }
}

const { data: { users } } = await supabase.auth.admin.listUsers();
console.log(`\n  auth.users: ${users?.length || 0} users`);
if (users?.length) {
  for (const u of users) {
    console.log(`    - ${u.email} (${u.id})`);
  }
}
