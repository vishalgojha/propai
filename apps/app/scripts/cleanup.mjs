import { supabase } from '../../../scripts/supabaseAdminClient.mjs';

async function deleteAll(table, filterCol = 'id', dummyVal = '00000000-0000-0000-0000-000000000000') {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .neq(filterCol, dummyVal);
  if (error) throw error;
  return count;
}

const SIMPLE = [
  'listings', 'requirements', 'follow_up_tasks', 'leads', 'lead_records',
  'contacts', 'messages', 'conversations', 'agent_events',
  'agent_behavior_rules', 'model_preferences', 'subscriptions', 'api_keys',
  'group_configs', 'site_visits', 'outbound_message_queue',
  'workspace_settings', 'workspace_files', 'broker_identity',
  'source_reliability',
];

const cleared = [];

for (const table of SIMPLE) {
  try {
    const cnt = await deleteAll(table);
    cleared.push(table);
    console.log(`  OK: ${table} (${cnt ?? '?'} rows)`);
  } catch (err) {
    console.error(`  FAILED: ${table} — ${err.message}`);
  }
}

try {
  await deleteAll('stream_item_corrections');
  await deleteAll('canonical_record_evidence');
  await deleteAll('channel_items');
  await deleteAll('stream_items');
  await deleteAll('canonical_records');
  await deleteAll('broker_channels');
  cleared.push('stream family');
  console.log('  OK: stream/canonical/channel family');
} catch (err) {
  console.error(`  FAILED: stream family — ${err.message}`);
}

try {
  await deleteAll('whatsapp_groups');
  await deleteAll('whatsapp_group_health');
  await deleteAll('whatsapp_ingestion_health');
  await deleteAll('whatsapp_event_logs');
  await deleteAll('whatsapp_sessions');
  cleared.push('whatsapp_*');
  console.log('  OK: whatsapp tables');
} catch (err) {
  console.error(`  FAILED: whatsapp tables — ${err.message}`);
}

try {
  await deleteAll('wabro_campaign_contacts');
  await deleteAll('wabro_send_logs');
  await deleteAll('wabro_devices');
  await deleteAll('wabro_contacts');
  await deleteAll('wabro_campaigns');
  cleared.push('wabro_*');
  console.log('  OK: wabro tables');
} catch (err) {
  console.error(`  FAILED: wabro tables — ${err.message}`);
}

try {
  await deleteAll('workspace_service_areas');
  await deleteAll('workspace_activity_events');
  await deleteAll('workspace_members');
  await deleteAll('workspaces');
  cleared.push('workspace_*');
  console.log('  OK: workspace tables');
} catch (err) {
  console.error(`  FAILED: workspace tables — ${err.message}`);
}

try {
  await deleteAll('public_property_leads');
  cleared.push('public_property_leads');
  console.log('  OK: public_property_leads');
} catch (err) {
  console.error(`  FAILED: public_property_leads — ${err.message}`);
}

try {
  const { error } = await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
  cleared.push('profiles');
  console.log('  OK: profiles');
} catch (err) {
  console.error(`  FAILED: profiles — ${err.message}`);
}

try {
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  for (const u of users) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
    if (delErr) console.error(`  FAILED delete user ${u.id}: ${delErr.message}`);
    else console.log(`  Deleted user: ${u.email || u.id}`);
  }
  cleared.push('auth.users');
  console.log('  OK: auth.users');
} catch (err) {
  console.error(`  FAILED: auth.users — ${err.message}`);
}

console.log('\n========================================');
console.log(`Done. Tables cleared: ${cleared.length} groups`);
console.log('========================================');
