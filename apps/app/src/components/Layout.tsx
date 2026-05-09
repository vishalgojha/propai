import React from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { LegalFooter } from './LegalFooter';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { MenuIcon, PowerIcon, LogoutIcon } from '../lib/icons';
import { useAuth } from '../context/AuthContext';

type WhatsAppSessionSummary = {
  label: string;
  ownerName?: string | null;
  phoneNumber?: string | null;
  status: 'connected' | 'connecting' | 'disconnected';
  lastSync?: string | null;
};

type WhatsAppStatusSummary = {
  status: 'connected' | 'connecting' | 'disconnected';
  connectedPhoneNumber?: string | null;
  connectedOwnerName?: string | null;
  activeCount: number;
  limit: number;
  sessions: WhatsAppSessionSummary[];
  selectedSessionLabel?: string | null;
};

const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'propai.sidebar_collapsed';
const PROPAI_ASSISTANT_WA_LINK = 'https://wa.me/917021045254';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isDisconnectingSession, setIsDisconnectingSession] = React.useState(false);
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

  const getPageTitle = (path: string) => {
    switch (path) {
      case '/dashboard': return 'Pulse Dashboard';
      case '/monitor': return 'Monitor';
      case '/inbox':
      case '/messages':
        return 'Inbox';
      case '/listings':
      case '/stream': return 'Stream';
      case '/sources':
      case '/whatsapp':
        return 'WhatsApp';
      case '/history-sync':
        return 'History Sync';
      case '/wabro':
        return 'Wabro';
      case '/pricing':
        return 'Pricing';
      case '/docs':
        return 'Docs';
      case '/team':
        return 'Team';
      case '/admin':
        return 'Admin';
      case '/aiusage':
      case '/ai-usage':
        return 'AI Usage';
      case '/agent': return 'PropAI Agent';
      case '/intelligence': return 'Intelligence';
      case '/settings': return 'Studio Settings';
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
          const sessions = Array.isArray(response.data.sessions) ? response.data.sessions : [];
          const connectedSessions = sessions.filter((session: WhatsAppSessionSummary) => session.status === 'connected');
          const preferredLabel = selectedSessionLabel && sessions.some((session: WhatsAppSessionSummary) => session.label === selectedSessionLabel)
            ? selectedSessionLabel
            : connectedSessions[0]?.label || sessions[0]?.label || null;
          const selectedSession = preferredLabel
            ? sessions.find((session: WhatsAppSessionSummary) => session.label === preferredLabel) || null
            : null;

          if (!selectedSessionLabel && preferredLabel) {
            syncSelectedSession(preferredLabel);
          }

          setWhatsappStatus({
            status: selectedSession?.status || response.data.status || 'disconnected',
            connectedPhoneNumber: selectedSession?.phoneNumber || response.data.connectedPhoneNumber || null,
            connectedOwnerName: selectedSession?.ownerName || response.data.connectedOwnerName || null,
            activeCount: response.data.activeCount || 0,
            limit: response.data.limit || 0,
            sessions,
            selectedSessionLabel: preferredLabel,
          });
        }
      } catch {
        if (!cancelled) {
          setWhatsappStatus({
            status: 'disconnected',
            connectedPhoneNumber: null,
            connectedOwnerName: null,
            activeCount: 0,
            limit: 0,
            sessions: [],
            selectedSessionLabel: null,
          });
        }
      }
  }, [selectedSessionLabel, syncSelectedSession]);

  React.useEffect(() => {
    let cancelled = false;

    void loadWhatsappStatus(cancelled);
    const interval = window.setInterval(() => {
      void loadWhatsappStatus(cancelled);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadWhatsappStatus]);

  const connectedSessions = React.useMemo(
    () => whatsappStatus.sessions.filter((session) => session.status === 'connected'),
    [whatsappStatus.sessions],
  );

  const selectedSession = React.useMemo(() => {
    if (!whatsappStatus.selectedSessionLabel) {
      return connectedSessions[0] || whatsappStatus.sessions[0] || null;
    }

    return (
      whatsappStatus.sessions.find((session) => session.label === whatsappStatus.selectedSessionLabel) ||
      connectedSessions[0] ||
      whatsappStatus.sessions[0] ||
      null
    );
  }, [connectedSessions, whatsappStatus.selectedSessionLabel, whatsappStatus.sessions]);

  const handleDisconnectSelectedSession = React.useCallback(async () => {
    if (!selectedSession?.label) {
      return;
    }

    setIsDisconnectingSession(true);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.disconnect, { label: selectedSession.label });
      if (selectedSession.label === selectedSessionLabel) {
        syncSelectedSession(null);
      }
      window.dispatchEvent(new Event('channels:refresh'));
      await loadWhatsappStatus(false);
    } catch (error) {
      console.error(handleApiError(error));
    } finally {
      setIsDisconnectingSession(false);
    }
  }, [loadWhatsappStatus, selectedSession?.label, selectedSessionLabel, syncSelectedSession]);

  return (
    <div className="flex min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] lg:h-screen lg:overflow-hidden">
      <AnimatePresence>
        {isSidebarOpen ? (
          <motion.button
            type="button"
            aria-label="Close navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"
          />
        ) : null}
      </AnimatePresence>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
        whatsappStatus={{
          ...whatsappStatus,
          connectedPhoneNumber: selectedSession?.phoneNumber || whatsappStatus.connectedPhoneNumber || null,
          connectedOwnerName: selectedSession?.ownerName || whatsappStatus.connectedOwnerName || null,
          status: selectedSession?.status || whatsappStatus.status,
          selectedSessionLabel: selectedSession?.label || whatsappStatus.selectedSessionLabel || null,
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
            <a
              href={PROPAI_ASSISTANT_WA_LINK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-colors hover:brightness-95"
            >
              Chat Assistant
            </a>
            <div className="flex min-w-0 items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1">
              <span className={selectedSession?.status === 'connected' ? 'h-2 w-2 rounded-full bg-[var(--accent)]' : selectedSession?.status === 'connecting' ? 'h-2 w-2 rounded-full bg-[var(--amber)]' : 'h-2 w-2 rounded-full bg-[var(--red)]'} />
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] sm:inline">WhatsApp</span>
              {connectedSessions.length > 1 ? (
                <select
                  value={selectedSession?.label || ''}
                  onChange={(event) => syncSelectedSession(event.target.value || null)}
                  className="max-w-[42vw] rounded-full border border-[color:var(--border)] bg-[var(--bg-base)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)] outline-none sm:max-w-[220px]"
                >
                  {connectedSessions.map((session) => (
                    <option key={session.label} value={session.label}>
                      {session.phoneNumber || session.ownerName || session.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="max-w-[42vw] truncate text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)] sm:max-w-[220px]">
                  {selectedSession?.phoneNumber || whatsappStatus.connectedPhoneNumber || (whatsappStatus.activeCount > 0 ? `${whatsappStatus.activeCount} connected` : 'Disconnected')}
                </span>
              )}
            </div>
            {selectedSession?.status === 'connected' ? (
              <button
                type="button"
                onClick={() => void handleDisconnectSelectedSession()}
                disabled={isDisconnectingSession}
                className="inline-flex items-center gap-2 rounded-[20px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:text-[var(--red)] disabled:opacity-50"
              >
                <PowerIcon className="h-3.5 w-3.5" />
                {isDisconnectingSession ? 'Disconnecting' : 'Disconnect'}
              </button>
            ) : null}
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

        <div className="pulse-scrollbar flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="p-4 sm:p-6 lg:p-8"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        <LegalFooter compact />
      </main>
    </div>
  );
};
