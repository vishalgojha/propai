import React from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { LegalFooter } from './LegalFooter';
import { PropAITour } from './PropAITour';
import { PulseAssistantDock } from './PulseAssistantDock';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { BookOpenIcon, MenuIcon, LogoutIcon } from '../lib/icons';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../hooks/useTour';
import { usePushNotifications } from '../hooks/usePushNotifications';

type WhatsAppSessionSummary = {
  label: string;
  ownerName?: string | null;
  phoneNumber?: string | null;
  status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  lastSync?: string | null;
};

type WhatsAppStatusSummary = {
  status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  connectedPhoneNumber?: string | null;
  connectedOwnerName?: string | null;
  activeCount: number;
  limit: number;
  sessions: WhatsAppSessionSummary[];
  selectedSessionLabel?: string | null;
};

const normalizeWhatsAppSession = (session: unknown): WhatsAppSessionSummary | null => {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const row = session as Record<string, unknown>;
  const label = String(row.label || '').trim();
  if (!label) {
    return null;
  }

  const rawStatus = String(row.status || 'disconnected');
  const status: WhatsAppSessionSummary['status'] =
    rawStatus === 'connected' || rawStatus === 'connecting' || rawStatus === 'reconnecting' ? rawStatus : 'disconnected';

  return {
    label,
    ownerName: typeof row.ownerName === 'string' ? row.ownerName : null,
    phoneNumber: typeof row.phoneNumber === 'string' ? row.phoneNumber : null,
    status,
    lastSync: typeof row.lastSync === 'string' ? row.lastSync : null,
  };
};

const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'propai.sidebar_collapsed';
const MOBILE_COLLAPSE_BREAKPOINT = '(max-width: 1023px)';
const WHATSAPP_DISCONNECT_GRACE_MS = 90_000;

const PROPAI_API_PHONE = '+917021045254';
const PROPAI_API_LABEL = 'PropAI API';

const isOfficialWhatsAppSession = (session?: WhatsAppSessionSummary | null) => (
  String(session?.label || '').toLowerCase() === 'official api'
);

const isEvolutionWhatsAppSession = (session?: WhatsAppSessionSummary | null) => (
  !isOfficialWhatsAppSession(session)
);

const formatHeaderPhone = (phone?: string | null) => {
  const value = String(phone || '').trim();
  if (!value) {
    return null;
  }

  return value.startsWith('+') ? value : `+${value}`;
};

const mergeRecentWhatsappSessions = (
  incoming: WhatsAppSessionSummary[],
  previous: WhatsAppStatusSummary | null,
  hasRecentHealthyState: boolean,
) => {
  if (!hasRecentHealthyState || !previous?.sessions?.length) {
    return incoming;
  }

  const incomingByLabel = new Map(incoming.map((session) => [session.label, session]));
  for (const previousSession of previous.sessions) {
    if (previousSession.status !== 'connected') {
      continue;
    }

    const nextSession = incomingByLabel.get(previousSession.label);
    if (!nextSession || nextSession.status === 'disconnected') {
      incomingByLabel.set(previousSession.label, previousSession);
    }
  }

  return Array.from(incomingByLabel.values());
};

