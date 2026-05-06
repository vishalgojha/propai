import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import backendApi, { setBackendApiAuthToken } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { identify, resetAnalytics, track } from '../services/analytics';
import {
  clearStoredSession,
  isSessionExpiring,
  readStoredSession,
  refreshSupabaseSession,
  saveStoredSession,
} from '../services/authSession';

interface User {
  email: string;
  token?: string;
  refreshToken?: string;
  expiresAt?: number;
  appRole?: string;
  subscription?: SubscriptionState | null;
  isImpersonation?: boolean;
  impersonatedBy?: string;
  impersonationExpiresAt?: number;
}

export interface SubscriptionState {
  plan: string;
  status: string;
  created_at?: string | null;
  renewal_date?: string | null;
  trial_days_remaining?: number | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, session: User, remember?: boolean) => void;
  logout: () => void;
}

const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
]);

const resolveAppRole = (email?: string | null, appRole?: string) => {
  if (appRole === 'super_admin') {
    return appRole;
  }

  return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase()) ? 'super_admin' : appRole || 'broker';
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = 'propai_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authMutationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const restoreVersion = authMutationRef.current;

    const restoreSession = async () => {
      const savedSession = readStoredSession();
      if (!savedSession) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      let activeSession = savedSession;

      try {
        if (isSessionExpiring(activeSession)) {
          const refreshed = await refreshSupabaseSession(activeSession);
          if (refreshed) {
            activeSession = refreshed;
            saveStoredSession(refreshed, !!localStorage.getItem(STORAGE_KEY));
          }
        }

        const response = await backendApi.get(ENDPOINTS.auth.me, {
          headers: {
            Authorization: `Bearer ${activeSession.token}`,
          },
        });
        const serverUser = response.data?.user;
        if (cancelled || authMutationRef.current !== restoreVersion) return;

        if (response.data?.success && serverUser?.email) {
          setBackendApiAuthToken(activeSession.token);
            setUser({
              email: serverUser.email,
              token: activeSession.token,
              refreshToken: activeSession.refreshToken,
              expiresAt: activeSession.expiresAt,
              appRole: resolveAppRole(
                serverUser.email,
                serverUser.appRole || activeSession.appRole || response.data?.profile?.appRole
              ),
              subscription: response.data?.subscription,
            });
          identify(serverUser.email, { restored: true });
          track('session_restored', { restored: true });
          setIsLoading(false);
          return;
        }
      } catch (error: any) {
        const status = error?.response?.status;
        const shouldClearSession = status === 401 || status === 403;

        if (!shouldClearSession) {
          console.warn('Session restore hit a backend error, preserving local session state.', error);

          if (!cancelled && authMutationRef.current === restoreVersion) {
            setBackendApiAuthToken(activeSession.token);
            setUser({
              email: activeSession.email,
              token: activeSession.token,
              refreshToken: activeSession.refreshToken,
              expiresAt: activeSession.expiresAt,
              appRole: resolveAppRole(activeSession.email, activeSession.appRole),
            });
            setIsLoading(false);
          }
          return;
        }
      }

      if (cancelled || authMutationRef.current !== restoreVersion) {
        return;
      }

      clearStoredSession();
      if (!cancelled) {
        setBackendApiAuthToken(null);
        setUser(null);
        setIsLoading(false);
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      authMutationRef.current += 1;
      setBackendApiAuthToken(null);
      clearStoredSession();
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener('propai:session-expired', handleSessionExpired as EventListener);
    return () => {
      window.removeEventListener('propai:session-expired', handleSessionExpired as EventListener);
    };
  }, []);

  const login = (email: string, session: User, remember = true) => {
    authMutationRef.current += 1;
    const userData = {
      email,
      token: session.token || '',
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      appRole: resolveAppRole(email, session.appRole),
      subscription: session.subscription,
      isImpersonation: session.isImpersonation,
      impersonatedBy: session.impersonatedBy,
      impersonationExpiresAt: session.impersonationExpiresAt,
    };
    
    setBackendApiAuthToken(userData.token);
    setUser(userData);
    
    // Do not persist impersonation sessions
    if (!userData.isImpersonation) {
      saveStoredSession(userData, remember);
    }
    
    identify(email, { remember, isImpersonation: userData.isImpersonation });
    track('login_success', { remember, isImpersonation: userData.isImpersonation });
  };

  const logout = () => {
    authMutationRef.current += 1;
    track('sign_out');
    resetAnalytics();
    setBackendApiAuthToken(null);
    setUser(null);
    clearStoredSession();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
