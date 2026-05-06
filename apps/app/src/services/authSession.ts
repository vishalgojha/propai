import { backendApiUrl } from './apiBase';

type StoredSession = {
  email: string;
  token: string;
  refreshToken?: string;
  expiresAt?: number;
  appRole?: string;
};

const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
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

function toJson(value: StoredSession, remember: boolean) {
  return JSON.stringify({ ...value, remember });
}

export function readStoredSession(): StoredSession | null {
  const savedUser = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!savedUser) return null;

  try {
    const parsed = JSON.parse(savedUser) as StoredSession;
    if (!parsed?.email || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession, remember = true) {
  const value = toJson(session, remember);
  if (remember) {
    localStorage.setItem(STORAGE_KEY, value);
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  sessionStorage.setItem(SESSION_KEY, value);
  localStorage.removeItem(STORAGE_KEY);
}

export function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function isSessionExpiring(session: StoredSession) {
  if (!session.expiresAt) return false;
  return Date.now() >= session.expiresAt - EXPIRY_SKEW_MS;
}

export async function refreshSupabaseSession(session: StoredSession): Promise<StoredSession | null> {
  if (!session.refreshToken) return null;

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

    if (!response.ok) return null;

    const data = await response.json();
    const accessToken = data?.session?.access_token;
    const refreshToken = data?.session?.refresh_token || session.refreshToken;
    const expiresIn = Number(data?.session?.expires_in || 0);
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : session.expiresAt;

    if (!accessToken) return null;

    return {
      email: session.email,
      token: accessToken,
      refreshToken,
      expiresAt,
      appRole: resolveAppRole(session.email, session.appRole),
    };
  } catch {
    return null;
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
    token: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ? session.expires_at * 1000 : session.expires_in ? Date.now() + session.expires_in * 1000 : undefined,
    appRole: resolveAppRole(email),
  } satisfies StoredSession;
}