export const Layout: React.FC = () => {
  const { user, isLoading, logout } = useAuth();
  usePushNotifications(user?.id || null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }

      return window.matchMedia(MOBILE_COLLAPSE_BREAKPOINT).matches;
    } catch {
      return false;
    }
  });
  const [selectedSessionLabel, setSelectedSessionLabel] = React.useState<string | null>(() => {
    try {
      return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [whatsappStatus, setWhatsappStatus] = React.useState<WhatsAppStatusSummary>({
    status: 'disconnected',
    connectedPhoneNumber: null,
    connectedOwnerName: null,
    activeCount: 0,
    limit: 0,
    sessions: [],
    selectedSessionLabel: null,
  });
  const lastHealthyWhatsappStatusRef = React.useRef<WhatsAppStatusSummary | null>(null);
  const lastHealthyWhatsappStatusAtRef = React.useRef<number>(0);
  const disconnectedSnapshotCountRef = React.useRef<number>(0);

  const getPageTitle = (path: string) => {
    if (path.startsWith('/broker-network/partners')) return 'Partner / Team';
    if (path.startsWith('/broker-network')) return 'Network';
    if (path.startsWith('/whatsapp')) return 'WhatsApp';
    if (path.startsWith('/intelligence') || path === '/analytics') return 'Analytics';
    if (path.startsWith('/ai-usage') || path === '/aiusage') return 'AI Usage';

    switch (path) {
      case '/listings':
      case '/stream': return 'Market Feed';
      case '/pricing':
        return 'Pricing';
      case '/docs':
        return 'Docs';
      case '/team':
        return 'Profile & Team';
      case '/admin':
        return 'Admin';
      case '/agent': return 'Pulse';
      case '/settings': return 'Studio Settings';
      case '/requirements': return 'Requirements';
      case '/matches': return 'Matches';
      case '/dashboard': return 'Dashboard';
      case '/projects': return 'Projects';
      case '/groups': return 'Groups';
      default: return 'PropAI Pulse';
    }
  };

  const channelParam = searchParams.get('channel');
  const channelName = searchParams.get('channelName');
  const title = channelParam ? channelName || `#${channelParam}` : getPageTitle(location.pathname);
  const searchKey = searchParams.toString();

  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname, searchKey]);

  React.useEffect(() => {
    if (isLoading || user) {
      return;
    }

    const nextPath = searchKey ? `${location.pathname}?${searchKey}` : location.pathname;
    navigate(`/login?next=${encodeURIComponent(nextPath)}`, { replace: true });
  }, [isLoading, location.pathname, navigate, searchKey, user]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
    } catch {
      // Ignore storage failures.
    }
  }, [isSidebarCollapsed]);

  const syncSelectedSession = React.useCallback((nextLabel: string | null) => {
    setSelectedSessionLabel(nextLabel);
    try {
      if (nextLabel) {
        window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, nextLabel);
      } else {
        window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  React.useEffect(() => {
    const handleSelectedSession = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string | null }>).detail;
      syncSelectedSession(detail?.label || null);
    };

    window.addEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    return () => {
      window.removeEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    };
  }, [syncSelectedSession]);

  const loadWhatsappStatus = React.useCallback(async (cancelled = false) => {
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.status);
      if (!cancelled && response.data) {
        const sessions = Array.isArray(response.data.sessions)
          ? response.data.sessions.map(normalizeWhatsAppSession).filter((session): session is WhatsAppSessionSummary => Boolean(session))
          : [];
        const hasRecentHealthyState =
          Boolean(lastHealthyWhatsappStatusRef.current) &&
          Date.now() - lastHealthyWhatsappStatusAtRef.current < WHATSAPP_DISCONNECT_GRACE_MS;
        const mergedSessions = mergeRecentWhatsappSessions(sessions, lastHealthyWhatsappStatusRef.current, hasRecentHealthyState);
        const connectedSessions = mergedSessions.filter((session) => session.status === 'connected');
        const preferredLabel = selectedSessionLabel && mergedSessions.some((session) => session.label === selectedSessionLabel)
          ? selectedSessionLabel
          : connectedSessions[0]?.label || mergedSessions[0]?.label || null;
        const selectedSession = preferredLabel
          ? mergedSessions.find((session) => session.label === preferredLabel) || null
          : null;

        if (!selectedSessionLabel && preferredLabel) {
          syncSelectedSession(preferredLabel);
        }

        const nextSnapshot: WhatsAppStatusSummary = {
          status: selectedSession?.status || response.data.status || 'disconnected',
          connectedPhoneNumber: selectedSession?.phoneNumber || response.data.connectedPhoneNumber || null,
          connectedOwnerName: selectedSession?.ownerName || response.data.connectedOwnerName || null,
          activeCount: response.data.activeCount || 0,
          limit: response.data.limit || 0,
          sessions: mergedSessions,
          selectedSessionLabel: preferredLabel,
        };

        if (nextSnapshot.status === 'connected') {
          disconnectedSnapshotCountRef.current = 0;
          lastHealthyWhatsappStatusRef.current = nextSnapshot;
          lastHealthyWhatsappStatusAtRef.current = Date.now();
          setWhatsappStatus(nextSnapshot);
          return;
        }

        if (nextSnapshot.status === 'connecting' || nextSnapshot.status === 'reconnecting') {
          disconnectedSnapshotCountRef.current = 0;
          setWhatsappStatus(nextSnapshot);
          return;
        }

        disconnectedSnapshotCountRef.current += 1;
        if (hasRecentHealthyState && disconnectedSnapshotCountRef.current < 2) {
          return;
        }

        setWhatsappStatus(nextSnapshot);
      }
    } catch {
      // Keep the last known status on transient request failures so route
      // changes or brief API hiccups do not look like a WhatsApp disconnect.
    }
  }, [selectedSessionLabel, syncSelectedSession]);

  React.useEffect(() => {
    if (!user?.token) {
      lastHealthyWhatsappStatusRef.current = null;
      lastHealthyWhatsappStatusAtRef.current = 0;
      disconnectedSnapshotCountRef.current = 0;
      setWhatsappStatus({
        status: 'disconnected',
        connectedPhoneNumber: null,
        connectedOwnerName: null,
        activeCount: 0,
        limit: 0,
        sessions: [],
        selectedSessionLabel: null,
      });
      return;
    }

    let cancelled = false;

    void loadWhatsappStatus(cancelled);
    const interval = window.setInterval(() => {
      void loadWhatsappStatus(cancelled);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadWhatsappStatus, user?.token]);

  React.useEffect(() => {
    if (!user?.token) {
      return;
    }

    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadWhatsappStatus(false);
      }
    };

    window.addEventListener('focus', refreshOnVisibility);
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      window.removeEventListener('focus', refreshOnVisibility);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [loadWhatsappStatus, user?.token]);

  const officialApiSession = React.useMemo(
    () => whatsappStatus.sessions.find(isOfficialWhatsAppSession) || null,
    [whatsappStatus.sessions],
  );
  const officialApiStatus = officialApiSession?.status || 'disconnected';
  const officialApiPhone = formatHeaderPhone(officialApiSession?.phoneNumber);
  const evolutionApiSession = React.useMemo(
    () => whatsappStatus.sessions.find(isEvolutionWhatsAppSession) || null,
    [whatsappStatus.sessions],
  );
  const evolutionApiStatus = evolutionApiSession?.status || 'disconnected';
  const evolutionApiPhone = formatHeaderPhone(evolutionApiSession?.phoneNumber);
  const subscription = user?.subscription;
  const planLabel = React.useMemo(() => {
    const normalized = String(subscription?.plan || '').trim().toLowerCase();
    if (normalized === 'trial' || normalized === 'free') return 'Trial';
    if (normalized === 'solo' || normalized === 'pro') return 'Pro';
    return subscription?.plan || 'Team';
  }, [subscription?.plan]);
  const { isCompleted: isTourCompleted, markCompleted: markTourCompleted } = useTour(user?.id || user?.email || null);

  const startTour = React.useCallback(() => {
    window.__propai_start_tour?.();
  }, []);

  return (
    <div className="flex min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] lg:h-screen lg:overflow-hidden">
      {isSidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm transition-opacity duration-200 lg:hidden"
        />
      ) : null}

      <PropAITour autoStart={!isTourCompleted} onComplete={markTourCompleted} />
      <PulseAssistantDock />

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
        whatsappStatus={{
          ...whatsappStatus,
          connectedPhoneNumber: officialApiSession?.phoneNumber || whatsappStatus.connectedPhoneNumber || null,
          connectedOwnerName: officialApiSession?.ownerName || whatsappStatus.connectedOwnerName || null,
          status: officialApiStatus,
          selectedSessionLabel: officialApiSession?.label || null,
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {user?.isImpersonation && (
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-black">
            <span className="animate-pulse">⚠️</span> ADMIN VIEW: Impersonating {user.email}
          </div>
        )}
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b-[0.5px] border-[color:var(--border)] bg-[rgba(13,17,23,0.92)] px-4 py-3 backdrop-blur-xl sm:px-6 lg:h-16 lg:flex-nowrap lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] lg:hidden"
              aria-label="Open navigation"
            >
              <MenuIcon className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 flex-col">
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)]">Workspace</p>
              <h1 className="truncate text-[13px] font-bold uppercase tracking-[0.04em] text-[var(--text-primary)] sm:text-[14px]">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:gap-4 lg:w-auto">
            <div className="flex items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1">
              <div className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">System Live</span>
            </div>
            {subscription ? (
              <div className="flex items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{planLabel}</span>
                {typeof subscription.trial_days_remaining === 'number' ? (
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{subscription.trial_days_remaining}d left</span>
                ) : null}
              </div>
            ) : null}
            <div className="flex min-w-0 items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1">
              <span className={officialApiStatus === 'connected' ? 'h-2 w-2 rounded-full bg-[var(--accent)]' : officialApiStatus === 'connecting' || officialApiStatus === 'reconnecting' ? 'h-2 w-2 rounded-full bg-[var(--amber)]' : 'h-2 w-2 rounded-full bg-[var(--red)]'} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{PROPAI_API_LABEL}</span>
              <span className="max-w-[32vw] truncate text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)] sm:max-w-[160px]">
                {PROPAI_API_PHONE}
              </span>
            </div>
            {evolutionApiSession ? (
              <div className="flex min-w-0 items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1">
                <span className={evolutionApiStatus === 'connected' ? 'h-2 w-2 rounded-full bg-[var(--accent)]' : evolutionApiStatus === 'connecting' || evolutionApiStatus === 'reconnecting' ? 'h-2 w-2 rounded-full bg-[var(--amber)]' : 'h-2 w-2 rounded-full bg-[var(--red)]'} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Evolution API</span>
                <span className="max-w-[32vw] truncate text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)] sm:max-w-[160px]">
                  {evolutionApiPhone || evolutionApiStatus}
                </span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={startTour}
              className="inline-flex items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            >
              <BookOpenIcon className="h-3.5 w-3.5" />
              Take a tour
            </button>
            <div className="h-6 w-px bg-[color:var(--border)] mx-1" />
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="inline-flex items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] hover:border-[color:var(--accent-border)]"
            >
              <LogoutIcon className="h-3 w-3" />
              Sign Out
            </button>
          </div>
        </header>

        <div id="main-scroll-container" className="pulse-scrollbar flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </div>

        <LegalFooter compact />
      </main>
    </div>
  );
};
