import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Building2,
  Info,
  Loader2,
  MessageSquare,
  Phone,
  Power,
  QrCode,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { track } from '../services/analytics';
import { PROPAI_ASSISTANT_NUMBER, PROPAI_ASSISTANT_WA_LINK, PROPAI_ASSISTANT_PHONE_DIGITS, PROPAI_PLAN_CARDS } from '../lib/propai';

type WhatsappSession = {
  label: string;
  ownerName?: string | null;
  phoneNumber?: string | null;
  status: 'connected' | 'connecting' | 'disconnected';
  sessionData?: {
    parseDirectMessages?: boolean;
    parse_direct_messages?: boolean;
    selfChatEnabled?: boolean;
    self_chat_enabled?: boolean;
  } | null;
  lastSync?: string;
};

type WhatsappStatus = {
  status: 'connected' | 'connecting' | 'disconnected';
  activeCount: number;
  limit: number;
  plan: string;
  connectedPhoneNumber?: string | null;
  connectedOwnerName?: string | null;
  sessions: WhatsappSession[];
};

type Profile = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  phoneVerified?: boolean;
};

type ConnectionArtifact = {
  mode: 'qr' | 'pairing';
  format: 'text';
  value: string;
};

type ConnectWhatsAppResponse = {
  message?: string;
  label?: string;
  artifact?: ConnectionArtifact | null;
  qr?: string | null;
  pairingCode?: string | null;
  connected?: boolean;
  mode?: 'qr' | 'pairing' | 'connected';
};

type GetQrResponse = {
  ready?: boolean;
  artifact?: ConnectionArtifact | null;
  qr?: string | null;
  label?: string;
  message?: string;
};

type WhatsappLogRecord = {
  id: string;
  sender: string;
  message: string;
  timestamp: string;
  remoteJid: string;
};

type WhatsappHealthSession = {
  sessionLabel: string;
  phoneNumber?: string | null;
  ownerName?: string | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  connectedAt?: string | null;
  lastSeenAt?: string | null;
  lastGroupSyncAt?: string | null;
  groupCount: number;
  activeGroups24h: number;
  messagesReceived24h: number;
  messagesParsed24h: number;
  messagesFailed24h: number;
  lastInboundMessageAt?: string | null;
  lastParsedMessageAt?: string | null;
  lastParserErrorAt?: string | null;
  parserSuccessRate: number;
  healthState: 'healthy' | 'warning' | 'critical';
};

type WhatsappHealthSummary = {
  groupCount: number;
  activeGroups24h: number;
  messagesReceived24h: number;
  messagesParsed24h: number;
  messagesFailed24h: number;
  parserSuccessRate: number;
  healthState: 'healthy' | 'warning' | 'critical';
};

type WhatsappHealthResponse = {
  sessions: WhatsappHealthSession[];
  summary: WhatsappHealthSummary;
};

type WhatsappGroupHealth = {
  id: string;
  sessionLabel: string;
  groupId: string;
  groupName: string;
  lastGroupSyncAt?: string | null;
  lastMessageAt?: string | null;
  lastParsedAt?: string | null;
  messagesReceived24h: number;
  messagesParsed24h: number;
  messagesFailed24h: number;
  status: 'active' | 'quiet' | 'stale' | 'error';
};

type WhatsappEventRecord = {
  id: string;
  sessionLabel: string;
  eventType: string;
  message: string;
  createdAt: string;
};

type WhatsappGroupOption = {
  id: string;
  name: string;
  locality?: string | null;
  city?: string | null;
  category?: string | null;
  tags?: string[];
  broadcastEnabled?: boolean;
  behavior?: string;
  participantsCount: number;
  lastActiveAt?: string | null;
};

type OutboundRecipient = {
  id: string;
  name: string;
  phone: string;
  remoteJid: string;
  locality?: string | null;
  source?: string | null;
  priorityBucket?: string | null;
  dueAt?: string | null;
  latestAt?: string | null;
};

const whatsappCapabilities = [
  {
    title: 'Broadcast to groups, brokers, and leads',
    copy: 'Run one message across named WhatsApp groups, broker contacts, and buyer follow-ups from a single control surface.',
  },
  {
    title: 'Send with pace controls and live status',
    copy: 'Choose a safe sending mode, watch the live progress counters, and see success or failure before the batch finishes.',
  },
  {
    title: 'Work from saved lists instead of raw phone books',
    copy: 'Filter by locality, tags, and contact buckets so outreach stays intentional instead of messy.',
  },
  {
    title: 'Stay inside the PropAI workspace',
    copy: 'Use the same account, same session, and same billing state as the rest of app.propai.live.',
  },
];

const normalizePhoneNumber = (value: string) => value.split('').filter(c => c >= '0' && c <= '9').join('');
const isGroupParsingEnabled = (behavior?: string | null) => behavior === 'Listen' || behavior === 'AutoReply';

const buildSessionLabel = (ownerName?: string, phoneNumber?: string) => {
  const raw = `${ownerName || 'Owner'}-${phoneNumber || 'device'}`;
  const result = raw.toLowerCase().split('').reduce((current, c) => {
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) return current + c;
    if (!current || current.endsWith('-')) return current;
    return `${current}-`;
  }, '').replace(/^-+|-+$/g, '');
  return result.slice(0, 60) || 'owner-device';
};

const QR_FRESHNESS_SECONDS = 45;
const QR_POLL_ATTEMPTS = 90;
const QR_POLL_INTERVAL_MS = 1000;
const MARKETING_AGENT_PHONE = PROPAI_ASSISTANT_PHONE_DIGITS;
const ACTIVE_SESSION_STORAGE_KEY = 'propai.active_whatsapp_session';

const defaultHealthSummary: WhatsappHealthSummary = {
  groupCount: 0,
  activeGroups24h: 0,
  messagesReceived24h: 0,
  messagesParsed24h: 0,
  messagesFailed24h: 0,
  parserSuccessRate: 100,
  healthState: 'warning',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'No activity yet';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'No activity yet' : parsed.toLocaleString();
};

const getHealthTone = (state: WhatsappHealthSummary['healthState'] | WhatsappHealthSession['healthState'] | WhatsappGroupHealth['status']) => {
  switch (state) {
    case 'healthy':
    case 'active':
      return 'bg-[rgba(37,211,102,0.12)] text-[var(--accent)]';
    case 'critical':
    case 'error':
      return 'bg-[rgba(239,68,68,0.1)] text-[var(--red)]';
    default:
      return 'bg-[rgba(245,158,11,0.12)] text-[var(--amber)]';
  }
};

const sourcePrimaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] shadow-[0_10px_28px_rgba(37,211,102,0.18)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-95 disabled:opacity-50 disabled:hover:translate-y-0';
const sourceSecondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-all duration-150 hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';
const sourcePill =
  'inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]';
const sourceFieldClassName =
  'w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 focus:border-[color:var(--accent)] focus:bg-[var(--bg-hover)]';

export const Sources: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'setup' | 'outbound' | 'pricing' | 'logs'>(
    location.pathname === '/pricing' ? 'pricing' : 'setup',
  );
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [deviceOwnerName, setDeviceOwnerName] = useState('');
  const [devicePhoneNumber, setDevicePhoneNumber] = useState('');
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionArtifact, setConnectionArtifact] = useState<ConnectionArtifact | null>(null);
  const [renderedQrMarkup, setRenderedQrMarkup] = useState<string | null>(null);
  const [qrGeneratedAt, setQrGeneratedAt] = useState<number | null>(null);
  const [qrTimeLeft, setQrTimeLeft] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [logs, setLogs] = useState<WhatsappLogRecord[]>([]);
  const [health, setHealth] = useState<WhatsappHealthResponse>({ sessions: [], summary: defaultHealthSummary });
  const [groupHealth, setGroupHealth] = useState<WhatsappGroupHealth[]>([]);
  const [eventLogs, setEventLogs] = useState<WhatsappEventRecord[]>([]);
  const [outboundGroups, setOutboundGroups] = useState<WhatsappGroupOption[]>([]);
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [outboundSessionKey, setOutboundSessionKey] = useState('');
  const [brokerRecipients, setBrokerRecipients] = useState<OutboundRecipient[]>([]);
  const [leadRecipients, setLeadRecipients] = useState<OutboundRecipient[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [groupOutboundText, setGroupOutboundText] = useState('');
  const [brokerOutboundText, setBrokerOutboundText] = useState('');
  const [leadOutboundText, setLeadOutboundText] = useState('');
  const [parseDirectMessages, setParseDirectMessages] = useState(false);
  const [selfChatEnabled, setSelfChatEnabled] = useState(false);
  const [isSavingParsingPrefs, setIsSavingParsingPrefs] = useState(false);
  const [isLoadingOutbound, setIsLoadingOutbound] = useState(false);
  const [outboundFeedback, setOutboundFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [savingGroupBehavior, setSavingGroupBehavior] = useState<Record<string, boolean>>({});
  const [sendState, setSendState] = useState<{ groups: boolean; brokers: boolean; leads: boolean }>({
    groups: false,
    brokers: false,
    leads: false,
  });
  const [pendingConnection, setPendingConnection] = useState<{
    label: string;
    ownerName: string;
    phoneNumber: string;
  } | null>(null);
  const [status, setStatus] = useState<WhatsappStatus>({
    status: 'disconnected',
    activeCount: 0,
    limit: 2,
    plan: 'Trial',
    sessions: [],
  });
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = useMemo(() => normalizePhoneNumber(phoneNumber), [phoneNumber]);
  const normalizedDevicePhone = useMemo(() => normalizePhoneNumber(devicePhoneNumber), [devicePhoneNumber]);
  const expectedSessionLabel = useMemo(
    () => buildSessionLabel(deviceOwnerName || 'Owner', normalizedDevicePhone || 'device'),
    [deviceOwnerName, normalizedDevicePhone],
  );
  const activeSessionLabel = pendingConnection?.label || expectedSessionLabel;
  const activeConnectionPhone = pendingConnection?.phoneNumber || normalizedDevicePhone;
  const activeConnectionOwnerName = pendingConnection?.ownerName || deviceOwnerName;
  const currentSession = useMemo(() => {
    const exactMatch = status.sessions.find((session) => session.label === activeSessionLabel);
    if (exactMatch) return exactMatch;

    const phoneMatch = activeConnectionPhone
      ? status.sessions.find((session) => normalizePhoneNumber(session.phoneNumber || '') === activeConnectionPhone)
      : null;
    if (phoneMatch) return phoneMatch;

    if (status.connectedPhoneNumber && activeConnectionPhone && normalizePhoneNumber(status.connectedPhoneNumber) === activeConnectionPhone) {
      return {
        label: activeSessionLabel,
        ownerName: activeConnectionOwnerName || status.connectedOwnerName || 'Broker device',
        phoneNumber: status.connectedPhoneNumber,
        status: 'connected' as const,
      };
    }

    return null;
  }, [activeConnectionOwnerName, activeConnectionPhone, activeSessionLabel, status.connectedOwnerName, status.connectedPhoneNumber, status.sessions]);
  const currentSessionStatus = currentSession?.status || (pendingConnection || connectionArtifact ? 'connecting' : 'disconnected');
  const artifactValue = connectionArtifact?.value || null;
  const artifactMode = connectionArtifact?.mode || null;
  const currentSessionParseDirectMessages = Boolean(
    currentSession?.sessionData?.parseDirectMessages ?? currentSession?.sessionData?.parse_direct_messages,
  );
  const currentSessionSelfChatEnabled = Boolean(
    currentSession?.sessionData?.selfChatEnabled ?? currentSession?.sessionData?.self_chat_enabled,
  );
  const isAtDeviceLimit = status.activeCount >= status.limit && !currentSession;
  const primaryConnectedSession = useMemo(
    () => status.sessions.find((session) => session.status === 'connected') || null,
    [status.sessions],
  );
  const connectedSenderSessions = useMemo(
    () => status.sessions.filter((session) => session.status === 'connected'),
    [status.sessions],
  );
  const marketingSession = useMemo(
    () => connectedSenderSessions.find((session) => normalizePhoneNumber(session.phoneNumber || '') === MARKETING_AGENT_PHONE) || null,
    [connectedSenderSessions],
  );

  const demoMode = (import.meta as any).env.VITE_WHATSAPP_DEMO_MODE === 'true';

  useEffect(() => {
    setActiveTab((current) => {
      if (location.pathname === '/pricing') {
        return 'pricing';
      }

      return current === 'pricing' ? 'setup' : current;
    });
  }, [location.pathname]);

  const fetchProfile = useCallback(async () => {
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.profile);
      const profile = response.data?.profile as Profile | undefined;
      if (profile) {
        const nextName = profile.fullName || '';
        const nextPhone = profile.phone || '';
        setFullName(nextName);
        setPhoneNumber(nextPhone);
        setDeviceOwnerName((current) => current || nextName);
        setDevicePhoneNumber((current) => current || nextPhone);
      }
    } catch (err) {
      console.error(handleApiError(err));
    } finally {
      setProfileLoaded(true);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.status);
      if (response.data) {
        setStatus({
          status: response.data.status || 'disconnected',
          activeCount: response.data.activeCount || 0,
          limit: response.data.limit || 2,
          plan: response.data.plan || 'Trial',
          connectedPhoneNumber: response.data.connectedPhoneNumber || null,
          connectedOwnerName: response.data.connectedOwnerName || null,
          sessions: response.data.sessions || response.data.sessions || [],
        });
      }
    } catch (err) {
      console.error(handleApiError(err));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.messages);
      const nextLogs = (Array.isArray(response.data) ? response.data : [])
        .map((entry: any, index: number) => ({
          id: String(entry.id || `log-${index}`),
          sender: String(entry.sender || entry.remote_jid || 'Unknown'),
          message: String(entry.message_text || entry.text || '').trim(),
          timestamp: String(entry.timestamp || entry.created_at || ''),
          remoteJid: String(entry.remote_jid || ''),
        }))
        .filter((entry: WhatsappLogRecord) => entry.message)
        .slice(-30)
        .reverse();

      setLogs(nextLogs);
    } catch (err) {
      console.error(handleApiError(err));
      setLogs([]);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const [healthResponse, groupResponse, eventResponse] = await Promise.all([
        backendApi.get(ENDPOINTS.whatsapp.health),
        backendApi.get(ENDPOINTS.whatsapp.groupsHealth),
        backendApi.get(ENDPOINTS.whatsapp.events),
      ]);

      setHealth({
        sessions: Array.isArray(healthResponse.data?.sessions) ? healthResponse.data.sessions : [],
        summary: healthResponse.data?.summary || defaultHealthSummary,
      });
      setGroupHealth(Array.isArray(groupResponse.data) ? groupResponse.data : []);
      setEventLogs(Array.isArray(eventResponse.data) ? eventResponse.data : []);
    } catch (err) {
      console.error(handleApiError(err));
      setHealth({ sessions: [], summary: defaultHealthSummary });
      setGroupHealth([]);
      setEventLogs([]);
    }
  }, []);

  const fetchOutboundWorkspace = useCallback(async () => {
    setIsLoadingOutbound(true);
    try {
      const [groupsResponse, recipientsResponse] = await Promise.all([
        backendApi.get(ENDPOINTS.whatsapp.groups),
        backendApi.get(ENDPOINTS.whatsapp.recipients),
      ]);

      setOutboundGroups(Array.isArray(groupsResponse.data) ? groupsResponse.data : []);
      setBrokerRecipients(Array.isArray(recipientsResponse.data?.brokers) ? recipientsResponse.data.brokers : []);
      setLeadRecipients(Array.isArray(recipientsResponse.data?.leads) ? recipientsResponse.data.leads : []);
    } catch (err) {
      console.error(handleApiError(err));
      setOutboundGroups([]);
      setBrokerRecipients([]);
      setLeadRecipients([]);
    } finally {
      setIsLoadingOutbound(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchStatus();
    fetchLogs();
    fetchHealth();
  }, [fetchHealth, fetchLogs, fetchProfile, fetchStatus]);

  useEffect(() => {
    setOutboundSessionKey((current) => {
      const storedLabel = (() => {
        try {
          return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        } catch {
          return null;
        }
      })();

      if (storedLabel && connectedSenderSessions.some((session) => session.label === storedLabel)) {
        return storedLabel;
      }

      if (current && connectedSenderSessions.some((session) => session.label === current)) {
        return current;
      }

      return marketingSession?.label || primaryConnectedSession?.label || connectedSenderSessions[0]?.label || '';
    });
  }, [connectedSenderSessions, marketingSession, primaryConnectedSession]);

  useEffect(() => {
    const handleSelectedSession = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string | null }>).detail;
      const label = detail?.label;
      if (!label) return;

      const session = status.sessions.find((entry) => entry.label === label);
      if (!session) return;

      setDeviceOwnerName(session.ownerName || fullName || '');
      setDevicePhoneNumber(session.phoneNumber || '');
      setPendingConnection(null);
      setPairingArtifact(null);
      setConnectionArtifactType(null);
      setQrGeneratedAt(null);
      setQrTimeLeft(0);
      setError(null);
      if (session.status === 'connected') {
        setOutboundSessionKey(session.label);
      }
    };

    window.addEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    return () => {
      window.removeEventListener('whatsapp:selected-session', handleSelectedSession as EventListener);
    };
  }, [fullName, status.sessions]);

  useEffect(() => {
    if (currentSessionStatus === 'connected') {
      setPendingConnection(null);
      setConnectionArtifact(null);
      setQrGeneratedAt(null);
      setQrTimeLeft(0);
      setIsConnecting(false);
      setError(null);
    }
  }, [currentSessionStatus]);

  useEffect(() => {
    setParseDirectMessages(currentSessionParseDirectMessages);
  }, [currentSessionParseDirectMessages, currentSession?.label]);

  useEffect(() => {
    setSelfChatEnabled(currentSessionSelfChatEnabled);
  }, [currentSessionSelfChatEnabled, currentSession?.label]);

  useEffect(() => {
    if (!artifactValue || currentSessionStatus === 'connected') {
      setQrTimeLeft(0);
      return undefined;
    }

    const updateTimeLeft = () => {
      const startedAt = qrGeneratedAt ?? Date.now();
      const expiresAt = startedAt + QR_FRESHNESS_SECONDS * 1000;
      const nextTimeLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setQrTimeLeft(nextTimeLeft);
    };

    updateTimeLeft();
    const interval = window.setInterval(updateTimeLeft, 1000);

    return () => window.clearInterval(interval);
  }, [artifactValue, currentSessionStatus, qrGeneratedAt]);

  useEffect(() => {
    if (!artifactValue && status.status !== 'connecting') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void fetchStatus();
    }, currentSessionStatus === 'connected' ? 15000 : 4000);

    return () => window.clearInterval(interval);
  }, [artifactValue, currentSessionStatus, fetchStatus, status.status]);

  const selectTab = (tab: 'setup' | 'outbound' | 'pricing' | 'logs') => {
    setActiveTab(tab);
    if (tab === 'pricing') {
      navigate('/pricing');
      return;
    }

    if (location.pathname === '/pricing') {
      navigate('/whatsapp');
    }

    if (tab === 'logs') {
      void fetchLogs();
      void fetchHealth();
    }
  };

  const ensureConnectUiVisible = useCallback(() => {
    if (location.pathname === '/pricing') {
      navigate('/whatsapp');
    }
    if (activeTab !== 'setup') {
      setActiveTab('setup');
    }
  }, [activeTab, location.pathname, navigate]);

  useEffect(() => {
    if (searchParams.get('connect') === '1') {
      ensureConnectUiVisible();
      void handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if ((isConnecting && artifactMode) || artifactValue) {
      ensureConnectUiVisible();
    }
  }, [artifactMode, artifactValue, ensureConnectUiVisible, isConnecting]);

  useEffect(() => {
    let cancelled = false;

    const renderQr = async () => {
      const artifact = artifactValue?.trim() || '';

      if (!artifact || artifactMode !== 'qr') {
        setRenderedQrMarkup(null);
        return;
      }

      try {
        const { default: QRCode } = await import('qrcode');
        const svgMarkup = await QRCode.toString(artifact, {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 420,
          color: {
            dark: '#111827',
            light: '#ffffff',
          },
        });

        if (!cancelled) {
          setRenderedQrMarkup(svgMarkup);
        }
      } catch (error) {
        console.error('Failed to render WhatsApp QR locally', error);
        if (!cancelled) {
          setRenderedQrMarkup(null);
        }
      }
    };

    void renderQr();

    return () => {
      cancelled = true;
    };
  }, [artifactMode, artifactValue]);

  useEffect(() => {
    if (activeTab === 'outbound') {
      void fetchOutboundWorkspace();
    }
  }, [activeTab, fetchOutboundWorkspace]);


  const handleConnectWrapper = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    ensureConnectUiVisible();

    const nameToUse = deviceOwnerName || fullName;
    const phoneToUse = devicePhoneNumber || phoneNumber;
    const normalizedPhone = normalizePhoneNumber(phoneToUse);

    if (!nameToUse.trim() || normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      setError('Enter your name and WhatsApp number first.');
      return;
    }

    // Save profile first
    try {
      await backendApi.post(ENDPOINTS.whatsapp.profile, {
        fullName: nameToUse,
        phone: normalizedPhone,
      });
      setFullName(nameToUse);
      setPhoneNumber(normalizedPhone);
    } catch (err) {
      setError(handleApiError(err));
      return;
    }

    // Now connect using the existing handleConnect logic
    if (!deviceOwnerName && fullName) setDeviceOwnerName(fullName);
    if (!devicePhoneNumber && phoneNumber) setDevicePhoneNumber(phoneNumber);

    await handleConnect('qr', { ownerName: nameToUse, phoneNumber: normalizedPhone });
  };

  const waitForQR = useCallback(async (label: string): Promise<ConnectionArtifact | null> => {
    for (let attempt = 0; attempt < QR_POLL_ATTEMPTS; attempt += 1) {
      try {
        const response = await backendApi.get<GetQrResponse>(ENDPOINTS.whatsapp.qr, {
          params: { label },
        });

        if (
          response.data?.ready === true &&
          !response.data?.artifact &&
          String(response.data?.message || '').toLowerCase().includes('already connected')
        ) {
          return null;
        }

        if (!response.data?.artifact) {
          if (attempt === QR_POLL_ATTEMPTS - 1) {
            throw new Error('QR code is taking longer than expected. Try once more in a few seconds.');
          }
          await new Promise((resolve) => window.setTimeout(resolve, QR_POLL_INTERVAL_MS));
          continue;
        }

        return response.data.artifact;
      } catch (err) {
        const message = handleApiError(err);
        const isStillPreparing =
          message === 'QR code is still being generated.' ||
          message === 'Code not ready yet';

        if (isStillPreparing && attempt < QR_POLL_ATTEMPTS - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, QR_POLL_INTERVAL_MS));
          continue;
        }

        if (attempt === QR_POLL_ATTEMPTS - 1) throw err;
        await new Promise((resolve) => window.setTimeout(resolve, QR_POLL_INTERVAL_MS));
      }
    }

    throw new Error('QR code is taking longer than expected. Try once more in a few seconds.');
  }, []);

  const handleConnect = useCallback(async (
    mode: 'qr' | 'pairing' = 'qr',
    values?: { ownerName?: string; phoneNumber?: string },
  ) => {
    ensureConnectUiVisible();
    const ownerNameToUse = values?.ownerName ?? deviceOwnerName;
    const phoneNumberToUse = values?.phoneNumber ?? normalizedDevicePhone;
    const sessionLabelToUse = buildSessionLabel(ownerNameToUse || 'Owner', phoneNumberToUse || 'device');
    const sessionForLabel = status.sessions.find((session) => session.label === sessionLabelToUse);

    if (!ownerNameToUse.trim() || phoneNumberToUse.length < 10 || phoneNumberToUse.length > 15) {
      setError('Enter the device owner name and WhatsApp number you want to connect first.');
      return;
    }

    if (status.activeCount >= status.limit && !sessionForLabel) {
      setError(`Your ${status.plan} workspace allows ${status.limit} WhatsApp ${status.limit === 1 ? 'number' : 'numbers'}. Disconnect one before connecting another.`);
      return;
    }

    setPendingConnection({
      label: sessionLabelToUse,
      ownerName: ownerNameToUse,
      phoneNumber: phoneNumberToUse,
    });
    if (demoMode) {
      setIsConnecting(true);
      setScanProgress(0);
      setConnectionArtifact({
        mode: 'qr',
        format: 'text',
        value: `WA:${phoneNumberToUse}:${ownerNameToUse}`,
      });
      const interval = window.setInterval(() => {
        setScanProgress((current) => {
          const next = current + 14;
          if (next >= 100) {
            window.clearInterval(interval);
            return 100;
          }
          return next;
        });
      }, 180);

      window.setTimeout(() => {
        setQrGeneratedAt(Date.now());
        setQrTimeLeft(QR_FRESHNESS_SECONDS);
        setStatus((current) => ({ ...current, status: 'connecting' }));
        setIsConnecting(false);
      }, 1200);

      return;
    }

    setIsConnecting(true);
    setError(null);
    setScanProgress(0);
    setConnectionArtifact(null);
    setQrGeneratedAt(null);
    setQrTimeLeft(0);
    try {
      const response = await backendApi.post<ConnectWhatsAppResponse>(ENDPOINTS.whatsapp.connect, {
        phoneNumber: phoneNumberToUse,
        ownerName: ownerNameToUse,
        label: sessionLabelToUse,
        connectMethod: mode,
      });
      track(mode === 'pairing' ? 'whatsapp_pairing_connect_clicked' : 'whatsapp_qr_connect_clicked', {
        plan: status.plan,
        device_limit: status.limit,
      });
      if (response.data?.connected) {
        setPendingConnection(null);
        setConnectionArtifact(null);
        setQrGeneratedAt(null);
        setQrTimeLeft(0);
      } else {
        const nextArtifact = response.data?.artifact || (mode === 'qr'
          ? await waitForQR(response.data?.label || sessionLabelToUse)
          : null);
        if (nextArtifact) {
          setConnectionArtifact(nextArtifact);
          setQrGeneratedAt(Date.now());
          setQrTimeLeft(QR_FRESHNESS_SECONDS);
        } else {
          setConnectionArtifact(null);
          setQrGeneratedAt(null);
          setQrTimeLeft(0);
        }
      }
      await fetchStatus();
    } catch (err) {
      setPendingConnection(null);
      setError(handleApiError(err));
    } finally {
      setIsConnecting(false);
    }
  }, [deviceOwnerName, ensureConnectUiVisible, fetchStatus, normalizedDevicePhone, status.activeCount, status.limit, status.plan, status.sessions, waitForQR]);

  const handleDisconnect = async (label?: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.disconnect, { label });
      track('whatsapp_disconnected', {
        label: label || currentSession?.label || 'unknown',
      });
      setConnectionArtifact(null);
      setQrGeneratedAt(null);
      setQrTimeLeft(0);
      setPendingConnection(null);
      await fetchStatus();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveParsingPreferences = async () => {
    if (!currentSession?.label) {
      setError('Connect a WhatsApp session first.');
      return;
    }

    setIsSavingParsingPrefs(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.config, {
        session_label: currentSession.label,
        parse_direct_messages: parseDirectMessages,
        self_chat_enabled: selfChatEnabled,
      });
      await fetchStatus();
      await fetchLogs();
      await fetchHealth();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSavingParsingPrefs(false);
    }
  };

  const handleAddAnotherNumber = () => {
    setDeviceOwnerName(fullName || '');
    setDevicePhoneNumber('');
    setPendingConnection(null);
    setConnectionArtifact(null);
    setQrGeneratedAt(null);
    setQrTimeLeft(0);
    setError(null);
  };

  const handleSelectExistingSession = (session: WhatsappSession) => {
    setDeviceOwnerName(session.ownerName || fullName || '');
    setDevicePhoneNumber(session.phoneNumber || '');
    setPendingConnection(null);
    setConnectionArtifact(null);
    setQrGeneratedAt(null);
    setQrTimeLeft(0);
    setError(null);
    try {
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.label);
    } catch {
      // Ignore storage failures.
    }
    window.dispatchEvent(new CustomEvent('whatsapp:selected-session', { detail: { label: session.label } }));
  };

  const toggleSelection = (current: string[], id: string) => (
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );

  const handleSetGroupParsing = async (groupId: string, enabled: boolean) => {
    setSavingGroupBehavior((current) => ({ ...current, [groupId]: true }));
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.config, {
        group_id: groupId,
        behavior: enabled ? 'Listen' : 'Off',
      });
      setOutboundGroups((current) => current.map((group) => (
        group.id === groupId ? { ...group, behavior: enabled ? 'Listen' : 'Off' } : group
      )));
      track('whatsapp_group_parsing_toggled', { enabled, group_id: groupId });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSavingGroupBehavior((current) => ({ ...current, [groupId]: false }));
    }
  };

  const handleBulkSetGroupParsing = async (enabled: boolean) => {
    if (filteredOutboundGroups.length === 0) {
      setOutboundFeedback({ tone: 'error', message: 'No groups found to update.' });
      return;
    }

    setOutboundFeedback(null);
    setError(null);
    const groupIds = filteredOutboundGroups.map((group) => group.id);
    setSavingGroupBehavior((current) => ({
      ...current,
      ...Object.fromEntries(groupIds.map((id) => [id, true])),
    }));

    try {
      await Promise.all(groupIds.map((groupId) => backendApi.post(ENDPOINTS.whatsapp.config, {
        group_id: groupId,
        behavior: enabled ? 'Listen' : 'Off',
      })));
      setOutboundGroups((current) => current.map((group) => (
        groupIds.includes(group.id) ? { ...group, behavior: enabled ? 'Listen' : 'Off' } : group
      )));
      setOutboundFeedback({ tone: 'success', message: `${enabled ? 'Enabled' : 'Paused'} parsing for ${groupIds.length} group${groupIds.length === 1 ? '' : 's'}.` });
      track('whatsapp_group_parsing_bulk_toggled', { enabled, count: groupIds.length });
    } catch (err) {
      setOutboundFeedback({ tone: 'error', message: handleApiError(err) });
    } finally {
      setSavingGroupBehavior((current) => ({
        ...current,
        ...Object.fromEntries(groupIds.map((id) => [id, false])),
      }));
    }
  };

  const handleSendGroups = async () => {
    if (!outboundSessionKey) {
      setOutboundFeedback({ tone: 'error', message: 'Choose which connected WhatsApp number should send this broadcast first.' });
      return;
    }

    if (!groupOutboundText.trim() || selectedGroupIds.length === 0) {
      setOutboundFeedback({ tone: 'error', message: 'Select at least one group and write a message first.' });
      return;
    }

    setSendState((current) => ({ ...current, groups: true }));
    setOutboundFeedback(null);
    try {
      const response = await backendApi.post(ENDPOINTS.whatsapp.broadcast, {
        groupJids: selectedGroupIds,
        text: groupOutboundText.trim(),
        sessionKey: outboundSessionKey || undefined,
      });
      setOutboundFeedback({
        tone: 'success',
        message: `Sent to ${response.data?.sent ?? selectedGroupIds.length} group${selectedGroupIds.length === 1 ? '' : 's'}.`,
      });
      setGroupOutboundText('');
      setSelectedGroupIds([]);
    } catch (err) {
      setOutboundFeedback({ tone: 'error', message: handleApiError(err) });
    } finally {
      setSendState((current) => ({ ...current, groups: false }));
    }
  };

  const handleSendDirect = async (mode: 'brokers' | 'leads') => {
    if (!outboundSessionKey) {
      setOutboundFeedback({ tone: 'error', message: 'Choose which connected WhatsApp number should send this outreach first.' });
      return;
    }

    const selectedIds = mode === 'brokers' ? selectedBrokerIds : selectedLeadIds;
    const message = mode === 'brokers' ? brokerOutboundText : leadOutboundText;
    const recipients = (mode === 'brokers' ? brokerRecipients : leadRecipients).filter((recipient) => selectedIds.includes(recipient.id));

    if (!message.trim() || recipients.length === 0) {
      setOutboundFeedback({ tone: 'error', message: `Select at least one ${mode === 'brokers' ? 'broker' : 'lead'} and write a message first.` });
      return;
    }

    setSendState((current) => ({ ...current, [mode]: true }));
    setOutboundFeedback(null);
    try {
      const response = await backendApi.post(ENDPOINTS.whatsapp.sendBulk, {
        recipients: recipients.map((recipient) => ({
          remoteJid: recipient.remoteJid,
          phone: recipient.phone,
          name: recipient.name,
          label: recipient.name,
        })),
        text: message.trim(),
        sessionKey: outboundSessionKey || undefined,
      });

      const sentCount = Array.isArray(response.data?.sent) ? response.data.sent.length : recipients.length;
      const failedCount = Array.isArray(response.data?.failed) ? response.data.failed.length : 0;
      setOutboundFeedback({
        tone: failedCount === 0 ? 'success' : 'error',
        message: failedCount === 0
          ? `Sent to ${sentCount} ${mode === 'brokers' ? 'broker' : 'lead'} contact${sentCount === 1 ? '' : 's'}.`
          : `Sent to ${sentCount} contact${sentCount === 1 ? '' : 's'} and ${failedCount} failed.`,
      });

      if (mode === 'brokers') {
        setBrokerOutboundText('');
        setSelectedBrokerIds([]);
      } else {
        setLeadOutboundText('');
        setSelectedLeadIds([]);
      }
    } catch (err) {
      setOutboundFeedback({ tone: 'error', message: handleApiError(err) });
    } finally {
      setSendState((current) => ({ ...current, [mode]: false }));
    }
  };

  const displayConnectedNumber = status.connectedPhoneNumber || 'Not connected';
  const displayConnectedName = status.connectedOwnerName || fullName || 'Broker device';
  const displaySelectedDeviceNumber = currentSession?.phoneNumber || pendingConnection?.phoneNumber || devicePhoneNumber || 'Not connected';
  const displaySelectedDeviceName = currentSession?.ownerName || pendingConnection?.ownerName || deviceOwnerName || 'Broker device';
  const isCurrentSessionConnected = currentSessionStatus === 'connected';
  const isCurrentSessionConnecting = currentSessionStatus === 'connecting';
  const displayCurrentConnectionNumber = isCurrentSessionConnected ? displayConnectedNumber : displaySelectedDeviceNumber;
  const displayCurrentConnectionName = isCurrentSessionConnected ? displayConnectedName : displaySelectedDeviceName;
  const selectedOutboundSession = connectedSenderSessions.find((session) => session.label === outboundSessionKey) || null;
  const outboundSenderDescription = selectedOutboundSession
    ? normalizePhoneNumber(selectedOutboundSession.phoneNumber || '') === MARKETING_AGENT_PHONE
      ? 'Marketing agent lane'
      : 'Broker-connected lane'
    : 'No sender selected';
  const filteredOutboundGroups = useMemo(() => {
    const query = groupSearchTerm.trim().toLowerCase();
    if (!query) return outboundGroups;

    return outboundGroups.filter((group) => {
      const haystack = [
        group.name,
        group.locality,
        group.city,
        group.category,
        ...(group.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [groupSearchTerm, outboundGroups]);
  const disconnectTargetLabel = currentSession?.label || primaryConnectedSession?.label || null;
  const isQrExpired = Boolean(artifactValue) && qrTimeLeft === 0 && !isCurrentSessionConnected;
  const showConnectionArtifactPanel = Boolean(artifactValue) || (isConnecting && Boolean(artifactMode) && !isCurrentSessionConnected);
  const primaryHealthSession = health.sessions[0];
  const staleGroupCount = groupHealth.filter((group) => group.status === 'stale').length;
  const activeGroupCount = groupHealth.filter((group) => group.status === 'active').length;
  const qrMarkup = artifactMode === 'qr' ? renderedQrMarkup : null;

  const planCards = PROPAI_PLAN_CARDS;

  return (
    <div className="space-y-8">
      <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              <Smartphone className="h-3.5 w-3.5" />
              WhatsApp
            </div>
            <h2 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              WhatsApp is the ingestion engine that powers Stream.
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Connect broker WhatsApp numbers here so PropAI can ingest chats, parse groups into Stream, power the monitor, run the assistant, and handle deliberate outbound outreach from the same workspace.
            </p>
          </div>

          <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Access model</p>
            <p className="mt-1 text-[14px] font-bold text-[var(--text-primary)]">{status.plan || 'Trial'}</p>
            <p className="text-[11px] text-[var(--text-secondary)]">Trial 3 days free, Solo ₹999/mo for 2 devices, Team ₹2999/mo for 5 devices</p>
            {isAtDeviceLimit ? (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-[var(--amber)]">Device limit reached for this workspace.</p>
                <button
                  type="button"
                  onClick={() => navigate('/pricing')}
                  className={cn(sourcePrimaryButton, 'px-3 py-2 text-[10px]')}
                >
                  Upgrade plan
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-1">
        {[
          { id: 'setup' as const, label: 'Setup' },
          { id: 'outbound' as const, label: 'Outbound' },
          { id: 'pricing' as const, label: 'Pricing' },
          { id: 'logs' as const, label: 'Logs' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            className={cn(
              'rounded-[10px] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-[#020f07]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Broker-controlled privacy</p>
              <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">Group parsing is on by default. Direct chats stay off until you enable them.</h3>
              <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
              Groups from the connected number are parsed unless you explicitly disable a specific group. The AI assistant on this number and 1:1 direct messages stay off until you enable them for the current connected session.
              </p>
            </div>
          <div className="flex flex-col gap-3 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">AI assistant on this number</p>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{selfChatEnabled ? 'Enabled' : 'Off'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelfChatEnabled((current) => !current)}
                className={cn(
                  'relative h-6 w-11 rounded-full border transition-colors',
                  selfChatEnabled
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent)]'
                    : 'border-[color:var(--border)] bg-[var(--bg-base)]',
                )}
                aria-pressed={selfChatEnabled}
                aria-label="Toggle AI assistant on this number"
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    selfChatEnabled ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">1:1 direct messages</p>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{parseDirectMessages ? 'Enabled' : 'Off'}</p>
              </div>
              <button
                type="button"
                onClick={() => setParseDirectMessages((current) => !current)}
                className={cn(
                  'relative h-6 w-11 rounded-full border transition-colors',
                  parseDirectMessages
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent)]'
                    : 'border-[color:var(--border)] bg-[var(--bg-base)]',
                )}
                aria-pressed={parseDirectMessages}
                aria-label="Toggle 1:1 direct message parsing"
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    parseDirectMessages ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void handleSaveParsingPreferences()}
              disabled={isSavingParsingPrefs || !currentSession?.label}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-colors hover:brightness-95 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSavingParsingPrefs ? 'Saving...' : 'Save assistant settings'}
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'outbound' ? (
        <div className="space-y-6">
          <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Manual outbound center</p>
                <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">Groups, brokers, and leads</h3>
                <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--text-secondary)]">
                  Use the same PropAI WhatsApp workspace for manual outbound sends: select recipients, choose a sender lane, and send at a human pace with nothing auto-posted.
                </p>
              </div>
              <button
                onClick={() => void fetchOutboundWorkspace()}
                className="rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                aria-label="Refresh outbound data"
              >
                <RefreshCw className={cn('h-4 w-4', isLoadingOutbound && 'animate-spin')} />
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <Users className="h-4 w-4" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Groups</p>
                </div>
                <p className="mt-2 text-[24px] font-bold text-[var(--text-primary)]">{outboundGroups.length}</p>
                <p className="text-[11px] text-[var(--text-secondary)]">Connected group targets</p>
              </div>
              <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <Building2 className="h-4 w-4" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Brokers</p>
                </div>
                <p className="mt-2 text-[24px] font-bold text-[var(--text-primary)]">{brokerRecipients.length}</p>
                <p className="text-[11px] text-[var(--text-secondary)]">Inventory-side contacts with saved numbers</p>
              </div>
              <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <UserRound className="h-4 w-4" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Leads</p>
                </div>
                <p className="mt-2 text-[24px] font-bold text-[var(--text-primary)]">{leadRecipients.length}</p>
                <p className="text-[11px] text-[var(--text-secondary)]">Buyer and follow-up contacts ready for outreach</p>
              </div>
            </div>

            {!isCurrentSessionConnected && (
              <div className="mt-4 flex flex-col gap-3 rounded-[10px] border border-[color:rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-[12px] text-[var(--amber)] md:flex-row md:items-center md:justify-between">
                <span>
                  Connect WhatsApp first. The assistant, 1:1 message controls, and group sync all stay locked until the live session is connected.
                </span>
                <button
                  type="button"
                  onClick={ensureConnectUiVisible}
                  className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#020f07] transition-colors duration-150 hover:brightness-95"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  Open setup
                </button>
              </div>
            )}

            {isCurrentSessionConnected && (
              <div className="mt-4 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Sender lane</p>
                    <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">Choose the WhatsApp number that sends outbound</h4>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                      Use the broker-connected lane for operational sends, or switch to the dedicated marketing lane when you want outreach from <span className="text-[var(--text-primary)]">{MARKETING_AGENT_PHONE}</span>.
                    </p>
                  </div>
                  <div className="w-full md:max-w-[360px]">
                    <select
                      value={outboundSessionKey}
                      onChange={(event) => setOutboundSessionKey(event.target.value)}
                      className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)]"
                    >
                      <option value="">Select sender</option>
                      {connectedSenderSessions.map((session) => {
                        const normalized = normalizePhoneNumber(session.phoneNumber || '');
                        const isMarketingLane = normalized === MARKETING_AGENT_PHONE;
                        return (
                          <option key={session.label} value={session.label}>
                            {(session.ownerName || session.label)} • {session.phoneNumber || 'No number'}{isMarketingLane ? ' • Marketing agent' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{outboundSenderDescription}</p>
                  </div>
                </div>
              </div>
            )}

            {outboundFeedback && (
              <div className={cn(
                'mt-4 rounded-[10px] border px-4 py-3 text-[12px]',
                outboundFeedback.tone === 'success'
                  ? 'border-[color:var(--accent-border)] bg-[rgba(37,211,102,0.08)] text-[var(--accent)]'
                  : 'border-[color:rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] text-[var(--red)]',
              )}>
                {outboundFeedback.message}
              </div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                  <Users className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Connected WhatsApp groups</p>
                  <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">Groups synced from this number</h4>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
                These are the WhatsApp groups synced from the connected number. Select the ones you want to message, or pause parsing for specific groups if you want them excluded from Pulse.
              </p>
              <input
                value={groupSearchTerm}
                onChange={(event) => setGroupSearchTerm(event.target.value)}
                placeholder="Search by group name, locality, category, or tag"
                className="mt-4 w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleBulkSetGroupParsing(true)}
                  disabled={!isCurrentSessionConnected || isLoadingOutbound || filteredOutboundGroups.length === 0}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-base)] disabled:opacity-50"
                >
                  <Power className="h-3.5 w-3.5" />
                  Enable parsing (filtered)
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkSetGroupParsing(false)}
                  disabled={!isCurrentSessionConnected || isLoadingOutbound || filteredOutboundGroups.length === 0}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3 py-1.5 text-[11px] font-semibold text-[var(--red)] transition-colors hover:bg-[rgba(239,68,68,0.12)] disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Pause parsing (filtered)
                </button>
              </div>
              <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                {filteredOutboundGroups.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                    No groups have synced from this connected number yet. Hit Refresh after WhatsApp is fully connected, or reconnect the number and wait for the group sync to finish.
                  </div>
                ) : (
                  filteredOutboundGroups.map((group) => (
                    <label key={group.id} className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={() => setSelectedGroupIds((current) => toggleSelection(current, group.id))}
                        className="mt-0.5 h-4 w-4 rounded border-[color:var(--border-strong)] bg-[var(--bg-base)] text-[var(--accent)] accent-[var(--accent)]"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{group.name}</p>
                          <span className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                            isGroupParsingEnabled(group.behavior)
                              ? 'border-[color:var(--accent-border)] bg-[rgba(37,211,102,0.08)] text-[var(--accent)]'
                              : 'border-[color:rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] text-[var(--red)]',
                          )}>
                            {isGroupParsingEnabled(group.behavior) ? 'Parsing on' : 'Paused'}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                          {[group.locality, group.category, `${group.participantsCount || 0} members`].filter(Boolean).join(' • ')}
                        </p>
                        {group.tags && group.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {group.tags.slice(0, 4).map((tag) => (
                              <span key={tag} className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  ))
                )}
              </div>
              <textarea
                value={groupOutboundText}
                onChange={(event) => setGroupOutboundText(event.target.value)}
                placeholder="Write the message to send into the selected groups"
                className="mt-4 min-h-[120px] w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
              />
              <button
                onClick={() => void handleSendGroups()}
                disabled={!isCurrentSessionConnected || !outboundSessionKey || sendState.groups}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-[18px] py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#020f07] transition-colors duration-150 hover:brightness-95 disabled:opacity-50"
              >
                {sendState.groups ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Send to selected groups</span>
              </button>
            </div>

            <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                  <Building2 className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Outbound to brokers</p>
                  <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">Direct inventory contacts</h4>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
                Built from saved inventory-side contacts with real phone numbers in your workspace data. Send to brokers with a natural cadence and per-session sender control.
              </p>
              <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                {brokerRecipients.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                    No broker contacts with saved WhatsApp numbers yet.
                  </div>
                ) : (
                  brokerRecipients.map((recipient) => (
                    <label key={recipient.id} className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                      <input
                        type="checkbox"
                        checked={selectedBrokerIds.includes(recipient.id)}
                        onChange={() => setSelectedBrokerIds((current) => toggleSelection(current, recipient.id))}
                        className="mt-0.5 h-4 w-4 rounded border-[color:var(--border-strong)] bg-[var(--bg-base)] text-[var(--accent)] accent-[var(--accent)]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{recipient.name}</p>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{recipient.phone}</p>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{recipient.locality || recipient.source || 'Broker contact'}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <textarea
                value={brokerOutboundText}
                onChange={(event) => setBrokerOutboundText(event.target.value)}
                placeholder="Write the message to send to selected brokers"
                className="mt-4 min-h-[120px] w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
              />
              <button
                onClick={() => void handleSendDirect('brokers')}
                disabled={!isCurrentSessionConnected || !outboundSessionKey || sendState.brokers}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-[18px] py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#020f07] transition-colors duration-150 hover:brightness-95 disabled:opacity-50"
              >
                {sendState.brokers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Send to selected brokers</span>
              </button>
            </div>

            <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                  <UserRound className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Outbound to leads</p>
                  <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">Buyer and callback contacts</h4>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
                Built from buyer requirements and the pending callback queue so you can reach back out intentionally. The tool keeps your follow-up list ready for human-paced outreach.
              </p>
              <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                {leadRecipients.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                    No lead contacts with saved WhatsApp numbers yet.
                  </div>
                ) : (
                  leadRecipients.map((recipient) => (
                    <label key={recipient.id} className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(recipient.id)}
                        onChange={() => setSelectedLeadIds((current) => toggleSelection(current, recipient.id))}
                        className="mt-0.5 h-4 w-4 rounded border-[color:var(--border-strong)] bg-[var(--bg-base)] text-[var(--accent)] accent-[var(--accent)]"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{recipient.name}</p>
                          {recipient.priorityBucket ? (
                            <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                              {recipient.priorityBucket}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{recipient.phone}</p>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          {recipient.locality || recipient.source || 'Lead contact'}
                          {recipient.dueAt ? ` · due ${new Date(recipient.dueAt).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <textarea
                value={leadOutboundText}
                onChange={(event) => setLeadOutboundText(event.target.value)}
                placeholder="Write the message to send to selected leads"
                className="mt-4 min-h-[120px] w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
              />
              <button
                onClick={() => void handleSendDirect('leads')}
                disabled={!isCurrentSessionConnected || !outboundSessionKey || sendState.leads}
                className={cn(sourcePrimaryButton, 'mt-4 w-full')}
              >
                {sendState.leads ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Send to selected leads</span>
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'pricing' ? (
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                <MessageSquare className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Plan caps</p>
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Core PropAI pricing for WhatsApp ingestion, outbound, and Stream.</h3>
              </div>
            </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {planCards.map((plan) => (
              <div key={plan.name} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">{plan.name}</p>
                <p className="mt-2 text-[24px] font-bold text-[var(--text-primary)]">{plan.price}</p>
                <p className="text-[12px] text-[var(--text-secondary)]">{plan.devices}</p>
                <p className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">{plan.blurb}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
              WhatsApp here is the main ingestion engine for PropAI. It connects broker numbers, reads inbound activity, feeds Stream, powers Monitor, gives the AI assistant live message context, and supports controlled outbound sends from the same workspace.
            </p>
          </div>

          <div className="mt-5 rounded-[12px] border border-[color:var(--accent-border)] bg-[rgba(37,211,102,0.08)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Referral program</p>
            <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
              Refer 3 brokers who complete trial and payment and your workspace gets 1 free month added to the subscription. Share the PropAI Assistant contact too: {PROPAI_ASSISTANT_NUMBER}.
            </p>
            <a href={PROPAI_ASSISTANT_WA_LINK} target="_blank" rel="noreferrer" className={cn(sourceSecondaryButton, 'mt-3 px-3 py-2 text-[10px]')}>
              Open Assistant WhatsApp
            </a>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {whatsappCapabilities.map((item) => (
              <div key={item.title} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">{item.title}</p>
                <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'logs' ? (
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Pulse ingestion</p>
              <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">WhatsApp health and parsing coverage</h3>
              <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                This shows whether the connected number is alive, how many groups Pulse can see, how many messages are landing, and whether they are being parsed into the workspace.
              </p>
            </div>
            <button
              onClick={() => {
                void fetchLogs();
                void fetchHealth();
              }}
              className={cn(sourceSecondaryButton, 'rounded-full px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Connected number', value: primaryHealthSession?.phoneNumber || status.connectedPhoneNumber || 'Not connected' },
              { label: 'Groups detected', value: String(health.summary.groupCount) },
              { label: 'Active groups today', value: String(activeGroupCount || health.summary.activeGroups24h) },
              { label: 'Messages received', value: String(health.summary.messagesReceived24h) },
              { label: 'Parsed into Pulse', value: `${health.summary.messagesParsed24h} (${health.summary.parserSuccessRate}%)` },
            ].map((card) => (
              <div key={card.label} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{card.label}</p>
                <p className="mt-2 text-[16px] font-semibold text-[var(--text-primary)]">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Health summary</p>
                <h4 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">
                  {health.summary.healthState === 'healthy'
                    ? 'Healthy: Pulse is reading and parsing your WhatsApp activity.'
                    : health.summary.healthState === 'critical'
                      ? 'Attention: WhatsApp is disconnected or ingestion is stalled.'
                      : 'Warning: Pulse is connected, but some ingestion signals need attention.'}
                </h4>
              </div>
              <span className={cn('rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]', getHealthTone(health.summary.healthState))}>
                {health.summary.healthState}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">Last inbound activity</p>
                <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">
                  {formatDateTime(primaryHealthSession?.lastInboundMessageAt)}
                </p>
              </div>
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">Last parsed item</p>
                <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">
                  {formatDateTime(primaryHealthSession?.lastParsedMessageAt)}
                </p>
              </div>
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">Latest group sync</p>
                <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">
                  {formatDateTime(primaryHealthSession?.lastGroupSyncAt)}
                </p>
              </div>
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">Stale groups</p>
                <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">
                  {staleGroupCount} group{staleGroupCount === 1 ? '' : 's'} need attention
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Group coverage</p>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{groupHealth.length} known groups</span>
              </div>
              <div className="pulse-scrollbar mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {groupHealth.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                    No WhatsApp groups have been synced yet. Once the session is connected and Pulse fetches the group list, they will appear here.
                  </div>
                ) : (
                  groupHealth.map((group) => (
                    <div key={group.id} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{group.groupName}</p>
                        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]', getHealthTone(group.status))}>
                          {group.status}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Last message</p>
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{formatDateTime(group.lastMessageAt)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Received today</p>
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{group.messagesReceived24h}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Parsed today</p>
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{group.messagesParsed24h}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Recent session events</p>
                <div className="pulse-scrollbar mt-3 max-h-[200px] space-y-3 overflow-y-auto pr-1">
                  {eventLogs.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                      No lifecycle events yet. Connection, group sync, and disconnect events will show up here.
                    </div>
                  ) : (
                    eventLogs.map((event) => (
                      <div key={event.id} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">{event.eventType.split('_').join(' ')}</p>
                          <p className="text-[10px] text-[var(--text-secondary)]">{formatDateTime(event.createdAt)}</p>
                        </div>
                        <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">{event.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Recent parsed messages</p>
                <div className="pulse-scrollbar mt-3 max-h-[280px] space-y-3 overflow-y-auto pr-1">
                  {logs.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                      No recent WhatsApp messages yet. Once inbound traffic lands, you will see the raw intake here.
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{log.sender}</p>
                          <p className="shrink-0 text-[10px] text-[var(--text-secondary)]">
                            {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown time'}
                          </p>
                        </div>
                        <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">{log.message}</p>
                        <p className="mt-2 truncate text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{log.remoteJid || 'No remote JID'}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                <QrCode className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Connect WhatsApp</h3>
                <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">Add your first WhatsApp number to start receiving property leads</p>
              </div>
            </div>

            <form onSubmit={handleConnectWrapper} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Your name</span>
                <input
                  value={deviceOwnerName || fullName}
                  onChange={(e) => { setDeviceOwnerName(e.target.value); setFullName(e.target.value); }}
                  placeholder="Enter your name"
                  className={sourceFieldClassName}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">WhatsApp number</span>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    value={devicePhoneNumber || phoneNumber}
                    onChange={(e) => { setDevicePhoneNumber(e.target.value); setPhoneNumber(e.target.value); }}
                    placeholder="919876543210"
                    className={cn(sourceFieldClassName, 'pl-9')}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                  Enter your WhatsApp number with country code (digits only). Example: <span className="text-[var(--text-primary)]">919876543210</span>
                </p>
              </label>

              {error && (
                <div className="rounded-[12px] border border-[color:rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] px-3 py-2.5 text-[12px] text-[var(--red)]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isConnecting}
                className={cn(sourcePrimaryButton, 'w-full')}
              >
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                <span>Connect WhatsApp</span>
              </button>
            </form>
          </div>

          <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                  <Zap className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Live status</p>
                  <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">WhatsApp sessions</h3>
                </div>
              </div>
              <button
                onClick={fetchStatus}
                className={cn(sourceSecondaryButton, 'rounded-full px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}
              >
                <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              </button>
            </div>

            <div className="mt-5 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Current connection</p>
                  <p className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">
                    {currentSessionStatus === 'connected'
                      ? 'Connected'
                      : currentSessionStatus === 'connecting'
                        ? 'Connecting'
                        : phoneNumber || devicePhoneNumber
                          ? 'Ready to connect'
                          : 'Disconnected'}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{displayCurrentConnectionNumber}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{displayCurrentConnectionName}</p>
                  <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{status.activeCount}/{status.limit} numbers connected on this workspace</p>
                </div>
                {disconnectTargetLabel && status.status === 'connected' && (
                  <button
                    onClick={() => handleDisconnect(disconnectTargetLabel)}
                    disabled={isConnecting}
                    className={cn(sourceSecondaryButton, 'bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-secondary)] hover:text-[var(--red)]')}
                  >
                    <Power className="h-4 w-4" />
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {status.sessions.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                  {artifactValue || isCurrentSessionConnecting
                    ? artifactMode === 'pairing'
                      ? 'Pairing code is live. Enter it in WhatsApp on the broker phone to finish connecting.'
                      : 'QR is live. Scan it in WhatsApp to finish connecting this broker number.'
                    : 'No WhatsApp sessions connected yet.'}
                </div>
              ) : (
                status.sessions.map((session) => (
                  <div key={session.label} className="flex items-center justify-between rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                    <button
                      type="button"
                      onClick={() => handleSelectExistingSession(session)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-[12px] font-semibold text-[var(--text-primary)]">{session.ownerName || session.label}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">{session.phoneNumber || 'No number stored'}</p>
                    </button>
                    <div className="ml-3 flex items-center gap-2">
                      <span className={cn(
                        sourcePill,
                        session.status === 'connected'
                          ? 'bg-[rgba(37,211,102,0.12)] text-[var(--accent)]'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                      )}>
                        {session.status}
                      </span>
                      {session.status === 'connected' && (
                        <button
                          type="button"
                          onClick={() => handleDisconnect(session.label)}
                          disabled={isConnecting}
                          className={cn(sourceSecondaryButton, 'px-3 py-1.5 text-[10px] text-[var(--text-secondary)] hover:text-[var(--red)]')}
                        >
                          <Power className="h-3.5 w-3.5" />
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              <p className="text-[12px] leading-5 text-[var(--text-secondary)]">
                Save the broker details first, then connect with QR. If the broker is away from a laptop, use the pairing code fallback instead. The connected number is surfaced globally in the header so the whole app knows which WhatsApp is active.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
                  <QrCode className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                    {artifactMode === 'pairing' ? 'WhatsApp pairing code' : 'WhatsApp QR'}
                  </p>
                  <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">QR panel</h3>
                </div>
              </div>
              <span className={cn(sourcePill, 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]')}>
                {artifactMode === 'pairing' ? 'Pairing code' : demoMode ? 'Demo QR' : 'Live QR'}
              </span>
            </div>

            <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
              {!artifactValue && !showConnectionArtifactPanel
                ? 'This right panel is reserved for the active connection artifact. Start or refresh a connect flow on the left to show the QR or pairing code here.'
                : !artifactValue
                  ? artifactMode === 'pairing'
                    ? 'Preparing the WhatsApp pairing code. Keep this page open.'
                    : 'Preparing the WhatsApp QR. Keep this page open.'
                  : isQrExpired
                    ? artifactMode === 'pairing'
                      ? 'This pairing code has expired. Request a fresh code to continue connecting.'
                      : 'This QR has expired. Generate a fresh QR to continue connecting.'
                    : artifactMode === 'pairing'
                      ? 'Use this pairing code in WhatsApp on the broker phone to finish connecting.'
                      : 'Scan this QR in WhatsApp on the broker phone to finish connecting.'}
            </p>

            {artifactValue ? (
              <div className={cn(
                'mt-4 flex items-center justify-between rounded-[10px] border px-3 py-2',
                isQrExpired
                  ? 'border-[color:rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)]'
                  : 'border-[color:var(--border)] bg-[var(--bg-base)]'
              )}>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                    {artifactMode === 'pairing' ? 'Pairing freshness' : 'QR freshness'}
                  </p>
                  <p className={cn(
                    'mt-1 text-[13px] font-semibold',
                    isQrExpired ? 'text-[var(--red)]' : 'text-[var(--text-primary)]'
                  )}>
                    {isQrExpired ? 'Expired' : artifactMode === 'pairing' ? `${qrTimeLeft}s left to use` : `${qrTimeLeft}s left to scan`}
                  </p>
                </div>
                {isQrExpired ? (
                  <button
                    onClick={() => void handleConnect(artifactMode === 'pairing' ? 'pairing' : 'qr')}
                    disabled={isConnecting}
                    className={cn(sourcePrimaryButton, 'px-3 py-2 text-[10px]')}
                  >
                    {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    <span>{artifactMode === 'pairing' ? 'Request new code' : 'Generate fresh QR'}</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4">
              {qrMarkup ? (
                <div className={cn(
                  'flex min-h-[420px] items-center justify-center rounded-[12px] border border-[color:var(--border)] bg-white p-5 transition-opacity',
                  isQrExpired && 'opacity-55'
                )}>
                  <div
                    className="w-full max-w-[320px]"
                    dangerouslySetInnerHTML={{ __html: qrMarkup }}
                  />
                </div>
              ) : artifactValue ? (
                <div className="min-h-[420px] rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    {artifactMode === 'pairing' ? 'Pairing code' : 'QR payload'}
                  </p>
                  <p className="break-all rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-[15px] tracking-[0.14em] text-[var(--text-primary)]">
                    {artifactValue}
                  </p>
                </div>
              ) : showConnectionArtifactPanel ? (
                <div className="min-h-[420px] rounded-[12px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-5">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {artifactMode === 'pairing' ? 'Generating pairing code' : 'Generating QR'}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                        This can take a few seconds after a new WhatsApp session starts.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-[12px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-5 text-center">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">QR only panel</p>
                    <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                      The QR or pairing artifact for the selected broker number will always appear here, including when you connect a second number.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {isConnecting ? (
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-base)]">
                  <div className="h-full bg-[var(--accent)] transition-all duration-150" style={{ width: `${scanProgress}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                  {artifactMode === 'pairing' ? 'Preparing the WhatsApp pairing code...' : 'Preparing the WhatsApp QR...'}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
