import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const realtimeTransport = WebSocket as unknown as any;
export const serverClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    transport: realtimeTransport,
  },
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not provided - auth features disabled');
}

function requireSupabaseAnonConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured');
  }
}

export const createSupabaseAnonClient = (accessToken?: string) => {
  requireSupabaseAnonConfig();
  return createClient(supabaseUrl, supabaseAnonKey, accessToken
    ? {
        ...serverClientOptions,
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    : serverClientOptions);
};

export const createSupabaseServiceClient = () =>
  supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey, serverClientOptions) : null;

export const supabase = createSupabaseAnonClient();
export const supabaseAdmin = createSupabaseServiceClient();
