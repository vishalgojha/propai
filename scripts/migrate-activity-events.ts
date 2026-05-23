import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const sql = `
create table if not exists workspace_activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_name text,
  actor_role text,
  event_type text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_activity_owner_created
  on workspace_activity_events(workspace_owner_id, created_at desc);

alter table workspace_activity_events enable row level security;

create policy if not exists workspace_activity_owner_access
  on workspace_activity_events
  for all
  using (workspace_owner_id = auth.uid());
`;

  try {
    const { data, error } = await createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).rpc('exec_sql', { query: sql });

    if (error && error.code === 'PGRST202') {
      // exec_sql not available — try via raw query
      console.log('exec_sql RPC not found. Attempting fallback...');
      const resp = await fetch(`${url}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        },
      });
      if (!resp.ok) {
        console.error('Fallback also failed. You may need to run the SQL manually.');
        console.log('\nSQL to execute:\n');
        console.log(sql);
        process.exit(1);
      }
    } else if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }

    console.log('Migration applied successfully!');
  } catch (err: any) {
    if (err?.message?.includes('PGRST202') || err?.code === 'PGRST202') {
      console.log('exec_sql RPC not available on this project.');
    } else {
      console.error('Migration failed:', err);
    }
    console.log('\nSQL to execute manually:\n');
    console.log(sql);
    process.exit(1);
  }
}

main();
