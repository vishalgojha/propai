import axios from 'axios';
import { clearStoredSession, isSessionExpiring, readStoredSession, refreshSupabaseSession, saveStoredSession } from './authSession';
import { backendApiUrl } from './apiBase';

export { backendApiUrl } from './apiBase';

const SESSION_EXPIRED_MESSAGE = 'Session expired. Please sign in again.';
const SESSION_EXPIRED_EVENT = 'propai:session-expired';
const DEFAULT_API_TIMEOUT_MS = 30000;
const PUBLIC_AUTH_TIMEOUT_MS = 45000;

const backendApi = axios.create({
  baseURL: backendApiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: DEFAULT_API_TIMEOUT_MS,
});

let refreshInFlight: Promise<Awaited<ReturnType<typeof refreshSupabaseSession>>> | null = null;
let sessionExpiredDispatched = false;

function dispatchSessionExpired(reason = SESSION_EXPIRED_MESSAGE) {
  if (typeof window === 'undefined' || sessionExpiredDispatched) {
    return;
  }

  sessionExpiredDispatched = true;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, {
    detail: { reason },
  }));
}

async function refreshSessionOnce() {
  const session = readStoredSession();
  if (!session?.refreshToken) {
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshed = await refreshSupabaseSession(session);
      if (refreshed) {
        saveStoredSession(refreshed, session.remember !== false);
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
    sessionExpiredDispatched = false;
    backendApi.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete backendApi.defaults.headers.common.Authorization;
}

// Public auth routes that must never be blocked by session checks
const PUBLIC_AUTH_PATHS = ['/auth/request-login-link', '/auth/login-status', '/auth/refresh'];

backendApi.interceptors.request.use(async (config) => {
  // Skip session validation for public auth endpoints
  const url = config.url || '';
  const isPublicAuth = PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
  if (isPublicAuth && !config.timeout) {
    config.timeout = PUBLIC_AUTH_TIMEOUT_MS;
  }
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
      dispatchSessionExpired();
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
  dispatchSessionExpired();
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

      if (typeof window !== 'undefined') {
        dispatchSessionExpired(error.response?.data?.message || error.response?.data?.error || SESSION_EXPIRED_MESSAGE);
      }
    }

    if (status === 401 && originalRequest && originalRequest._retry && hasBearerAuth && typeof window !== 'undefined') {
      dispatchSessionExpired(error.response?.data?.message || error.response?.data?.error || SESSION_EXPIRED_MESSAGE);
    }

    if (error.code === 'ERR_CERT_AUTHORITY_INVALID' || error.code === 'Network Error') {
      console.warn('API not available, using offline mode');
    }

    return Promise.reject(error);
  }
);

export const handleApiError = (error: any) => {
  if (isApiAbortError(error)) {
    return 'Request was cancelled.';
  }

  console.error("API Error:", error);
  if (error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout')) {
    const requestUrl = String(error?.config?.url || '');
    const isAuthRequest = PUBLIC_AUTH_PATHS.some((path) => requestUrl.includes(path));
    return isAuthRequest
      ? 'Sign in is taking too long right now. Please try again in a moment.'
      : 'The request took too long. Please try again in a moment.';
  }
  const details = Array.isArray(error?.response?.data?.details) ? error.response.data.details : [];
  const detailMessage = details
    .map((detail: any) => {
      const field = String(detail?.path || detail?.field || '').trim();
      const message = String(detail?.message || '').trim();
      return field && message ? `${field}: ${message}` : message || field;
    })
    .filter(Boolean)
    .join(', ');
  const rawMessage = error.response?.data?.error || error.response?.data?.message || error.message || "An unexpected error occurred";
  const normalized = typeof rawMessage === 'object'
    ? (rawMessage?.message || rawMessage?.error || JSON.stringify(rawMessage))
    : String(rawMessage);
  const repaired = normalized === '[object Object]'
    ? (error.response?.data?.message || error.response?.data?.error?.message || JSON.stringify(error.response?.data || rawMessage))
    : normalized;
  const withDetails = detailMessage
    ? repaired === 'Validation failed'
      ? `${repaired}: ${detailMessage}`
      : `${repaired}. ${detailMessage}`
    : repaired;
  const cleaned = withDetails === '{}' || withDetails === '[object Object]'
    ? 'An unexpected error occurred.'
    : withDetails;
  return cleaned === 'Missing or invalid authorization header'
    || cleaned === 'Invalid or expired token'
    ? SESSION_EXPIRED_MESSAGE
    : cleaned;
};

export function isApiAbortError(error: any) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'ERR_CANCELED'
    || message === 'canceled'
    || message === 'cancelled'
    || message.includes('request aborted');
}

export default backendApi;
