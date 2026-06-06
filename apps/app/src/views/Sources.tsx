import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Building2,
  ChevronDown,
  Info,
  Loader2,
  MessageSquare,
  Phone,
  Power,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  UserRound,
  Users,
  Zap,
  X as XIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { track } from '../services/analytics';
import { PROPAI_ASSISTANT_NUMBER, PROPAI_ASSISTANT_WA_LINK, PROPAI_ASSISTANT_PHONE_DIGITS, PROPAI_PLAN_CARDS } from '../lib/propai';
import { useAuth } from '../context/AuthContext';

type WhatsappSession = {
  label: string;
  ownerName?: string | null;
  phoneNumber?: string | null;
  status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  sessionData?: {
    parseDirectMessages?: boolean;
    parse_direct_messages?: boolean;
    selfChatEnabled?: boolean;
    self_chat_enabled?: boolean;
    groupAuditPending?: boolean;
    groupAuditCompletedAt?: string | null;
  } | null;
  lastSync?: string;
};

type WhatsappStatus = {
  status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  activeCount: number;
  limit: number;
  plan: string;
  connectedPhoneNumber?: string | null;
  connectedOwnerName?: string | null;
  allowedOutboundSessionLabels?: string[];
  preferredOutboundSessionLabel?: string | null;
  hasOutboundLaneRestriction?: boolean;
  sessions: WhatsappSession[];
};

type Profile = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  phoneVerified?: boolean;
  phoneLocked?: boolean;
};

