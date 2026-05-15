import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey =
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

export function createSupabaseBrowserClient(accessToken?: string | null) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured');
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });

  if (accessToken) {
    client.realtime.setAuth(accessToken);
  }

  return client;
}
