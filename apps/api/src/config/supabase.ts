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

function isPropaiAppSessionToken(token?: string) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );
    return payload?.typ === 'propai-app-session';
  } catch {
    return false;
  }
}

export const createSupabaseAnonClient = (accessToken?: string) => {
  requireSupabaseAnonConfig();
  const tokenToUse = accessToken && !isPropaiAppSessionToken(accessToken) ? accessToken : undefined;
  return createClient(supabaseUrl, supabaseAnonKey, tokenToUse
    ? {
        ...serverClientOptions,
        global: {
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
          },
        },
      }
    : serverClientOptions);
};

export const createSupabaseServiceClient = () =>
  supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey, serverClientOptions) : null;

export const supabase = createSupabaseAnonClient();
export const supabaseAdmin = createSupabaseServiceClient();
