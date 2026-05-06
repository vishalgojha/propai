import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta as any).env.VITE_SUPABASE_URL ||
  'https://wnrwntumacbirbndfvwg.supabase.co';
const supabaseAnonKey =
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InducndudHVtYWNiaXJibmRmdndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTgwNjcsImV4cCI6MjA4OTgzNDA2N30.ub1zIhw1535oPMY9io07BPTgTfWiNdivAkfTerjeoYQ';

export function createSupabaseBrowserClient(accessToken?: string | null) {
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
