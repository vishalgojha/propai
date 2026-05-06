import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://wnrwntumacbirbndfvwg.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InducndudHVtYWNiaXJibmRmdndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTgwNjcsImV4cCI6MjA4OTgzNDA2N30.ub1zIhw1535oPMY9io07BPTgTfWiNdivAkfTerjeoYQ';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const serverClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not provided - auth features disabled');
}

export const createSupabaseAnonClient = (accessToken?: string) =>
  createClient(supabaseUrl, supabaseAnonKey, accessToken
    ? {
        ...serverClientOptions,
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    : serverClientOptions);

export const createSupabaseServiceClient = () =>
  supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey, serverClientOptions) : null;

export const supabase = createSupabaseAnonClient();
export const supabaseAdmin = createSupabaseServiceClient();
