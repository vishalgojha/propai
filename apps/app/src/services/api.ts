import axios from 'axios';
import { clearStoredSession, isSessionExpiring, readStoredSession, refreshSupabaseSession, saveStoredSession } from './authSession';
import { backendApiUrl } from './apiBase';

export { backendApiUrl } from './apiBase';

const SESSION_EXPIRED_MESSAGE = 'Session expired. Please sign in again.';

const backendApi = axios.create({
  baseURL: backendApiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshInFlight: Promise<ReturnType<typeof refreshSupabaseSession>> | null = null;

async function refreshSessionOnce() {
  const session = readStoredSession();
  if (!session?.refreshToken) {
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshed = await refreshSupabaseSession(session);
      if (refreshed) {
        const remember = !!localStorage.getItem('propai_user');
        saveStoredSession(refreshed, remember);
        setBackendApiAuthToken(refreshed.token);
        return refreshed;
      }

      return null;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export function setBackendApiAuthToken(token?: string | null) {
  if (token && typeof token === 'string') {
    backendApi.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete backendApi.defaults.headers.common.Authorization;
}

// Public auth routes that must never be blocked by session checks
const PUBLIC_AUTH_PATHS = ['/auth/password', '/auth/request-verification', '/auth/verify', '/auth/refresh', '/auth/reset-password'];

backendApi.interceptors.request.use(async (config) => {
  // Skip session validation for public auth endpoints
  const url = config.url || '';
  const isPublicAuth = PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
  if (isPublicAuth) {
    return config;
  }

  const session = readStoredSession();

  if (!session) {
    return config;
  }

  let activeSession = session;
  if (isSessionExpiring(activeSession)) {
    const refreshed = await refreshSessionOnce();
    if (refreshed) {
      activeSession = refreshed;
    } else {
      clearStoredSession();
      setBackendApiAuthToken(null);
      return Promise.reject(new Error(SESSION_EXPIRED_MESSAGE));
    }
  }

  if (typeof activeSession.token === 'string' && activeSession.token.split('.').length === 3) {
    (config as any).headers = {
      ...(config.headers as any),
      Authorization: `Bearer ${activeSession.token}`,
    };
    return config;
  }

  clearStoredSession();
  setBackendApiAuthToken(null);
  return Promise.reject(new Error(SESSION_EXPIRED_MESSAGE));
});

backendApi.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const authHeader = originalRequest?.headers?.Authorization || originalRequest?.headers?.authorization;
    const hasBearerAuth = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');

    if (status === 401 && originalRequest && !originalRequest._retry && hasBearerAuth) {
      originalRequest._retry = true;

      const refreshed = await refreshSessionOnce();
      if (refreshed) {
        originalRequest.headers = {
          ...(originalRequest.headers || {}),
          Authorization: `Bearer ${refreshed.token}`,
        };
        return backendApi(originalRequest);
      }
    }

    if (error.code === 'ERR_CERT_AUTHORITY_INVALID' || error.code === 'Network Error') {
      console.warn('API not available, using offline mode');
    }

    return Promise.reject(error);
  }
);

export const handleApiError = (error: any) => {
  console.error("API Error:", error);
  const rawMessage = error.response?.data?.error || error.response?.data?.message || error.message || "An unexpected error occurred";
  const message = rawMessage === 'Missing or invalid authorization header'
    ? SESSION_EXPIRED_MESSAGE
    : rawMessage;
  return message;
};

export default backendApi;
