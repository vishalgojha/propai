import { createClient } from '@supabase/supabase-js';

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export { supabaseUrl, supabaseServiceRoleKey };
