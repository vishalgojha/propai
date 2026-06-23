import { backendApiUrl } from './apiBase';
import { deleteCookie } from './browserCookies';

export type StoredSession = {
  id?: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  token: string;
  refreshToken?: string;
  expiresAt?: number;
  appRole?: string;
  remember?: boolean;
};

const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
  'chariotrealty@gmail.com',
  'hello@chaoscraftlabs.com',
  'ojha007@gmail.com',
  'hello@propai.live',
]);

function resolveAppRole(email?: string | null, appRole?: string) {
  if (appRole === 'super_admin') {
    return appRole;
  }

  return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase()) ? 'super_admin' : appRole || 'broker';
}

const STORAGE_KEY = 'propai_user';
const SESSION_KEY = 'propai_user_session';

const EXPIRY_SKEW_MS = 5 * 60_000;

function readBrowserStorage(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.email || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readStoredSession(): StoredSession | null {
  if (typeof window !== 'undefined') {
    deleteCookie(STORAGE_KEY);
    deleteCookie(SESSION_KEY);
  }

  return readBrowserStorage(STORAGE_KEY) || readBrowserStorage(SESSION_KEY);
}

export function saveStoredSession(session: StoredSession, remember = true) {
  const storedSession = { ...session, remember };

  if (typeof window === 'undefined') {
    return;
  }

  if (remember) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedSession));
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(storedSession));
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearStoredSession() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function isSessionExpiring(session: StoredSession) {
  if (!session.expiresAt) return false;
  return Date.now() >= session.expiresAt - EXPIRY_SKEW_MS;
}

export type RefreshSessionResult =
  | { status: 'ok'; session: StoredSession }
  | { status: 'expired' }
  | { status: 'retry' };

export async function refreshSupabaseSession(session: StoredSession): Promise<RefreshSessionResult> {
  if (!session.refreshToken) return { status: 'expired' };

  try {
    const response = await fetch(`${backendApiUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken: session.refreshToken,
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return { status: 'expired' };
    }

    if (!response.ok) {
      return { status: 'retry' };
    }

    const data = await response.json();
    const accessToken = data?.session?.access_token;
    const refreshToken = data?.session?.refresh_token || session.refreshToken;
    const expiresIn = Number(data?.session?.expires_in || 0);
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : session.expiresAt;

    if (!accessToken) {
      return { status: 'retry' };
    }

    return {
      status: 'ok',
      session: {
        email: session.email,
        id: session.id,
        first_name: session.first_name || null,
        last_name: session.last_name || null,
        full_name: session.full_name || null,
        token: accessToken,
        refreshToken,
        expiresAt,
        appRole: resolveAppRole(session.email, session.appRole),
        remember: session.remember,
      },
    };
  } catch {
    return { status: 'retry' };
  }
}

export function buildSessionFromSupabase(
  email: string,
  session: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
  }
) {
  return {
    email,
    id: undefined,
    first_name: null,
    last_name: null,
    full_name: null,
    token: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ? session.expires_at * 1000 : session.expires_in ? Date.now() + session.expires_in * 1000 : undefined,
    appRole: resolveAppRole(email),
  } satisfies StoredSession;
}
