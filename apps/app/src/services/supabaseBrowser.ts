import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseBrowserConfigured = Boolean(
  supabaseUrl && supabaseAnonKey,
);

let singletonClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient(accessToken?: string | null) {
  if (!isSupabaseBrowserConfigured) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured');
  }

  if (!singletonClient) {
    singletonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  if (accessToken) {
    singletonClient.realtime.setAuth(accessToken);
  }

  return singletonClient;
}
