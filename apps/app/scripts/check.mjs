import { supabase } from '../../../scripts/supabaseAdminClient.mjs';

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