type HealthLogsResponse = {
  groupsDetected: number;
  messagesReceived: number;
  parsedIntoPulse: number;
  parseSuccessRate: number;
  lastInboundActivity: string | null;
  recentSessionEvents: Array<{
    event_type: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
};

type SupportLogsResponse = {
  success: boolean;
  referenceId: string;
  message: string;
};

type OfficialWhatsappCloudConfig = {
  configured: boolean;
  enabled: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string;
  apiVersion: string;
  verifyTokenSet: boolean;
  hasAccessToken: boolean;
  webhookUrl: string;
  row: {
    sessionId: string;
    label: string;
    status: string;
    lastSync: string | null;
  } | null;
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
  disconnectReason?: string | null;
  autoReconnectBlocked?: boolean;
  autoReconnectBlockedAt?: string | null;
};

type WhatsappHealthSummary = {
  groupCount: number;
  activeGroups24h: number;
  messagesReceived24h: number;
  messagesParsed24h: number;
  messagesFailed24h: number;
  replayBacklog24h?: number;
  replayCompleted24h?: number;
  replayFailed24h?: number;
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
  status: 'active' | 'quiet' | 'stale' | 'error' | 'unknown';
};

type WhatsappEventRecord = {
  id: string;
  sessionLabel: string;
  eventType: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

type WhatsappDetailedHealthSession = {
  label: string;
  ownerName?: string | null;
  status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
  phoneNumber?: string | null;
  lastSync?: string | null;
  diagnostics?: {
    disconnectReason?: string | null;
    autoReconnectBlocked?: boolean;
    autoReconnectBlockedAt?: string | null;
    lastIngestionStallAlertSignature?: string | null;
    lastIngestionStallAlertDelivery?: string | null;
    lastIngestionStallAlertAt?: string | null;
  } | null;
  liveData?: {
    reconnectAttempts?: number;
    isReconnecting?: boolean;
  } | null;
};

type WhatsappDetailedHealthResponse = {
  success: boolean;
  timestamp: string;
  sessions: WhatsappDetailedHealthSession[];
  ops?: {
    totalSessions?: number;
    connectedSessions?: number;
    reconnectingSessions?: number;
    totalReconnectAttempts?: number;
    healthState?: string;
  };
};

const normalizeWhatsappSession = (session: unknown): WhatsappSession | null => {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const row = session as Record<string, unknown>;
  const label = String(row.label || '').trim();
  if (!label) {
    return null;
  }

  const rawStatus = String(row.status || 'disconnected');
  const status: WhatsappSession['status'] =
    rawStatus === 'connected' || rawStatus === 'connecting' || rawStatus === 'reconnecting'
      ? rawStatus
      : 'disconnected';
  const sessionData = row.sessionData && typeof row.sessionData === 'object'
    ? row.sessionData as WhatsappSession['sessionData']
    : null;

  return {
    label,
    ownerName: typeof row.ownerName === 'string' ? row.ownerName : null,
    phoneNumber: typeof row.phoneNumber === 'string' ? row.phoneNumber : null,
    status,
    sessionData,
    lastSync: typeof row.lastSync === 'string' ? row.lastSync : undefined,
  };
};

const normalizeWhatsappStatus = (payload: any): WhatsappStatus => {
  const sessions = Array.isArray(payload?.sessions)
    ? payload.sessions.map(normalizeWhatsappSession).filter((session): session is WhatsappSession => Boolean(session))
    : [];
  const rawStatus = String(payload?.status || 'disconnected');
  const status: WhatsappStatus['status'] =
    rawStatus === 'connected' || rawStatus === 'connecting' || rawStatus === 'reconnecting'
      ? rawStatus
      : 'disconnected';

  return {
    status,
    activeCount: Number(payload?.activeCount || 0),
    limit: Number(payload?.limit || 2),
    plan: String(payload?.plan || 'Trial'),
    connectedPhoneNumber: typeof payload?.connectedPhoneNumber === 'string' ? payload.connectedPhoneNumber : null,
    connectedOwnerName: typeof payload?.connectedOwnerName === 'string' ? payload.connectedOwnerName : null,
    allowedOutboundSessionLabels: Array.isArray(payload?.allowedOutboundSessionLabels) ? payload.allowedOutboundSessionLabels : [],
    preferredOutboundSessionLabel: typeof payload?.preferredOutboundSessionLabel === 'string' ? payload.preferredOutboundSessionLabel : null,
    hasOutboundLaneRestriction: Boolean(payload?.hasOutboundLaneRestriction),
    sessions,
  };
};

const mapWhatsappGroupHealth = (row: any, index: number): WhatsappGroupHealth => ({
  id: String(row?.id || `group-health-${index}`),
  sessionLabel: String(row?.sessionLabel || row?.session_label || ''),
  groupId: String(row?.groupId || row?.group_id || ''),
  groupName: String(row?.groupName || row?.group_name || row?.groupId || row?.group_id || 'Unknown group'),
  lastGroupSyncAt: row?.lastGroupSyncAt || row?.last_group_sync_at || row?.lastSyncAt || row?.last_sync_at || null,
  lastMessageAt: row?.lastMessageAt || row?.last_message_at || null,
  lastParsedAt: row?.lastParsedAt || row?.last_parsed_at || null,
  messagesReceived24h: Number(row?.messagesReceived24h || row?.messages_received_24h || 0),
  messagesParsed24h: Number(row?.messagesParsed24h || row?.messages_parsed_24h || 0),
  messagesFailed24h: Number(row?.messagesFailed24h || row?.messages_failed_24h || 0),
  status: String(row?.status || 'unknown') as WhatsappGroupHealth['status'],
});

const mapWhatsappEvent = (row: any, index: number): WhatsappEventRecord => ({
  id: String(row?.id || `wa-event-${index}`),
  sessionLabel: String(row?.sessionLabel || row?.session_label || row?.session_id || ''),
  eventType: String(row?.eventType || row?.event_type || 'unknown'),
  message: String(row?.message || row?.payload?.message || ''),
  createdAt: String(row?.createdAt || row?.created_at || ''),
  metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
});

const normalizeDetailedHealthSession = (row: unknown): WhatsappDetailedHealthSession | null => {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const label = String(record.label || '').trim();
  if (!label) return null;

  const rawStatus = String(record.status || 'disconnected');
  const status: WhatsappDetailedHealthSession['status'] =
    rawStatus === 'connected' || rawStatus === 'connecting' || rawStatus === 'reconnecting'
      ? rawStatus
      : 'disconnected';
  const diagnostics = record.diagnostics && typeof record.diagnostics === 'object'
    ? record.diagnostics as WhatsappDetailedHealthSession['diagnostics']
    : null;
  const liveData = record.liveData && typeof record.liveData === 'object'
    ? record.liveData as WhatsappDetailedHealthSession['liveData']
    : null;

  return {
    label,
    ownerName: typeof record.ownerName === 'string' ? record.ownerName : null,
    status,
    phoneNumber: typeof record.phoneNumber === 'string' ? record.phoneNumber : null,
    lastSync: typeof record.lastSync === 'string' ? record.lastSync : null,
    diagnostics,
    liveData,
  };
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

type GroupAuditRecommendation = 'parse' | 'review' | 'ignore';
type GroupAuditFilter = 'all' | 'selected' | 'not_selected' | GroupAuditRecommendation;

type GroupAuditGroup = {
  id: string;
  name: string;
  locality?: string | null;
  city?: string | null;
  category?: string | null;
  tags?: string[];
  participantsCount: number;
  participantPhoneCount: number;
  duplicateMemberCount: number;
  overlappingMemberCount?: number;
  duplicateOverlapPercent: number;
  overlappingGroups?: Array<{
    id: string;
    name: string;
    sharedMemberCount: number;
  }>;
  signalScore: number;
  noiseScore: number;
  chaosScore: number;
  recommendation: GroupAuditRecommendation;
  reasons: string[];
  sessionLabel?: string | null;
  isParsing?: boolean;
  autoAllow?: boolean;
  status?: string;
};

type GroupAuditResponse = {
  sessionLabel: string;
  summary: {
    totalGroups: number;
    recommendedParseGroups: number;
    reviewGroups: number;
    ignoredGroups: number;
    realEstateGroups: number;
    uniqueParticipants: number;
    duplicateParticipants: number;
    overlappingParticipants?: number;
    duplicateParticipantRate: number;
    overlappingParticipantRate?: number;
    averageChaosScore: number;
    averageSignalScore: number;
  };
  groups: GroupAuditGroup[];
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

type SourcesTab = 'setup' | 'audit' | 'pricing' | 'logs';

const SOURCE_TABS: Array<{ id: SourcesTab; label: string }> = [
  { id: 'setup', label: 'Setup' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'logs', label: 'Logs' },
];

const WHATSAPP_TABS: Array<{ id: SourcesTab; label: string }> = [
  { id: 'setup', label: 'Setup' },
];

const GROUP_AUDIT_FILTERS: Array<{ id: GroupAuditFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'selected', label: 'Allowed' },
  { id: 'not_selected', label: 'Review' },
  { id: 'parse', label: 'Parse' },
  { id: 'review', label: 'Review' },
  { id: 'ignore', label: 'Ignore' },
];

const isSourcesTab = (value: string | null): value is SourcesTab =>
  Boolean(value && SOURCE_TABS.some((tab) => tab.id === value));

const tabForPath = (pathname: string): SourcesTab | null => {
  if (pathname === '/whatsapp' || pathname === '/whatsapp/setup') return 'setup';
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/group-audit' || pathname === '/wa-logs') return 'logs';
  return null;
};

const pathForTab = (tab: SourcesTab) => {
  if (tab === 'pricing') return '/pricing';
  if (tab === 'logs') return '/wa-logs';
  return '/whatsapp/setup';
};

const whatsappCapabilities = [
  {
    title: 'Parse and structure broker WhatsApp flow',
    copy: 'Turn WhatsApp group traffic into a clean Stream of listings and requirements without manual copy-paste.',
  },
  {
    title: 'Monitor live health and group quality',
    copy: 'Track which groups are active, what is being parsed, and where ingestion quality drops.',
  },
  {
    title: 'Work from saved lists instead of raw phone books',
    copy: 'Use audit and parsing controls to keep noisy groups out and preserve only useful market data.',
  },
  {
    title: 'Stay inside the PropAI workspace',
    copy: 'Keep brokers, operators, sessions, and AI context in one shared workspace while still limiting each operator to approved numbers.',
  },
];

const normalizePhoneNumber = (value: string) => value.split('').filter(c => c >= '0' && c <= '9').join('');
const ensureIndiaPrefix = (phone: string) => {
  const digits = normalizePhoneNumber(phone);
  if (!digits) return '91';
  if (digits.startsWith('91')) return digits;
  if (digits.startsWith('+91')) return digits.slice(1);
  return `91${digits}`;
};
const stripIndiaPrefix = (phone: string) => {
  const digits = normalizePhoneNumber(phone);
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  return digits;
};
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

const normalizePairingCode = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const compact = raw.replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(compact)) {
    return null;
  }

  if (/[#@:\/\\]/.test(compact)) {
    return null;
  }

  return compact;
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
  replayBacklog24h: 0,
  replayCompleted24h: 0,
  replayFailed24h: 0,
  parserSuccessRate: 100,
  healthState: 'warning',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'No activity yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No activity yet';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(parsed);
};

const formatElapsed = (valueMs?: number | null) => {
  if (!Number.isFinite(valueMs) || (valueMs || 0) <= 0) return null;
  const totalMinutes = Math.round((valueMs || 0) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
};

const formatReasonLabel = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized
    .split('_')
    .join(' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getEventMetaString = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const getEventMetaNumber = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = Number(metadata?.[key]);
  return Number.isFinite(value) ? value : null;
};

const describeWhatsappEvent = (event: WhatsappEventRecord) => {
  const metadata = event.metadata || {};
  const disconnectReason = formatReasonLabel(getEventMetaString(metadata, 'disconnectReason'));
  const liveStatus = getEventMetaString(metadata, 'liveStatus');
  const groupCount = getEventMetaNumber(metadata, 'groupCount');
  const activeGroups24h = getEventMetaNumber(metadata, 'activeGroups24h');
  const lastInboundAgeMs = getEventMetaNumber(metadata, 'lastInboundAgeMs');
  const error = getEventMetaString(metadata, 'error');
  const autoReconnectBlocked = Boolean(metadata.autoReconnectBlocked);

  const details: string[] = [];
  if (disconnectReason) details.push(`Reason: ${disconnectReason}`);
  if (autoReconnectBlocked) details.push('Auto-reconnect blocked');
  if (liveStatus) details.push(`Transport: ${formatReasonLabel(liveStatus) || liveStatus}`);
  if (Number.isFinite(lastInboundAgeMs || NaN)) {
    const elapsed = formatElapsed(lastInboundAgeMs);
    if (elapsed) details.push(`No inbound for ${elapsed}`);
  }
  if (Number.isFinite(activeGroups24h || NaN) && (activeGroups24h || 0) > 0) {
    details.push(`${activeGroups24h} active groups today`);
  } else if (Number.isFinite(groupCount || NaN) && (groupCount || 0) > 0) {
    details.push(`${groupCount} known groups`);
  }
  if (error) details.push(`Error: ${error}`);

  return details;
};

const getHealthTone = (state: WhatsappHealthSummary['healthState'] | WhatsappHealthSession['healthState'] | WhatsappGroupHealth['status']) => {
  switch (state) {
    case 'healthy':
    case 'active':
      return 'bg-[rgba(62,232,138,0.12)] text-[var(--accent)]';
    case 'critical':
    case 'error':
      return 'bg-[rgba(239,68,68,0.1)] text-[var(--red)]';
    default:
      return 'bg-[rgba(245,158,11,0.12)] text-[var(--amber)]';
  }
};

const sourcePrimaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] shadow-[0_10px_28px_rgba(62,232,138,0.18)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-95 disabled:opacity-50 disabled:hover:translate-y-0';
const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
  'chariotrealty@gmail.com',
  'hello@chaoscraftlabs.com',
  'ojha007@gmail.com',
  'hello@propai.live',
]);
const sourceSecondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-all duration-150 hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';
const sourcePill =
  'inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]';
const sourceFieldClassName =
  'w-full rounded-[10px] border border-[color:var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-150 focus:border-[color:var(--accent)] focus:bg-[var(--bg-hover)]';

const formatPlanLabel = (plan?: string | null) => {
  const normalized = String(plan || '').trim();
  if (!normalized) return '';

  const lower = normalized.toLowerCase();
  if (lower === 'free' || lower === 'trial') return 'Trial';
  if (lower === 'starter') return 'Starter';
  if (lower === 'pro') return 'Pro';
  if (lower === 'team') return 'Team';
  return normalized;
};

export const Sources: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const connectIntentConsumedRef = useRef(false);
  const connectRequestInFlightRef = useRef(false);

  const tabParam = searchParams.get('tab');
  const initialTab = useMemo(() => {
    const pathTab = tabForPath(location.pathname);
    if (pathTab) {
      return pathTab;
    }
    if (isSourcesTab(tabParam)) {
      return tabParam;
    }
    return 'setup';
  }, [tabParam, location.pathname]);

  const [activeTab, setActiveTab] = useState<SourcesTab>(initialTab);

  // Sync state from dedicated routes and legacy query parameters.
  useEffect(() => {
    const pathTab = tabForPath(location.pathname);
    if (pathTab) {
      setActiveTab(pathTab);
      return;
    }

    const currentTab = searchParams.get('tab');
    if (currentTab === 'audit' || currentTab === 'pricing' || currentTab === 'logs') {
      navigate(pathForTab(currentTab), { replace: true });
      return;
    }

    if (currentTab === 'outbound') {
      navigate('/whatsapp/setup', { replace: true });
      return;
    }

    if (currentTab === 'setup') {
      navigate('/whatsapp/setup', { replace: true });
      return;
    }

    if (location.pathname === '/whatsapp') {
      setActiveTab('setup');
    }
  }, [location.pathname, navigate, searchParams]);
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
  const [detailedHealth, setDetailedHealth] = useState<WhatsappDetailedHealthResponse | null>(null);
  const [groupHealth, setGroupHealth] = useState<WhatsappGroupHealth[]>([]);
  const [eventLogs, setEventLogs] = useState<WhatsappEventRecord[]>([]);
  const [outboundGroups, setOutboundGroups] = useState<WhatsappGroupOption[]>([]);
  const [groupAudit, setGroupAudit] = useState<GroupAuditResponse | null>(null);
  const [isLoadingGroupAudit, setIsLoadingGroupAudit] = useState(false);
  const [groupAuditError, setGroupAuditError] = useState<string | null>(null);
  const [isApplyingGroupAudit, setIsApplyingGroupAudit] = useState(false);
  const [isAllowingAllRealEstate, setIsAllowingAllRealEstate] = useState(false);
  const [isResettingSession, setIsResettingSession] = useState(false);
  const [officialCloudLoading, setOfficialCloudLoading] = useState(false);
  const [officialCloudSaving, setOfficialCloudSaving] = useState(false);
  const [officialCloudFeedback, setOfficialCloudFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [officialCloudConfig, setOfficialCloudConfig] = useState<OfficialWhatsappCloudConfig | null>(null);
  const [officialCloudPhoneNumberId, setOfficialCloudPhoneNumberId] = useState('');
  const [officialCloudBusinessAccountId, setOfficialCloudBusinessAccountId] = useState('');
  const [officialCloudDisplayPhoneNumber, setOfficialCloudDisplayPhoneNumber] = useState('');
  const [officialCloudApiVersion, setOfficialCloudApiVersion] = useState('v20.0');
  const [officialCloudVerifyToken, setOfficialCloudVerifyToken] = useState('');
  const [officialCloudAccessToken, setOfficialCloudAccessToken] = useState('');
  const [officialCloudEnabled, setOfficialCloudEnabled] = useState(true);
  const [selectedAuditParseIds, setSelectedAuditParseIds] = useState<string[]>([]);
  const [groupAuditSearchTerm, setGroupAuditSearchTerm] = useState('');
  const [groupAuditFilter, setGroupAuditFilter] = useState<GroupAuditFilter>('all');
  const [expandedAuditParseIds, setExpandedAuditParseIds] = useState<string[]>([]);
  const [groupStreamItems, setGroupStreamItems] = useState<Record<string, Array<{ id: string; raw_text: string; type: string; record_type: string; locality: string | null; price_numeric: number | null; bhk: string | null; created_at: string }>>>({});
  const [loadingGroupStreamItems, setLoadingGroupStreamItems] = useState<Record<string, boolean>>({});
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
  const [connectMode, setConnectMode] = useState<'qr' | 'pairing'>('qr');
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
    limit: 1,
    plan: '',
    allowedOutboundSessionLabels: [],
    preferredOutboundSessionLabel: null,
    hasOutboundLaneRestriction: false,
    sessions: [],
  });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [healthLogs, setHealthLogs] = useState<HealthLogsResponse | null>(null);
  const [isSubmittingSupportLogs, setIsSubmittingSupportLogs] = useState(false);
  const [supportLogsFeedback, setSupportLogsFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = useMemo(() => normalizePhoneNumber(phoneNumber), [phoneNumber]);
  const normalizedDevicePhone = useMemo(() => normalizePhoneNumber(devicePhoneNumber), [devicePhoneNumber]);
  const lockedWorkspacePhone = normalizedPhone;
  const lockedWorkspacePhoneDisplay = stripIndiaPrefix(normalizedPhone);
  const isWorkspacePhoneLocked = profileLoaded && lockedWorkspacePhone.length >= 10;
  const connectPhoneValue = isWorkspacePhoneLocked ? lockedWorkspacePhoneDisplay : (devicePhoneNumber || phoneNumber);
  const expectedSessionLabel = useMemo(
    () => buildSessionLabel(deviceOwnerName || 'Owner', normalizedDevicePhone || 'device'),
    [deviceOwnerName, normalizedDevicePhone],
  );
  const activeSessionLabel = pendingConnection?.label || expectedSessionLabel;
  const activeConnectionPhone = pendingConnection?.phoneNumber || normalizedDevicePhone;
  const activeConnectionOwnerName = pendingConnection?.ownerName || deviceOwnerName;
  const primaryConnectedSession = useMemo(
    () => status.sessions.find((session) => session.status === 'connected') || null,
    [status.sessions],
  );
  const currentSession = useMemo(() => {
    const connectedExactMatch = status.sessions.find(
      (session) => session.label === activeSessionLabel && session.status === 'connected',
    );
    if (connectedExactMatch) return connectedExactMatch;

    const connectedPhoneMatch = activeConnectionPhone
      ? status.sessions.find(
          (session) => session.status === 'connected' && normalizePhoneNumber(session.phoneNumber || '') === activeConnectionPhone,
        )
      : null;
    if (connectedPhoneMatch) return connectedPhoneMatch;

    if (primaryConnectedSession) return primaryConnectedSession;

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
  }, [
    activeConnectionOwnerName,
    activeConnectionPhone,
    activeSessionLabel,
    primaryConnectedSession,
    status.connectedOwnerName,
    status.connectedPhoneNumber,
    status.sessions,
  ]);
  const currentSessionStatus = currentSession?.status || (pendingConnection || connectionArtifact ? 'connecting' : 'disconnected');
  const artifactValue = connectionArtifact?.value || null;
  const artifactMode = connectionArtifact?.mode || null;
  const currentSessionParseDirectMessages = Boolean(
    currentSession?.sessionData?.parseDirectMessages ?? currentSession?.sessionData?.parse_direct_messages,
  );
  const currentSessionSelfChatEnabled =
    currentSession?.sessionData?.selfChatEnabled ?? currentSession?.sessionData?.self_chat_enabled ?? true;
  const currentSessionLabel = currentSession?.label || null;
  const isSuperAdmin = user?.appRole === 'super_admin' || OWNER_SUPER_ADMIN_EMAILS.has(String(user?.email || '').trim().toLowerCase());
  const isAtDeviceLimit = !isSuperAdmin && status.activeCount >= status.limit && !currentSession;
  const connectedSenderSessions = useMemo(
    () => status.sessions.filter((session) => session.status === 'connected'),
    [status.sessions],
  );
  const marketingSession = useMemo(
    () => connectedSenderSessions.find((session) => normalizePhoneNumber(session.phoneNumber || '') === MARKETING_AGENT_PHONE) || null,
    [connectedSenderSessions],
  );
  const allowedConnectedSenderSessions = useMemo(() => {
    if (!status.hasOutboundLaneRestriction || !Array.isArray(status.allowedOutboundSessionLabels) || status.allowedOutboundSessionLabels.length === 0) {
      return connectedSenderSessions;
    }

    return connectedSenderSessions.filter((session) => status.allowedOutboundSessionLabels?.includes(session.label));
  }, [connectedSenderSessions, status.allowedOutboundSessionLabels, status.hasOutboundLaneRestriction]);

  const accessModelLabel = useMemo(() => {
    if (isSuperAdmin) {
      return 'Super Admin';
    }

    const subscriptionPlan = user?.subscription?.plan || null;
    const plan = subscriptionPlan || (statusLoaded ? status.plan : null);
    const label = formatPlanLabel(plan);
    return label || 'Loading…';
  }, [isSuperAdmin, status.plan, statusLoaded, user?.subscription?.plan]);
  const currentSessionAuditPending = Boolean(
    currentSession?.sessionData?.groupAuditPending
    && !currentSession?.sessionData?.groupAuditCompletedAt,
  );
  const auditSessionLabel = currentSession?.label || primaryConnectedSession?.label || pendingConnection?.label || '';

  const fetchProfile = useCallback(async () => {
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.profile);
      const profile = response.data?.profile as Profile | undefined;
      if (profile) {
        const nextName = profile.fullName || '';
        const nextPhone = ensureIndiaPrefix(profile.phone || '');
        const displayPhone = stripIndiaPrefix(nextPhone);
        setFullName((current) => current || nextName);
        setPhoneNumber((current) => current || displayPhone);
        setDeviceOwnerName((current) => current || nextName);
        setDevicePhoneNumber((current) => current || displayPhone);
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
        setStatus(normalizeWhatsappStatus(response.data));
      }
    } catch (err) {
      console.error(handleApiError(err));
    } finally {
      setStatusLoaded(true);
      setIsRefreshing(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.messages, {
        params: currentSessionLabel ? { sessionLabel: currentSessionLabel } : undefined,
      });
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
  }, [currentSessionLabel]);

  const fetchHealth = useCallback(async () => {
    try {
      const [healthResponse, groupResponse, eventResponse] = await Promise.all([
        backendApi.get(ENDPOINTS.whatsapp.health),
        backendApi.get(ENDPOINTS.whatsapp.groupsHealth),
        backendApi.get(ENDPOINTS.whatsapp.events),
      ]);

      const nextGroupHealth = Array.isArray(groupResponse.data)
        ? groupResponse.data.map((row: any, index: number) => mapWhatsappGroupHealth(row, index))
        : [];
      const derivedGroupCount = nextGroupHealth.length;
      const derivedActiveGroups24h = nextGroupHealth.filter((group) => group.status === 'active').length;
      const nextEventLogs = Array.isArray(eventResponse.data)
        ? eventResponse.data.map((row: any, index: number) => mapWhatsappEvent(row, index))
        : [];
      const rawSummary = healthResponse.data?.summary && typeof healthResponse.data.summary === 'object'
        ? healthResponse.data.summary
        : null;

      setHealth({
        sessions: Array.isArray(healthResponse.data?.sessions) ? healthResponse.data.sessions : [],
        summary: {
          ...defaultHealthSummary,
          ...(rawSummary || {}),
          groupCount: Math.max(Number(rawSummary?.groupCount || 0), derivedGroupCount),
          activeGroups24h: Math.max(Number(rawSummary?.activeGroups24h || 0), derivedActiveGroups24h),
        },
      });
      setGroupHealth(nextGroupHealth);
      setEventLogs(nextEventLogs);
    } catch (err) {
      console.error(handleApiError(err));
      setHealth({ sessions: [], summary: defaultHealthSummary });
      setGroupHealth([]);
      setEventLogs([]);
    }
  }, []);

  const fetchDetailedHealth = useCallback(async () => {
    if (!isSuperAdmin) {
      setDetailedHealth(null);
      return;
    }

    try {
      const response = await backendApi.get<WhatsappDetailedHealthResponse>(ENDPOINTS.whatsapp.healthDetailed);
      const sessions = Array.isArray(response.data?.sessions)
        ? response.data.sessions.map(normalizeDetailedHealthSession).filter((session): session is WhatsappDetailedHealthSession => Boolean(session))
        : [];

      setDetailedHealth({
        success: Boolean(response.data?.success),
        timestamp: typeof response.data?.timestamp === 'string' ? response.data.timestamp : new Date().toISOString(),
        sessions,
        ops: response.data?.ops || {},
      });
    } catch (err) {
      console.error(handleApiError(err));
      setDetailedHealth(null);
    }
  }, [isSuperAdmin]);

  const fetchOfficialCloudConfig = useCallback(async () => {
    if (activeTab !== 'setup') {
      return;
    }

    setOfficialCloudLoading(true);
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.cloudConfig);
      const config = (response.data?.config || null) as OfficialWhatsappCloudConfig | null;
      setOfficialCloudConfig(config);
      setOfficialCloudPhoneNumberId(config?.phoneNumberId || '');
      setOfficialCloudBusinessAccountId(config?.businessAccountId || '');
      setOfficialCloudDisplayPhoneNumber(config?.displayPhoneNumber || '');
      setOfficialCloudApiVersion(config?.apiVersion || 'v20.0');
      setOfficialCloudEnabled(Boolean(config?.enabled));
      setOfficialCloudVerifyToken('');
      setOfficialCloudAccessToken('');
    } catch (err) {
      console.error(handleApiError(err));
      setOfficialCloudFeedback({ tone: 'error', message: handleApiError(err) });
    } finally {
      setOfficialCloudLoading(false);
    }
  }, [activeTab]);

  const saveOfficialCloudConfig = useCallback(async () => {
    setOfficialCloudSaving(true);
    setOfficialCloudFeedback(null);
    try {
      const response = await backendApi.post(ENDPOINTS.whatsapp.cloudConfig, {
        enabled: officialCloudEnabled,
        phoneNumberId: officialCloudPhoneNumberId,
        businessAccountId: officialCloudBusinessAccountId,
        displayPhoneNumber: officialCloudDisplayPhoneNumber,
        apiVersion: officialCloudApiVersion,
        verifyToken: officialCloudVerifyToken,
        accessToken: officialCloudAccessToken,
      });
      const config = (response.data?.config || null) as OfficialWhatsappCloudConfig | null;
      setOfficialCloudConfig(config);
      setOfficialCloudPhoneNumberId(config?.phoneNumberId || officialCloudPhoneNumberId);
      setOfficialCloudBusinessAccountId(config?.businessAccountId || officialCloudBusinessAccountId);
      setOfficialCloudDisplayPhoneNumber(config?.displayPhoneNumber || officialCloudDisplayPhoneNumber);
      setOfficialCloudApiVersion(config?.apiVersion || officialCloudApiVersion);
      setOfficialCloudEnabled(Boolean(config?.enabled));
      setOfficialCloudVerifyToken('');
      setOfficialCloudAccessToken('');
      setOfficialCloudFeedback({ tone: 'success', message: 'Official WhatsApp API config saved.' });
    } catch (err) {
      setOfficialCloudFeedback({ tone: 'error', message: handleApiError(err) });
    } finally {
      setOfficialCloudSaving(false);
    }
  }, [
    officialCloudAccessToken,
    officialCloudApiVersion,
    officialCloudBusinessAccountId,
    officialCloudDisplayPhoneNumber,
    officialCloudEnabled,
    officialCloudPhoneNumberId,
    officialCloudVerifyToken,
  ]);

  const fetchHealthLogs = useCallback(async () => {
    try {
      const response = await backendApi.get<HealthLogsResponse>(ENDPOINTS.whatsapp.healthLogs);
      setHealthLogs(response.data);
    } catch (err) {
      console.error(handleApiError(err));
      setHealthLogs(null);
    }
  }, []);

  const handleSubmitSupportLogs = useCallback(async () => {
    setIsSubmittingSupportLogs(true);
    setSupportLogsFeedback(null);
    try {
      const response = await backendApi.post<SupportLogsResponse>(ENDPOINTS.whatsapp.supportLogs);
      setSupportLogsFeedback({ tone: 'success', message: response.data?.message || 'Support logs sent.' });
    } catch (err) {
      setSupportLogsFeedback({ tone: 'error', message: handleApiError(err) });
    } finally {
      setIsSubmittingSupportLogs(false);
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

  const fetchGroupAudit = useCallback(async (sessionLabel?: string | null) => {
    const targetSessionLabel = sessionLabel || auditSessionLabel;
    if (!targetSessionLabel) {
      setGroupAudit(null);
      setGroupAuditError(null);
      return;
    }

    setIsLoadingGroupAudit(true);
    setGroupAuditError(null);
    try {
      const response = await backendApi.get<GroupAuditResponse>(ENDPOINTS.whatsapp.groupsAudit, {
        params: { sessionLabel: targetSessionLabel },
        timeout: 60000,
      });
      const payload = response.data;
      setGroupAudit(payload);
      setSelectedAuditParseIds(
        Array.isArray(payload?.groups)
          ? payload.groups.filter((group) => group.autoAllow).map((group) => group.id)
          : [],
      );
    } catch (err) {
      const message = handleApiError(err);
      console.error(message);
      setGroupAuditError(message);
    } finally {
      setIsLoadingGroupAudit(false);
    }
  }, [auditSessionLabel]);

  useEffect(() => {
    fetchProfile();
    fetchStatus();
    fetchLogs();
    fetchHealth();
    if (isSuperAdmin) {
      void fetchDetailedHealth();
    }
  }, [fetchDetailedHealth, fetchHealth, fetchLogs, fetchProfile, fetchStatus, isSuperAdmin]);

  useEffect(() => {
    setOutboundSessionKey((current) => {
      const storedLabel = (() => {
        try {
          return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        } catch {
          return null;
        }
      })();

      if (storedLabel && allowedConnectedSenderSessions.some((session) => session.label === storedLabel)) {
        return storedLabel;
      }

      if (current && allowedConnectedSenderSessions.some((session) => session.label === current)) {
        return current;
      }

      if (status.preferredOutboundSessionLabel && allowedConnectedSenderSessions.some((session) => session.label === status.preferredOutboundSessionLabel)) {
        return status.preferredOutboundSessionLabel;
      }

      const allowedMarketingSession = marketingSession && allowedConnectedSenderSessions.some((session) => session.label === marketingSession.label)
        ? marketingSession
        : null;
      return allowedMarketingSession?.label || allowedConnectedSenderSessions[0]?.label || '';
    });
  }, [allowedConnectedSenderSessions, marketingSession, primaryConnectedSession, status.preferredOutboundSessionLabel]);

  useEffect(() => {
    const handleSelectedSession = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string | null }>).detail;
      const label = detail?.label;
      if (!label) return;

      const session = status.sessions.find((entry) => entry.label === label);
      if (!session) return;

      setDeviceOwnerName(session.ownerName || fullName || '');
      setDevicePhoneNumber(ensureIndiaPrefix(session.phoneNumber || ''));
      setPendingConnection(null);
      setConnectionArtifact(null);
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
    if (!artifactValue && status.status !== 'connecting' && status.status !== 'reconnecting') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void fetchStatus();
    }, currentSessionStatus === 'connected' ? 15000 : 4000);

    return () => window.clearInterval(interval);
  }, [artifactValue, currentSessionStatus, fetchStatus, status.status]);

  const selectTab = (tab: SourcesTab) => {
    setActiveTab(tab);
    navigate(pathForTab(tab));
  };

  useEffect(() => {
    if (activeTab !== 'logs') return;

    void fetchHealthLogs();
    if (isSuperAdmin) {
      void fetchDetailedHealth();
    }

    const interval = window.setInterval(() => {
      void fetchHealthLogs();
      if (isSuperAdmin) {
        void fetchDetailedHealth();
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [activeTab, fetchDetailedHealth, fetchHealthLogs, isSuperAdmin]);

  const ensureConnectUiVisible = useCallback(() => {
    if (activeTab !== 'setup') {
      setActiveTab('setup');
    }
  }, [activeTab]);

  useEffect(() => {
    if (searchParams.get('connect') !== '1') {
      connectIntentConsumedRef.current = false;
      return;
    }

    if (connectIntentConsumedRef.current) {
      return;
    }

    connectIntentConsumedRef.current = true;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('connect');
    const nextSearch = nextParams.toString();
    setActiveTab('setup');
    navigate(`/whatsapp${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
    void handleConnect();
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
    if (activeTab === 'setup') {
      void fetchOfficialCloudConfig();
    }
    if (activeTab === 'audit') {
      void fetchGroupAudit();
    }
    if (activeTab === 'logs') {
      setSupportLogsFeedback(null);
      void fetchLogs();
      void fetchHealth();
      void fetchHealthLogs();
    }
  }, [activeTab, fetchGroupAudit, fetchHealth, fetchHealthLogs, fetchLogs, fetchOfficialCloudConfig, fetchOutboundWorkspace]);

  useEffect(() => {
    if (!auditSessionLabel) {
      return;
    }

    if (searchParams.get('audit') === '1') {
      navigate('/parsing-terminal', { replace: true });
      return;
    }

    if (location.pathname === '/whatsapp' && currentSessionAuditPending) {
      navigate('/parsing-terminal', { replace: true });
    }
  }, [auditSessionLabel, currentSessionAuditPending, fetchGroupAudit, location.pathname, navigate, searchParams]);

  useEffect(() => {
    if (!auditSessionLabel) {
      return;
    }

    void fetchGroupAudit(auditSessionLabel);
  }, [auditSessionLabel, fetchGroupAudit]);


  const handleConnectWrapper = async (event: React.FormEvent) => {
    event.preventDefault();
    if (connectRequestInFlightRef.current || isConnecting) {
      return;
    }

    connectRequestInFlightRef.current = true;
    setError(null);
    ensureConnectUiVisible();

    const nameToUse = deviceOwnerName || fullName;
    const phoneToUse = isWorkspacePhoneLocked ? lockedWorkspacePhone : (devicePhoneNumber || phoneNumber);
    const normalizedPhone = ensureIndiaPrefix(phoneToUse);

    if (!nameToUse.trim() || normalizedPhone.length < 12 || normalizedPhone.length > 17) {
      setError('Enter your name and 10-digit WhatsApp number first.');
      connectRequestInFlightRef.current = false;
      return;
    }

    console.log('[WhatsApp] connect submit', {
      pathname: location.pathname,
      phone: normalizedPhone,
      mode: connectMode,
    });

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
      connectRequestInFlightRef.current = false;
      return;
    }

    // Now connect using the existing handleConnect logic
    if (!deviceOwnerName && fullName) setDeviceOwnerName(fullName);
    if (!devicePhoneNumber && phoneNumber) setDevicePhoneNumber(phoneNumber);

    try {
      await handleConnect(connectMode, { ownerName: nameToUse, phoneNumber: normalizedPhone });
    } finally {
      connectRequestInFlightRef.current = false;
    }
  };

  const waitForArtifact = useCallback(async (
    label: string,
    expectedMode: 'qr' | 'pairing',
  ): Promise<ConnectionArtifact | null> => {
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

        if (response.data?.artifact?.value) {
          if (expectedMode === 'pairing') {
            const pairingCode = normalizePairingCode(response.data.artifact.value);
            if (pairingCode) {
              return {
                mode: 'pairing',
                format: 'text',
                value: pairingCode,
              };
            }
          } else {
            return response.data.artifact;
          }
        }

        if (!response.data?.artifact) {
          if (attempt === QR_POLL_ATTEMPTS - 1) {
            throw new Error(expectedMode === 'pairing'
              ? 'Pairing code is taking longer than expected. Try once more in a few seconds.'
              : 'QR code is taking longer than expected. Try once more in a few seconds.');
          }
          await new Promise((resolve) => window.setTimeout(resolve, QR_POLL_INTERVAL_MS));
          continue;
        }

        if (attempt === QR_POLL_ATTEMPTS - 1) {
          throw new Error(expectedMode === 'pairing'
            ? 'Pairing code is taking longer than expected. Try once more in a few seconds.'
            : 'QR code is taking longer than expected. Try once more in a few seconds.');
        }
        await new Promise((resolve) => window.setTimeout(resolve, QR_POLL_INTERVAL_MS));
      } catch (err) {
        const message = handleApiError(err);
        const isStillPreparing =
          message === 'QR code is still being generated.' ||
          message === 'Pairing code is still being generated.' ||
          message === 'Code not ready yet';

        if (isStillPreparing && attempt < QR_POLL_ATTEMPTS - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, QR_POLL_INTERVAL_MS));
          continue;
        }

        if (attempt === QR_POLL_ATTEMPTS - 1) throw err;
        await new Promise((resolve) => window.setTimeout(resolve, QR_POLL_INTERVAL_MS));
      }
    }

    throw new Error(expectedMode === 'pairing'
      ? 'Pairing code is taking longer than expected. Try once more in a few seconds.'
      : 'QR code is taking longer than expected. Try once more in a few seconds.');
  }, []);

  const handleConnect = useCallback(async (
    mode: 'qr' | 'pairing' = 'qr',
    values?: { ownerName?: string; phoneNumber?: string },
  ) => {
    if (connectRequestInFlightRef.current || isConnecting || pendingConnection) {
      return;
    }

    const ownerNameToUse = values?.ownerName ?? deviceOwnerName;
    const phoneNumberToUse = ensureIndiaPrefix(values?.phoneNumber ?? normalizedDevicePhone);
    const sessionLabelToUse = buildSessionLabel(ownerNameToUse || 'Owner', phoneNumberToUse || 'device');
    const sessionForLabel = status.sessions.find((session) => session.label === sessionLabelToUse);

    if (!ownerNameToUse.trim() || phoneNumberToUse.length < 12 || phoneNumberToUse.length > 17) {
      setError('Enter the device owner name and 10-digit WhatsApp number you want to connect first.');
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

    console.info('[WhatsApp] connect request', {
      mode,
      label: sessionLabelToUse,
      phoneNumber: phoneNumberToUse,
      pathname: location.pathname,
    });

    setIsConnecting(true);
    connectRequestInFlightRef.current = true;
    setError(null);
    setScanProgress(0);
    setConnectionArtifact(null);
    setQrGeneratedAt(null);
    setQrTimeLeft(0);
    try {
      console.log('[WhatsApp] connect request start', {
        mode,
        label: sessionLabelToUse,
        phoneNumber: phoneNumberToUse,
      });
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
        const nextArtifact = response.data?.artifact
          || (response.data?.pairingCode
            ? normalizePairingCode(response.data.pairingCode)
              ? { mode: 'pairing' as const, format: 'text' as const, value: normalizePairingCode(response.data.pairingCode)! }
              : null
            : null)
          || (response.data?.qr
            ? { mode: 'qr' as const, format: 'text' as const, value: response.data.qr }
            : null)
          || await waitForArtifact(
          response.data?.label || sessionLabelToUse,
          mode,
        );
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
      connectRequestInFlightRef.current = false;
    }
  }, [deviceOwnerName, ensureConnectUiVisible, fetchStatus, isConnecting, normalizedDevicePhone, pendingConnection, status.activeCount, status.limit, status.plan, status.sessions, waitForArtifact]);

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

  const handleReconnectSession = async (label?: string | null) => {
    if (!label) {
      return;
    }

    setIsResettingSession(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.reconnect, { label });
      track('whatsapp_session_reconnect', {
        label,
      });
      setPendingConnection(null);
      await fetchStatus();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsResettingSession(false);
    }
  };

  const handleResetAllSessions = async () => {
    if (!window.confirm('This will wipe all WhatsApp session state for this workspace and start fresh. Continue?')) {
      return;
    }

    setIsResettingSession(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.resetAll, {});
      track('whatsapp_session_reset_all', {
        workspace: 'current',
      });
      setConnectionArtifact(null);
      setRenderedQrMarkup(null);
      setQrGeneratedAt(null);
      setQrTimeLeft(0);
      setScanProgress(0);
      setPendingConnection(null);
      await fetchStatus();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsResettingSession(false);
    }
  };

  const saveAssistantSettings = useCallback(async (overrides?: {
    parseDirectMessages?: boolean;
    selfChatEnabled?: boolean;
  }) => {
    if (!currentSession?.label) {
      setError('Connect a WhatsApp session first.');
      return false;
    }

    const nextParseDirectMessages = overrides?.parseDirectMessages ?? parseDirectMessages;
    const nextSelfChatEnabled = overrides?.selfChatEnabled ?? selfChatEnabled;

    setIsSavingParsingPrefs(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.config, {
        session_label: currentSession.label,
        parse_direct_messages: nextParseDirectMessages,
        self_chat_enabled: nextSelfChatEnabled,
      });
      setParseDirectMessages(nextParseDirectMessages);
      setSelfChatEnabled(nextSelfChatEnabled);
      await fetchStatus();
      await fetchLogs();
      await fetchHealth();
      return true;
    } catch (err) {
      setError(handleApiError(err));
      return false;
    } finally {
      setIsSavingParsingPrefs(false);
    }
  }, [currentSession?.label, fetchHealth, fetchLogs, fetchStatus, parseDirectMessages, selfChatEnabled]);

  const handleParseDirectMessagesToggle = async () => {
    const nextParseDirectMessages = !parseDirectMessages;
    setParseDirectMessages(nextParseDirectMessages);
    const saved = await saveAssistantSettings({ parseDirectMessages: nextParseDirectMessages });
    if (!saved) {
      setParseDirectMessages(currentSessionParseDirectMessages);
    }
  };

  const handleSelfChatAuditToggle = async () => {
    const nextSelfChatEnabled = !selfChatEnabled;
    setSelfChatEnabled(nextSelfChatEnabled);
    const saved = await saveAssistantSettings({ selfChatEnabled: nextSelfChatEnabled });
    if (!saved) {
      setSelfChatEnabled(currentSessionSelfChatEnabled);
    }
  };

  const handleAddAnotherNumber = () => {
    setDeviceOwnerName(fullName || '');
    setDevicePhoneNumber('91');
    setPendingConnection(null);
    setConnectionArtifact(null);
    setQrGeneratedAt(null);
    setQrTimeLeft(0);
    setError(null);
  };

  const handleSelectExistingSession = (session: WhatsappSession) => {
    setDeviceOwnerName(session.ownerName || fullName || '');
    setDevicePhoneNumber(ensureIndiaPrefix(session.phoneNumber || ''));
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

  const toggleGroupStreamItems = async (groupId: string) => {
    if (expandedAuditParseIds.includes(groupId)) {
      setExpandedAuditParseIds((current) => current.filter((id) => id !== groupId));
      return;
    }

    setExpandedAuditParseIds((current) => [...current, groupId]);

    if (groupStreamItems[groupId]) return;

    setLoadingGroupStreamItems((current) => ({ ...current, [groupId]: true }));
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.groupStreamItems(groupId), {
        params: { limit: 5 },
      });
      setGroupStreamItems((current) => ({
        ...current,
        [groupId]: response.data?.items || [],
      }));
    } catch {
      setGroupStreamItems((current) => ({ ...current, [groupId]: [] }));
    } finally {
      setLoadingGroupStreamItems((current) => ({ ...current, [groupId]: false }));
    }
  };

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

  const handleAllowAllRealEstate = async () => {
    if (!auditSessionLabel || !groupAudit) {
      setError('Connect a WhatsApp session first.');
      return;
    }

    setIsAllowingAllRealEstate(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.auditAllowAll, {
        sessionLabel: auditSessionLabel,
      });

      await Promise.all([
        fetchStatus(),
        fetchGroupAudit(auditSessionLabel),
        fetchHealth(),
      ]);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsAllowingAllRealEstate(false);
    }
  };

  const handleApplyGroupAudit = async () => {
    if (!auditSessionLabel || !groupAudit) {
      setError('Connect a WhatsApp session first.');
      return;
    }

    setIsApplyingGroupAudit(true);
    setError(null);
    try {
      const parseGroupIds = selectedAuditParseIds;
      const ignoreGroupIds = groupAudit.groups
        .filter((group) => !parseGroupIds.includes(group.id))
        .map((group) => group.id);

      await backendApi.post(ENDPOINTS.whatsapp.groupsAudit, {
        sessionLabel: auditSessionLabel,
        parseGroupIds,
        ignoreGroupIds,
      });

      await Promise.all([
        fetchStatus(),
        fetchGroupAudit(auditSessionLabel),
        fetchHealth(),
      ]);
      setActiveTab('setup');
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsApplyingGroupAudit(false);
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
  const isCurrentSessionConnecting = currentSessionStatus === 'connecting' || currentSessionStatus === 'reconnecting';
  const displayCurrentConnectionNumber = isCurrentSessionConnected ? displayConnectedNumber : displaySelectedDeviceNumber;
  const displayCurrentConnectionName = isCurrentSessionConnected ? displayConnectedName : displaySelectedDeviceName;
  const workspaceConnectedCount = status.activeCount || 0;
  const hasOtherConnectedSessions = workspaceConnectedCount > (isCurrentSessionConnected ? 1 : 0);
  const selectedOutboundSession = allowedConnectedSenderSessions.find((session) => session.label === outboundSessionKey) || null;
  const outboundSenderDescription = selectedOutboundSession
    ? normalizePhoneNumber(selectedOutboundSession.phoneNumber || '') === MARKETING_AGENT_PHONE
      ? 'Marketing agent lane'
      : 'Broker-connected lane'
    : status.hasOutboundLaneRestriction
      ? 'No assigned sender lane is connected right now'
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
  const filteredAuditGroups = useMemo(() => {
    const groups = groupAudit?.groups || [];
    const query = groupAuditSearchTerm.trim().toLowerCase();

    return groups.filter((group) => {
      const selected = selectedAuditParseIds.includes(group.id);
      const matchesFilter =
        groupAuditFilter === 'all'
        || (groupAuditFilter === 'selected' && selected)
        || (groupAuditFilter === 'not_selected' && !selected)
        || group.recommendation === groupAuditFilter;

      if (!matchesFilter) return false;
      if (!query) return true;

      const haystack = [
        group.name,
        group.locality,
        group.city,
        group.category,
        ...(group.tags || []),
        ...(group.reasons || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [groupAudit?.groups, groupAuditFilter, groupAuditSearchTerm, selectedAuditParseIds]);
  const auditFilterCounts = useMemo(() => {
    const groups = groupAudit?.groups || [];
    return groups.reduce<Record<GroupAuditFilter, number>>(
      (counts, group) => {
        const selected = selectedAuditParseIds.includes(group.id);
        counts.all += 1;
        counts[group.recommendation] += 1;
        counts[selected ? 'selected' : 'not_selected'] += 1;
        return counts;
      },
      { all: 0, selected: 0, not_selected: 0, parse: 0, review: 0, ignore: 0 },
    );
  }, [groupAudit?.groups, selectedAuditParseIds]);
  const disconnectTargetLabel = currentSession?.label || primaryConnectedSession?.label || pendingConnection?.label || activeSessionLabel || null;
  const isQrExpired = Boolean(artifactValue) && qrTimeLeft === 0 && !isCurrentSessionConnected;
  const showConnectionArtifactPanel = Boolean(artifactValue) || (isConnecting && Boolean(artifactMode) && !isCurrentSessionConnected);
  const selectedHealthSession = useMemo(() => {
    const targetLabel = currentSession?.label || primaryConnectedSession?.label || '';
    return health.sessions.find((session) => session.sessionLabel === targetLabel) || health.sessions[0] || null;
  }, [currentSession?.label, health.sessions, primaryConnectedSession?.label]);
  const selectedDetailedSession = useMemo(() => {
    const targetLabel = selectedHealthSession?.sessionLabel || currentSession?.label || primaryConnectedSession?.label || '';
    if (!targetLabel) return null;
    return detailedHealth?.sessions.find((session) => session.label === targetLabel) || null;
  }, [currentSession?.label, detailedHealth?.sessions, primaryConnectedSession?.label, selectedHealthSession?.sessionLabel]);
  const scopedGroupHealth = useMemo(() => {
    if (!selectedHealthSession?.sessionLabel) return groupHealth;
    return groupHealth.filter((group) => group.sessionLabel === selectedHealthSession.sessionLabel);
  }, [groupHealth, selectedHealthSession?.sessionLabel]);
  const scopedEventLogs = useMemo(() => {
    if (!selectedHealthSession?.sessionLabel) return eventLogs;
    const nextEvents = eventLogs.filter((event) => event.sessionLabel === selectedHealthSession.sessionLabel);
    return nextEvents.length > 0 ? nextEvents : eventLogs;
  }, [eventLogs, selectedHealthSession?.sessionLabel]);
  const selectedHealthSummary = useMemo<WhatsappHealthSummary>(() => {
    if (!selectedHealthSession) return health.summary;
    return {
      groupCount: Math.max(selectedHealthSession.groupCount || 0, scopedGroupHealth.length),
      activeGroups24h: Math.max(selectedHealthSession.activeGroups24h || 0, scopedGroupHealth.filter((group) => group.status === 'active').length),
      messagesReceived24h: selectedHealthSession.messagesReceived24h,
      messagesParsed24h: selectedHealthSession.messagesParsed24h,
      messagesFailed24h: selectedHealthSession.messagesFailed24h,
      replayBacklog24h: Number((health.summary as WhatsappHealthSummary).replayBacklog24h || 0),
      replayCompleted24h: Number((health.summary as WhatsappHealthSummary).replayCompleted24h || 0),
      replayFailed24h: Number((health.summary as WhatsappHealthSummary).replayFailed24h || 0),
      parserSuccessRate: selectedHealthSession.parserSuccessRate,
      healthState: selectedHealthSession.healthState,
    };
  }, [health.summary, scopedGroupHealth, selectedHealthSession]);
  const replayBacklog24h = Math.max(Number(selectedHealthSummary.replayBacklog24h || 0), 0);
  const replayCompleted24h = Math.max(Number(selectedHealthSummary.replayCompleted24h || 0), 0);
  const replayFailed24h = Math.max(Number(selectedHealthSummary.replayFailed24h || 0), 0);
  const primaryHealthSession = selectedHealthSession;
  const liveTransportState = currentSessionStatus === 'connected'
    ? 'Connected'
    : currentSessionStatus === 'connecting'
      ? 'Connecting'
      : currentSessionStatus === 'reconnecting'
        ? 'Reconnecting'
        : 'Disconnected';
  const lastParsedAtMs = primaryHealthSession?.lastParsedMessageAt ? new Date(primaryHealthSession.lastParsedMessageAt).getTime() : NaN;
  const freshParseStalled = Number.isFinite(lastParsedAtMs)
    ? Date.now() - lastParsedAtMs > 24 * 60 * 60 * 1000
    : true;
  const freshParseState = freshParseStalled ? 'Stalled' : 'Active';
  const staleGroupCount = scopedGroupHealth.filter((group) => group.status === 'stale').length;
  const activeGroupCount = scopedGroupHealth.filter((group) => group.status === 'active').length;
  const latestIssueEvent = useMemo(() => {
    const priorityEvents = [
      'ingestion_stalled',
      'heartbeat_restart_stalled_connected',
      'heartbeat_rehydrate_failed',
      'heartbeat_restart_disconnected',
      'disconnected',
    ];

    return scopedEventLogs.find((event) => priorityEvents.includes(event.eventType))
      || scopedEventLogs.find((event) => describeWhatsappEvent(event).length > 0)
      || null;
  }, [scopedEventLogs]);
  const latestIssueDetails = latestIssueEvent ? describeWhatsappEvent(latestIssueEvent) : [];
  const latestIssueLabel = latestIssueEvent
    ? formatReasonLabel(latestIssueEvent.eventType) || latestIssueEvent.eventType
    : null;
  const latestDisconnectReason = formatReasonLabel(primaryHealthSession?.disconnectReason || null);
  const sessionReplacedConflict = String(primaryHealthSession?.disconnectReason || '').trim().toLowerCase() === 'replaced'
    || Boolean(primaryHealthSession?.autoReconnectBlocked);
  const reconnectCooldownUntil = useMemo(() => {
    const cooldownEvents = scopedEventLogs
      .filter((event) => event.eventType === 'heartbeat_restart_stalled_connected' || event.eventType === 'heartbeat_restart_disconnected')
      .map((event) => new Date(event.createdAt).getTime())
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => right - left);
    if (cooldownEvents.length === 0) return null;
    return cooldownEvents[0] + 30 * 60 * 1000;
  }, [scopedEventLogs]);
  const reconnectCooldownRemainingMs = reconnectCooldownUntil ? reconnectCooldownUntil - Date.now() : null;
  const reconnectCooldownActive = Number.isFinite(reconnectCooldownRemainingMs || NaN) && (reconnectCooldownRemainingMs || 0) > 0;
  const lastSessionActivityAt = [
    primaryHealthSession?.lastInboundMessageAt,
    primaryHealthSession?.lastParsedMessageAt,
    primaryHealthSession?.lastGroupSyncAt,
    primaryHealthSession?.connectedAt,
    currentSession?.lastSync,
  ]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
  const qrMarkup = artifactMode === 'qr' ? renderedQrMarkup : null;

  const planCards = PROPAI_PLAN_CARDS;
  const pageMeta = {
    setup: {
      eyebrow: 'WhatsApp',
      title: 'Connect and manage WhatsApp ingestion.',
      copy: 'Connect broker WhatsApp numbers so PropAI can ingest chats, parse groups into Stream, and run the assistant from the same workspace.',
    },
    audit: {
      eyebrow: 'Group Audit',
      title: 'Group audit',
      copy: '',
    },
    pricing: {
      eyebrow: 'Pricing',
      title: 'Plan access for PropAI WhatsApp and Stream.',
      copy: 'Review device limits, team pricing, and referral terms without mixing billing decisions into the WhatsApp operations page.',
    },
    logs: {
      eyebrow: 'WA Logs',
      title: 'Monitor WhatsApp health, lifecycle events, and parsing coverage.',
      copy: 'Use this dedicated log view for ingestion health, recent session events, support bundles, and parsed message checks.',
    },
  }[activeTab];

  return (
    <div className={cn(activeTab === 'audit' ? 'space-y-4' : 'space-y-8')}>
      <div className={cn(
        'rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)]',
        activeTab === 'audit' ? 'p-4' : 'p-6 md:p-8',
      )}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              <Smartphone className="h-3.5 w-3.5" />
              {pageMeta.eyebrow}
            </div>
            <h2 className={cn(
              'font-bold tracking-[-0.03em] text-[var(--text-primary)]',
              activeTab === 'audit' ? 'mt-2 text-[22px]' : 'mt-4 text-[28px]',
            )}>
              {pageMeta.title}
            </h2>
            {pageMeta.copy ? (
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
                {pageMeta.copy}
              </p>
            ) : null}
          </div>

          <div className={cn(
            'rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)]',
            activeTab === 'audit' ? 'px-3 py-2' : 'px-4 py-3',
          )}>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Access model</p>
            <p className="mt-1 text-[14px] font-bold text-[var(--text-primary)]">{accessModelLabel}</p>
            {activeTab === 'audit' ? null : (
              <p className="text-[11px] text-[var(--text-secondary)]">
                {user?.appRole === 'super_admin'
                  ? 'Owner access. Workspace limits do not apply to this account.'
                  : 'Trial 7 days free, Pro ₹999/mo for 1 device, Team ₹999/seat/mo — each member links their own account.'}
              </p>
            )}
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

      {activeTab === 'setup' ? (
      <div className="flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-1">
        {WHATSAPP_TABS.map((tab) => (
          <button
            type="button"
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
      ) : null}

      {activeTab === 'setup' ? (
      <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Broker-controlled privacy</p>
              <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">First scan goes through a group audit. Direct chats stay off until you enable them.</h3>
              <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
              On a newly connected number, PropAI audits group quality and parses synced groups by default. Keep noisy groups out of Stream during audit. The AI assistant on this number and 1:1 direct messages stay off until you enable them for the current connected session.
              </p>
            </div>

        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Session state', value: currentSessionStatus === 'connected' ? 'Live' : currentSessionStatus === 'connecting' || currentSessionStatus === 'reconnecting' ? 'Recovering' : 'Offline' },
            { label: 'Last activity', value: formatDateTime(lastSessionActivityAt) },
            { label: 'Last inbound', value: formatDateTime(primaryHealthSession?.lastInboundMessageAt) },
            { label: 'Last parse', value: formatDateTime(primaryHealthSession?.lastParsedMessageAt) },
          ].map((item) => (
            <div key={item.label} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{item.label}</p>
              <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
      ) : null}

      {activeTab === 'setup' ? (
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Official WhatsApp API</p>
              <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">One official number for conversational AI. Replies stay free-form inside the 24-hour window.</h3>
              <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                Use this for your Meta/Cloud API number. Brokers or clients message first, PropAI answers conversationally, and every inbound message can still feed the same parsing and stream pipeline.
              </p>
            </div>
            <div className={cn('rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)]', officialCloudConfig?.enabled ? 'text-[var(--accent)]' : '')}>
              {officialCloudLoading ? 'Loading config…' : officialCloudConfig?.configured ? (officialCloudConfig.enabled ? 'Official API enabled' : 'Official API saved, disabled') : 'Not configured'}
            </div>
          </div>

          {officialCloudFeedback ? (
            <div className={cn(
              'mt-4 rounded-[10px] border px-3 py-2 text-[12px]',
              officialCloudFeedback.tone === 'success'
                ? 'border-[rgba(62,232,138,0.2)] bg-[rgba(62,232,138,0.08)] text-[var(--accent)]'
                : 'border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] text-[var(--red)]',
            )}>
              {officialCloudFeedback.message}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Display phone</span>
              <input
                value={officialCloudDisplayPhoneNumber}
                onChange={(event) => setOfficialCloudDisplayPhoneNumber(event.target.value)}
                placeholder="+91..."
                className={sourceFieldClassName}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Phone number ID</span>
              <input
                value={officialCloudPhoneNumberId}
                onChange={(event) => setOfficialCloudPhoneNumberId(event.target.value)}
                placeholder="123456789012345"
                className={sourceFieldClassName}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Business account ID</span>
              <input
                value={officialCloudBusinessAccountId}
                onChange={(event) => setOfficialCloudBusinessAccountId(event.target.value)}
                placeholder="123456789012345"
                className={sourceFieldClassName}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">API version</span>
              <input
                value={officialCloudApiVersion}
                onChange={(event) => setOfficialCloudApiVersion(event.target.value)}
                placeholder="v20.0"
                className={sourceFieldClassName}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Webhook verify token</span>
              <input
                value={officialCloudVerifyToken}
                onChange={(event) => setOfficialCloudVerifyToken(event.target.value)}
                placeholder="Used for the Meta webhook verify challenge"
                className={sourceFieldClassName}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Access token</span>
              <input
                value={officialCloudAccessToken}
                onChange={(event) => setOfficialCloudAccessToken(event.target.value)}
                placeholder="Meta access token"
                className={sourceFieldClassName}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1 text-[12px] text-[var(--text-secondary)]">
              <p>Webhook URL: <span className="font-semibold text-[var(--text-primary)]">{officialCloudConfig?.webhookUrl || '/api/whatsapp/cloud/webhook'}</span></p>
              <p>Enable this only for the official Cloud API number. It stays separate from the linked-device WhatsApp runtime.</p>
            </div>
            <button
              type="button"
              onClick={() => void saveOfficialCloudConfig()}
              className={sourcePrimaryButton}
              disabled={officialCloudSaving || officialCloudLoading || !officialCloudPhoneNumberId}
            >
              <Smartphone className="h-4 w-4" />
              {officialCloudSaving ? 'Saving...' : 'Save official API config'}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'audit' ? (
        <div className="space-y-4">
          <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] font-medium text-[var(--text-secondary)]">
                Real-estate groups (signal &ge; 50) auto-allow. Review others before Stream fills.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleAllowAllRealEstate()}
                  className={sourceSecondaryButton}
                  disabled={isAllowingAllRealEstate || !auditSessionLabel || !groupAudit}
                >
                  {isAllowingAllRealEstate ? 'Allowing...' : 'Allow all real_estate groups'}
                </button>
                <button
                  type="button"
                  onClick={() => void fetchGroupAudit()}
                  className={sourceSecondaryButton}
                  disabled={isLoadingGroupAudit || !auditSessionLabel}
                >
                  <RefreshCw className={cn('h-4 w-4', isLoadingGroupAudit && 'animate-spin')} />
                  Refresh audit
                </button>
                <button
                  type="button"
                  onClick={() => void handleApplyGroupAudit()}
                  className={sourcePrimaryButton}
                  disabled={isApplyingGroupAudit || !auditSessionLabel || !groupAudit}
                >
                  <Zap className="h-4 w-4" />
                  {isApplyingGroupAudit ? 'Applying...' : 'Apply audit decisions'}
                </button>
              </div>
            </div>

            {!auditSessionLabel ? (
              <div className="mt-4 rounded-[10px] border border-[color:rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-[12px] text-[var(--amber)]">
                Connect a WhatsApp number first. Audit becomes available as soon as the group sync completes.
              </div>
            ) : null}

            {auditSessionLabel ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <MessageSquare className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">Self chat</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {selfChatEnabled ? 'Private lane on. Send "Hi" to start.' : 'Private lane off.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSelfChatAuditToggle()}
                  disabled={isSavingParsingPrefs || !currentSession?.label}
                  className={cn(
                    'relative h-6 w-11 rounded-full border transition-colors disabled:opacity-50',
                    selfChatEnabled
                      ? 'border-[color:var(--accent-border)] bg-[var(--accent)]'
                      : 'border-[color:var(--border)] bg-[var(--bg-elevated)]',
                  )}
                  aria-pressed={selfChatEnabled}
                  aria-label="Toggle self chat on this number"
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      selfChatEnabled ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
            ) : null}

            {groupAudit ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: 'Total groups', value: groupAudit.summary.totalGroups, note: 'Synced from this number.' },
                  { label: 'Auto-allowed', value: selectedAuditParseIds.length, note: 'Real-estate groups (signal ≥ 50) auto-allow. Review others below.' },
                  { label: 'Cross-group overlap', value: groupAudit.summary.overlappingParticipants ?? groupAudit.summary.duplicateParticipants, note: `${groupAudit.summary.overlappingParticipantRate ?? groupAudit.summary.duplicateParticipantRate}% of ${groupAudit.summary.uniqueParticipants} unique numbers appear in more than one group.` },
                  { label: 'Average chaos', value: groupAudit.summary.averageChaosScore, note: 'Overlap pressure plus noisy/off-topic signals.' },
                  { label: 'Likely real-estate groups', value: groupAudit.summary.realEstateGroups, note: 'Groups with broker/property signals or business classification.' },
                ].map((item) => (
                  <div key={item.label} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{item.label}</p>
                    <p className="mt-1 text-[22px] font-bold text-[var(--text-primary)]">{item.value}</p>
                    <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">{item.note}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {groupAudit ? (
              <div className="mt-2 grid gap-2 lg:grid-cols-3">
                {[
                  { label: 'Signal', copy: 'Real-estate intent from group name, locality, category, and member surface.' },
                  { label: 'Noise', copy: 'Personal, promo, media, or off-topic naming patterns that reduce parsing confidence.' },
                  { label: 'Chaos', copy: 'A combined risk score from cross-group member overlap and noise.' },
                ].map((item) => (
                  <div key={item.label} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">{item.label}</p>
                    <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">{item.copy}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Per-group decisions</p>
                <h4 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">Review groups kept in or out of Stream</h4>
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                Auto-allowed: <span className="font-semibold text-[var(--text-primary)]">{selectedAuditParseIds.length}</span>
                <span className="mx-2">·</span>
                Review: <span className="font-semibold text-[var(--text-primary)]">{(groupAudit?.groups.length || 0) - selectedAuditParseIds.length}</span>
              </div>
            </div>

            {groupAudit && groupAudit.groups.length > 0 ? (
              <div className="mt-4 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-center">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input
                      value={groupAuditSearchTerm}
                      onChange={(event) => setGroupAuditSearchTerm(event.target.value)}
                      placeholder="Filter by group name, locality, category, reason, or tag"
                      className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] py-2.5 pl-9 pr-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[color:var(--accent-border)]"
                    />
                  </label>
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div className="flex shrink-0 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-1">
                      {GROUP_AUDIT_FILTERS.map((filter) => {
                        const active = groupAuditFilter === filter.id;
                        return (
                          <button
                            key={filter.id}
                            type="button"
                            onClick={() => setGroupAuditFilter(filter.id)}
                            className={cn(
                              'whitespace-nowrap rounded-[8px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                              active
                                ? 'bg-[var(--accent)] text-[#020f07]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                            )}
                          >
                            {filter.label} {auditFilterCounts[filter.id]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                  Showing <span className="font-semibold text-[var(--text-primary)]">{filteredAuditGroups.length}</span> of{' '}
                  <span className="font-semibold text-[var(--text-primary)]">{groupAudit.groups.length}</span> synced groups.
                </p>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {isLoadingGroupAudit ? (
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                  Building group intelligence audit...
                </div>
              ) : !groupAudit ? (
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                  {currentSession?.label || primaryConnectedSession?.label
                    ? `Group audit is not available yet. ${groupAuditError ? `Last attempt: ${groupAuditError}` : 'Refresh once WhatsApp group sync finishes.'}`
                    : 'Connect a WhatsApp number first. Audit becomes available after the first group sync.'}
                </div>
              ) : groupAudit.groups.length === 0 ? (
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                  Group sync in progress — groups appear here once Baileys fetches them from WhatsApp. This usually takes a few seconds after connecting.
                </div>
              ) : filteredAuditGroups.length === 0 ? (
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                  No groups match the current filter.
                </div>
              ) : (
                filteredAuditGroups.map((group) => {
                  const selected = selectedAuditParseIds.includes(group.id);
                  const isExpanded = expandedAuditParseIds.includes(group.id);
                  const overlappingMemberCount = group.overlappingMemberCount ?? group.duplicateMemberCount;
                  const topOverlappingGroups = Array.isArray(group.overlappingGroups) ? group.overlappingGroups.slice(0, 3) : [];
                  const items = groupStreamItems[group.id];
                  const isLoadingItems = loadingGroupStreamItems[group.id];
                  const groupStatus = group.autoAllow ? 'allowed' : (group.status || group.recommendation);
                  return (
                    <div key={group.id} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{group.name}</p>
                            <span className={cn(
                              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                              groupStatus === 'allowed'
                                ? 'border-[color:var(--accent-border)] bg-[rgba(62,232,138,0.08)] text-[var(--accent)]'
                                : groupStatus === 'ignored'
                                  ? 'border-[color:rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] text-[var(--red)]'
                                  : 'border-[color:rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] text-[var(--amber)]',
                            )}>
                              {groupStatus === 'allowed' ? 'Allowed' : groupStatus}
                            </span>
                          </div>
                          <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
                            {[group.locality, group.city, group.category, `${group.participantsCount} members`, `${overlappingMemberCount} numbers also in other groups`, `${group.duplicateOverlapPercent}% cross-group overlap`].filter(Boolean).join(' • ')}
                          </p>
                          {group.reasons.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {group.reasons.slice(0, 4).map((reason) => (
                                <span key={reason} className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                                  {reason}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {topOverlappingGroups.length > 0 ? (
                            <div className="mt-3 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Overlaps with</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {topOverlappingGroups.map((overlap) => (
                                  <span key={overlap.id} className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                                    {overlap.name} · {overlap.sharedMemberCount} shared
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="grid min-w-[240px] gap-2 sm:grid-cols-3 lg:w-[280px]">
                          <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Signal</p>
                            <p className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">{group.signalScore}</p>
                            <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">Property intent</p>
                          </div>
                          <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Chaos</p>
                            <p className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">{group.chaosScore}</p>
                            <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">Overlap + noise</p>
                          </div>
                          <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-3">
                            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Noise</p>
                            <p className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">{group.noiseScore}</p>
                            <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">Off-topic risk</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {!selected ? (
                          <button
                            type="button"
                            onClick={() => setSelectedAuditParseIds((current) => current.includes(group.id) ? current : [...current, group.id])}
                            className={sourceSecondaryButton}
                          >
                            Allow in Stream
                          </button>
                        ) : null}
                        {selected ? (
                          <button
                            type="button"
                            onClick={() => setSelectedAuditParseIds((current) => current.filter((id) => id !== group.id))}
                            className={cn(sourceSecondaryButton, 'border-[color:rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] text-[var(--red)] hover:bg-[rgba(239,68,68,0.12)]')}
                          >
                            Keep out of Stream
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-4 border-t border-[color:var(--border)] pt-3">
                        <button
                          type="button"
                          onClick={() => void toggleGroupStreamItems(group.id)}
                          className="flex w-full items-center justify-between text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          <span>Parsing Activity</span>
                          <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
                        </button>
                        {isExpanded ? (
                          <div className="mt-3 space-y-2">
                            {isLoadingItems ? (
                              <p className="text-[11px] text-[var(--text-secondary)]">Loading parsed items...</p>
                            ) : !selected && !group.autoAllow ? (
                              <div className="rounded-[10px] border border-[color:rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.06)] px-3 py-2 text-[11px] text-[var(--amber)]">
                                This group is not in Stream. Allow it in Stream above or apply audit decisions to start parsing messages here.
                              </div>
                            ) : !items || items.length === 0 ? (
                              <p className="text-[11px] text-[var(--text-secondary)]">No parsed messages yet for this group.</p>
                            ) : (
                              items.map((item) => (
                                <div key={item.id} className="rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-2">
                                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                                    <span className="rounded-full border border-[color:var(--border)] px-1.5 py-0.5 uppercase">{item.record_type}</span>
                                    {item.type ? <span>{item.type}</span> : null}
                                    {item.locality ? <span>{item.locality}</span> : null}
                                    {item.bhk ? <span>{item.bhk}BHK</span> : null}
                                    {item.price_numeric ? <span>₹{Number(item.price_numeric).toLocaleString()}</span> : null}
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-[10px] text-[var(--text-secondary)]">{item.raw_text}</p>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
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
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Core PropAI pricing for WhatsApp ingestion and Stream.</h3>
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
              WhatsApp here is the main ingestion engine for PropAI. It connects broker numbers, reads inbound activity, feeds Stream, and gives the AI assistant live message context inside the same workspace.
            </p>
          </div>

          <div className="mt-5 rounded-[12px] border border-[color:var(--accent-border)] bg-[rgba(62,232,138,0.08)] p-4">
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleSubmitSupportLogs()}
                disabled={isSubmittingSupportLogs}
                className={cn(sourcePrimaryButton, 'rounded-full px-3 py-2 text-[10px]')}
              >
                {isSubmittingSupportLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send logs to support
              </button>
              <button
                onClick={() => {
                  void fetchLogs();
                  void fetchHealth();
                  if (isSuperAdmin) {
                    void fetchDetailedHealth();
                  }
                  void fetchHealthLogs();
                }}
                className={cn(sourceSecondaryButton, 'rounded-full px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Connected number', value: primaryHealthSession?.phoneNumber || status.connectedPhoneNumber || 'Not connected' },
              { label: 'Groups detected', value: String(selectedHealthSummary.groupCount) },
              { label: 'Active groups today', value: String(activeGroupCount || selectedHealthSummary.activeGroups24h) },
              { label: 'Messages received', value: String(selectedHealthSummary.messagesReceived24h) },
              { label: 'Replay backlog', value: String(replayBacklog24h) },
              { label: 'Replayed after reconnect', value: String(replayCompleted24h) },
              { label: 'Needs review', value: String(replayFailed24h) },
              { label: 'Parsed into Pulse', value: `${selectedHealthSummary.messagesParsed24h} (${selectedHealthSummary.parserSuccessRate}%)` },
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
                  {selectedHealthSummary.healthState === 'healthy'
                    ? 'Healthy: Pulse is reading and parsing your WhatsApp activity.'
                    : selectedHealthSummary.healthState === 'critical'
                      ? 'Attention: WhatsApp is disconnected or ingestion is stalled.'
                      : 'Warning: Pulse is connected, but some ingestion signals need attention.'}
                </h4>
              </div>
              <span className={cn('rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]', getHealthTone(selectedHealthSummary.healthState))}>
                {selectedHealthSummary.healthState}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">Live transport</p>
                <p className={cn(
                  'mt-1 text-[13px] font-semibold',
                  liveTransportState === 'Connected'
                    ? 'text-[var(--accent)]'
                    : liveTransportState === 'Connecting' || liveTransportState === 'Reconnecting'
                      ? 'text-[var(--amber)]'
                      : 'text-[var(--red)]',
                )}>
                  {liveTransportState}
                </p>
              </div>
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">Fresh parse</p>
                <p className={cn(
                  'mt-1 text-[13px] font-semibold',
                  freshParseState === 'Active' ? 'text-[var(--accent)]' : 'text-[var(--red)]',
                )}>
                  {freshParseState}
                </p>
              </div>
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">Last parsed</p>
                <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)]">
                  {formatDateTime(primaryHealthSession?.lastParsedMessageAt)}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3 md:col-span-2">
                <p className="text-[11px] text-[var(--text-secondary)]">Latest issue</p>
                <p className={cn(
                  'mt-1 text-[13px] font-semibold',
                  selectedHealthSummary.healthState === 'healthy' ? 'text-[var(--accent)]' : 'text-[var(--red)]',
                )}>
                  {latestDisconnectReason
                    ? `Disconnect reason: ${latestDisconnectReason}`
                    : latestIssueLabel || 'No active issue detected'}
                </p>
                {latestIssueDetails.length > 0 ? (
                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                    {latestIssueDetails.join(' · ')}
                  </p>
                ) : null}
                {latestIssueEvent?.createdAt ? (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    Last issue event {formatDateTime(latestIssueEvent.createdAt)}
                  </p>
                ) : null}
              </div>
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

          {supportLogsFeedback && (
            <div className={cn(
              'mt-5 rounded-[12px] border px-4 py-3 text-[12px]',
              supportLogsFeedback.tone === 'success'
                ? 'border-[color:var(--accent-border)] bg-[rgba(62,232,138,0.08)] text-[var(--accent)]'
                : 'border-[color:rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] text-[var(--red)]',
            )}>
              {supportLogsFeedback.message}
            </div>
          )}

          {isSuperAdmin && selectedDetailedSession ? (
            <div className="mt-5 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Runtime diagnostics</p>
                  <h4 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">Admin-only watchdog markers</h4>
                </div>
                <span className={cn('rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]', getHealthTone(selectedHealthSummary.healthState))}>
                  {selectedDetailedSession.label}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                  <p className="text-[11px] text-[var(--text-secondary)]">Current stall signature</p>
                  <p className="mt-1 break-all text-[12px] font-semibold text-[var(--text-primary)]">
                    {selectedDetailedSession.diagnostics?.lastIngestionStallAlertSignature || 'No persisted stall marker'}
                  </p>
                </div>
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                  <p className="text-[11px] text-[var(--text-secondary)]">Last alert sent</p>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">
                    {formatDateTime(selectedDetailedSession.diagnostics?.lastIngestionStallAlertAt || null)}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {selectedDetailedSession.diagnostics?.lastIngestionStallAlertDelivery || 'none'}
                  </p>
                </div>
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                  <p className="text-[11px] text-[var(--text-secondary)]">Reconnect cooldown</p>
                  <p className={cn(
                    'mt-1 text-[12px] font-semibold',
                    reconnectCooldownActive ? 'text-[var(--amber)]' : 'text-[var(--accent)]',
                  )}>
                    {reconnectCooldownActive ? `Active for ${formatElapsed(reconnectCooldownRemainingMs) || 'a short time'}` : 'Idle'}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {reconnectCooldownUntil ? `Until ${formatDateTime(new Date(reconnectCooldownUntil).toISOString())}` : 'No recent heartbeat restart'}
                  </p>
                </div>
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                  <p className="text-[11px] text-[var(--text-secondary)]">Reconnect attempts</p>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">
                    {selectedDetailedSession.liveData?.reconnectAttempts || 0}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {selectedDetailedSession.liveData?.isReconnecting ? 'reconnecting now' : 'not reconnecting'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Recent session events</p>
                <div className="pulse-scrollbar mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {scopedEventLogs.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[12px] text-[var(--text-secondary)]">
                      No lifecycle events yet. Connection, group sync, and disconnect events will show up here.
                    </div>
                  ) : (
                    scopedEventLogs.map((event) => (
                      <div key={event.id} className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">{(event.eventType || 'unknown').split('_').join(' ')}</p>
                          <p className="text-[10px] text-[var(--text-secondary)]">{formatDateTime(event.createdAt)}</p>
                        </div>
                        {event.sessionLabel ? (
                          <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{event.sessionLabel}</p>
                        ) : null}
                        <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">{event.message}</p>
                        {describeWhatsappEvent(event).length > 0 ? (
                          <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                            {describeWhatsappEvent(event).join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Recent parsed messages</p>
              <div className="pulse-scrollbar mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">
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
                    value={connectPhoneValue}
                    onChange={(e) => { setDevicePhoneNumber(e.target.value); setPhoneNumber(e.target.value); }}
                    placeholder="9876543210"
                    className={cn(sourceFieldClassName, 'pl-9')}
                    disabled={isWorkspacePhoneLocked}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                  {isWorkspacePhoneLocked ? (
                    <>This workspace is locked to <span className="text-[var(--text-primary)]">{lockedWorkspacePhone}</span>. Use this number for WhatsApp connection.</>
                  ) : (
                    <>Enter your 10-digit WhatsApp number. <span className="text-[var(--text-primary)]">91</span> (India) is added automatically.</>
                  )}
                </p>
              </label>

              <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Connect mode</p>
                    <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Use QR on desktop or pairing code from the broker phone.</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)] p-1">
                    <button
                      type="button"
                      onClick={() => setConnectMode('qr')}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors',
                        connectMode === 'qr'
                          ? 'bg-[var(--accent)] text-[var(--bg-base)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      QR scan
                    </button>
                    <button
                      type="button"
                      onClick={() => setConnectMode('pairing')}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors',
                        connectMode === 'pairing'
                          ? 'bg-[var(--accent)] text-[var(--bg-base)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      Code-based
                    </button>
                  </div>
                </div>
              </div>

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
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                    {isCurrentSessionConnected ? 'Current connection' : 'Selected session'}
                  </p>
                  <p className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">
                    {currentSessionStatus === 'connected'
                      ? 'Connected'
                      : currentSessionStatus === 'reconnecting'
                        ? 'Reconnecting'
                      : currentSessionStatus === 'connecting'
                        ? 'Connecting'
                        : phoneNumber || devicePhoneNumber
                          ? 'Ready to connect'
                          : 'Disconnected'}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{displayCurrentConnectionNumber}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{displayCurrentConnectionName}</p>
                  <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{workspaceConnectedCount}/{status.limit} numbers connected on this workspace</p>
                  {hasOtherConnectedSessions && !isCurrentSessionConnected ? (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Another WhatsApp number is still connected. This selected session is the one reconnecting.
                    </p>
                  ) : null}
                  {sessionReplacedConflict ? (
                    <div className="mt-3 rounded-[10px] border border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.08)] px-3 py-3 text-[12px] text-[var(--red)]">
                      <p className="font-semibold uppercase tracking-[0.08em]">Session replaced</p>
                      <p className="mt-1 leading-5 text-[var(--text-secondary)]">
                        WhatsApp says this linked-device session was replaced by another owner. PropAI will not auto-reconnect this session until you reconnect it here.
                      </p>
                      <p className="mt-1 leading-5 text-[var(--text-secondary)]">
                        Check for another Baileys runtime, another linked-device owner, or another login flow using the same number.
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-2 inline-flex rounded-full border border-[color:rgba(62,232,138,0.2)] bg-[rgba(62,232,138,0.08)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                    Replay backlog: {replayBacklog24h} messages waiting
                  </p>
                </div>
                {disconnectTargetLabel && currentSessionStatus !== 'disconnected' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void handleReconnectSession(disconnectTargetLabel)}
                      disabled={isConnecting || isResettingSession}
                      className={cn(sourceSecondaryButton, 'bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-secondary)] hover:text-[var(--amber)]')}
                    >
                      {isResettingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Reconnect stale session
                    </button>
                    <button
                      onClick={() => void handleResetAllSessions()}
                      disabled={isConnecting || isResettingSession}
                      className={cn(sourceSecondaryButton, 'bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-secondary)] hover:text-[var(--red)]')}
                    >
                      {isResettingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <XIcon className="h-4 w-4" />}
                      Start fresh
                    </button>
                    <button
                      onClick={() => void handleDisconnect(disconnectTargetLabel)}
                      disabled={isConnecting || isResettingSession}
                      className={cn(sourceSecondaryButton, 'bg-[var(--bg-base)] px-3 py-2.5 text-[var(--text-secondary)] hover:text-[var(--red)]')}
                    >
                      <Power className="h-4 w-4" />
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
              If WhatsApp keeps showing connecting or fails to finish, use Reconnect stale session first. We automatically send a crash log to <a className="text-[var(--accent)] underline" href="mailto:hello@propai.live">hello@propai.live</a> with the error reason so we can fix it.
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Reconnect stale session</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                  Use this when the selected number is stuck reconnecting. It keeps the session and asks WhatsApp to link again.
                </p>
              </div>
              <div className="rounded-[10px] border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.06)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--red)]">Start fresh</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                  Use this only when you want to wipe the session and begin from scratch with a new QR or pairing flow.
                </p>
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
                          ? 'bg-[rgba(62,232,138,0.12)] text-[var(--accent)]'
                          : session.status === 'reconnecting'
                            ? 'bg-[rgba(245,158,11,0.12)] text-amber-300'
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
                Save the broker details first, then connect with QR. If the broker is away from a laptop, use the pairing code fallback instead. If a session gets stuck, use Reconnect stale session and we will send a crash log to hello@propai.live with the reason.
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
                  <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {artifactMode === 'pairing' ? 'Pairing code panel' : 'QR panel'}
                  </h3>
                </div>
              </div>
              <span className={cn(sourcePill, 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]')}>
                {artifactMode === 'pairing' ? 'Pairing code' : 'Live QR'}
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
              {artifactMode === 'pairing' && artifactValue ? (
                <div className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-center">
                  <div className="mx-auto w-fit rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      Pairing code
                    </p>
                    <p className="mt-2 font-mono text-[32px] font-semibold tracking-[0.35em] text-[var(--accent)]">
                      {artifactValue}
                    </p>
                  </div>
                  <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                    Open WhatsApp on the broker phone, go to Linked Devices, choose Link a Device, and enter the code above.
                  </p>
                </div>
              ) : qrMarkup ? (
                <div className={cn(
                  'flex min-h-[420px] items-center justify-center rounded-[12px] border border-[color:var(--border)] bg-white p-5 transition-opacity',
                  isQrExpired && 'opacity-55'
                )}>
                  <div
                    className="w-full max-w-[320px]"
                    dangerouslySetInnerHTML={{ __html: qrMarkup }}
                  />
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
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {artifactMode === 'pairing' ? 'Pairing code panel' : 'QR panel'}
                    </p>
                    <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                      The QR or pairing artifact for the selected broker number will appear here after you start a connect flow on the left.
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
