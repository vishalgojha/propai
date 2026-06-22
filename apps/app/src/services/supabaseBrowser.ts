import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseBrowserConfigured = Boolean(
  supabaseUrl && supabaseAnonKey,
);

let singletonClient: SupabaseClient | null = null;

function decodeJwtPayload(token: string) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isPropaiAppSessionToken(token: string) {
  const payload = decodeJwtPayload(token);
  return payload?.typ === 'propai-app-session';
}

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

  if (accessToken && !isPropaiAppSessionToken(accessToken)) {
    singletonClient.realtime.setAuth(accessToken);
  }

  return singletonClient;
}
