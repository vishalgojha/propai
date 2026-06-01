import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { AlertTriangleIcon, BotIcon, CheckCircleIcon, CopyIcon, LinkIcon, LoaderIcon, MailIcon, RefreshIcon, ShieldIcon, SmartphoneIcon, CreditCardIcon, LogoutIcon, SparklesIcon, TrashIcon, ArrowRightIcon, GroupsIcon, SearchIcon, WorkflowIcon, CheckIcon } from '../lib/icons';

// ── Types ───────────────────────────────────────────────────────────────────
type WorkspaceRecord = {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  role: string;
  createdAt?: string | null;
  subscription: {
    plan: string;
    status: string;
    createdAt?: string | null;
    renewalDate?: string | null;
  };
  whatsapp: {
    connectedSessions: number;
    connectingSessions: number;
    groupCount: number;
    activeGroups24h: number;
    messagesReceived24h: number;
    messagesParsed24h: number;
    messagesFailed24h: number;
    parserSuccessRate: number;
    lastUpdatedAt?: string | null;
  };
};

type AdminSummary = {
  totalWorkspaces: number;
  trialWorkspaces: number;
  connectedWorkspaces: number;
  messagesParsed24h: number;
};

type AdminGroupRecord = {
  id: string;
  groupJid: string;
  name: string;
  locality?: string | null;
  city?: string | null;
  category: string;
  tags: string[];
  participantsCount: number;
  broadcastEnabled: boolean;
  isArchived: boolean;
  lastActiveAt?: string | null;
};

type AuditEvent = {
  id: string;
  action: string;
  adminId: string;
  adminEmail: string;
  targetId?: string;
  targetEmail?: string;
  payload: Record<string, any>;
  timestamp: number;
};

type ImpersonationSession = {
  token: string;
  partnerId: string;
  partnerEmail: string;
  partnerFullName: string | null;
  partnerRole: string;
  tenantId: string;
  adminEmail: string;
  expiresAt: number;
};

type ScoutStatus = 'draft' | 'needs_review' | 'approved' | 'sent' | 'discarded';
type ScoutChannel = 'email' | 'dm' | 'comment' | 'partnership';
type ScoutLead = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  context: string;
  angle: string;
  draft: string;
  channel: ScoutChannel;
  status: ScoutStatus;
  priority: 'high' | 'medium' | 'low';
  createdAt: number;
  updatedAt: number;
  notes?: string;
};

const formatDate = (value?: string | number | null) =>
  value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Not set';

const adminPrimaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] shadow-[0_10px_28px_rgba(62,232,138,0.18)] transition-all hover:-translate-y-[1px] hover:brightness-95 disabled:opacity-50 disabled:hover:translate-y-0';
const adminSecondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-all hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';
const adminPill =
  'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]';
const scoutStorageKey = 'propai.super-admin.scout-queue.v1';

const scoutSeedData: ScoutLead[] = [
  {
    id: 'scout-thane-pricing',
    title: 'Thane market discussion',
    source: 'r/Mumbai',
    sourceUrl: 'https://reddit.com/r/mumbai',
    context: 'People are comparing Thane West and nearby micro-markets for current rent and sale levels.',
    angle: 'Offer a clean locality pulse with live inventory trends and a public-safe market page',
    draft: 'Hi, I saw the discussion on Thane pricing. PropAI Pulse has a public locality page and a broker-safe market view that can help readers compare current activity without exposing private data. If you want, I can share a short chart or summary.',
    channel: 'comment',
    status: 'needs_review',
    priority: 'high',
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
    notes: 'Useful for Google/AI visibility and local authority signals.',
  },
  {
    id: 'scout-bandra-off-market',
    title: 'Bandra off-market thread',
    source: 'Broker newsletter',
    sourceUrl: 'https://propai.live/locality/bandra-west',
    context: 'An editor is asking for off-market Bandra inventory with proper locality context.',
    angle: 'Share a public-safe market snapshot and invite access to the broker workflow',
    draft: 'Hi, we track off-market broker signals in Bandra West and nearby belts. PropAI Pulse turns WhatsApp inventory into a clean locality-first view, and the public pages can support a market story. Happy to share a short summary if useful.',
    channel: 'email',
    status: 'draft',
    priority: 'medium',
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 'scout-mcp-discovery',
    title: 'AI search / MCP mention',
    source: 'Tech blog',
    sourceUrl: 'https://propai.live/mcp/docs',
    context: 'Someone is writing about AI assistants and searchable property data.',
    angle: 'Link to public docs and the locality index, not to private broker data',
    draft: 'Hi, PropAI Pulse publishes public docs for AI assistants and a clean locality index for crawlers. The private MCP server stays permissioned, but the public documentation explains the concept clearly. If helpful, we can share the public-safe overview.',
    channel: 'email',
    status: 'approved',
    priority: 'low',
    createdAt: Date.now() - 1000 * 60 * 60 * 42,
    updatedAt: Date.now() - 1000 * 60 * 60 * 5,
  },
];

export const Admin: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState<'overview' | 'partners' | 'groups' | 'audit' | 'system' | 'scout'>('overview');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  
  // Workspace Data
  const [summary, setSummary] = React.useState<AdminSummary>({ totalWorkspaces: 0, trialWorkspaces: 0, connectedWorkspaces: 0, messagesParsed24h: 0 });
  const [workspaces, setWorkspaces] = React.useState<WorkspaceRecord[]>([]);
  const [pagination, setPagination] = React.useState({ total: 0, page: 1, limit: 20, pages: 1 });
  const [search, setSearch] = React.useState('');
  const [filterPlan, setFilterPlan] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  
  // Group Data
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string>('');
  const [groupDirectory, setGroupDirectory] = React.useState<AdminGroupRecord[]>([]);
  const [groupsLoading, setGroupsLoading] = React.useState(false);
  const [groupSaveKey, setGroupSaveKey] = React.useState<string | null>(null);

  // Impersonations & Audit
  const [impersonations, setImpersonations] = React.useState<ImpersonationSession[]>([]);
  const [auditLog, setAuditLog] = React.useState<AuditEvent[]>([]);

  // Scout queue
  const [scoutQueue, setScoutQueue] = React.useState<ScoutLead[]>(scoutSeedData);
  const [scoutFilter, setScoutFilter] = React.useState<'all' | ScoutStatus>('all');
  const [scoutSelectedId, setScoutSelectedId] = React.useState<string>(scoutSeedData[0]?.id || '');
  const [scoutHydrated, setScoutHydrated] = React.useState(false);
  const [scoutDraft, setScoutDraft] = React.useState({
    title: '',
    source: '',
    sourceUrl: '',
    context: '',
    angle: '',
    draft: '',
    channel: 'email' as ScoutChannel,
    priority: 'medium' as ScoutLead['priority'],
  });

  const isSuperAdmin = user?.appRole === 'super_admin';

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(scoutStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ScoutLead[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setScoutQueue(parsed);
          setScoutSelectedId((current) => current || parsed[0].id);
        }
      }
    } catch (readErr) {
      console.error('Failed to restore scout queue', readErr);
    } finally {
      setScoutHydrated(true);
    }
  }, []);

  React.useEffect(() => {
    if (!scoutHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(scoutStorageKey, JSON.stringify(scoutQueue));
  }, [scoutQueue, scoutHydrated]);

  React.useEffect(() => {
    if (!scoutSelectedId && scoutQueue.length > 0) {
      setScoutSelectedId(scoutQueue[0].id);
    }
  }, [scoutSelectedId, scoutQueue]);

  const loadAdminData = React.useCallback(async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(filterPlan && { plan: filterPlan }),
        ...(filterStatus && { status: filterStatus }),
      });
      const response = await backendApi.get(`${ENDPOINTS.admin.workspaces}?${params}`);
      setSummary(response.data?.summary || summary);
      setWorkspaces(response.data?.workspaces || []);
      setPagination(response.data?.pagination || { total: 0, page: 1, limit: 20, pages: 1 });
    } catch (err) {
      setError(handleApiError(err));
      setWorkspaces([]);
    } finally {
      setIsLoading(false);
    }
  }, [search, filterPlan, filterStatus, pagination.limit]);

  const loadWorkspaceGroups = React.useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setGroupDirectory([]);
      return;
    }
    setGroupsLoading(true);
    try {
      const response = await backendApi.get(ENDPOINTS.admin.workspaceGroups(tenantId));
      setGroupDirectory(response.data?.groups || []);
    } catch (err) {
      setError(handleApiError(err));
      setGroupDirectory([]);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadImpersonations = React.useCallback(async () => {
    try {
      const res = await backendApi.get(ENDPOINTS.admin.impersonations);
      setImpersonations(res.data?.sessions || []);
    } catch (err) {
      console.error('Failed to load impersonations', err);
    }
  }, []);

  const loadAuditLog = React.useCallback(async () => {
    try {
      const res = await backendApi.get(ENDPOINTS.admin.audit);
      setAuditLog(res.data?.events || []);
    } catch (err) {
      console.error('Failed to load audit log', err);
    }
  }, []);

  React.useEffect(() => {
    if (!isSuperAdmin) {
      setIsLoading(false);
      return;
    }
    
    if (activeTab === 'overview' || activeTab === 'partners') {
      void loadAdminData(pagination.page);
    } else if (activeTab === 'system') {
      void loadImpersonations();
    } else if (activeTab === 'audit') {
      void loadAuditLog();
    }
  }, [isSuperAdmin, activeTab, search, filterPlan, filterStatus]);

  React.useEffect(() => {
    if (isSuperAdmin && activeTab === 'groups' && selectedWorkspaceId) {
      void loadWorkspaceGroups(selectedWorkspaceId);
    }
  }, [isSuperAdmin, activeTab, selectedWorkspaceId, loadWorkspaceGroups]);

  const updateSubscription = async (tenantId: string, payload: { plan?: string; status?: string; extendTrialDays?: number }) => {
    setIsSaving(tenantId);
    setError(null);
    try {
      const response = await backendApi.post(ENDPOINTS.admin.updateSubscription(tenantId), payload);
      const nextSubscription = response.data?.subscription;
      if (nextSubscription) {
        setWorkspaces((current) =>
          current.map((w) =>
            w.id === tenantId
              ? { ...w, subscription: { ...w.subscription, ...nextSubscription } }
              : w,
          ),
        );
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSaving(null);
    }
  };

  const impersonatePartner = async (tenantId: string) => {
    setIsSaving(tenantId + '_imp');
    setError(null);
    try {
      const response = await backendApi.post(ENDPOINTS.admin.impersonate(tenantId));
      if (response.data?.accessUrl) {
        window.open(response.data.accessUrl, '_blank');
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSaving(null);
    }
  };

  const revokeImpersonation = async (token: string) => {
    setIsSaving(token);
    try {
      await backendApi.delete(ENDPOINTS.admin.revokeImpersonation(token));
      setImpersonations((curr) => curr.filter((s) => s.token !== token));
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSaving(null);
    }
  };

  const updateGroup = async (groupJid: string, payload: Partial<AdminGroupRecord>) => {
    if (!selectedWorkspaceId) return;
    setGroupSaveKey(groupJid);
    setError(null);
    try {
      const response = await backendApi.post(ENDPOINTS.admin.updateWorkspaceGroup(selectedWorkspaceId, groupJid), payload);
      const updated = response.data?.group;
      if (updated) {
        setGroupDirectory((current) =>
          current.map((group) =>
            group.groupJid === groupJid
              ? { ...group, ...payload }
              : group,
          ),
        );
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setGroupSaveKey(null);
    }
  };

  const scoutFiltered = React.useMemo(
    () => scoutQueue.filter((lead) => (scoutFilter === 'all' ? true : lead.status === scoutFilter)),
    [scoutQueue, scoutFilter],
  );
  const selectedScoutLead = React.useMemo(() => {
    const current = scoutQueue.find((lead) => lead.id === scoutSelectedId);
    return current || scoutQueue[0] || null;
  }, [scoutQueue, scoutSelectedId]);

  const persistScoutLead = React.useCallback((leadId: string, patch: Partial<ScoutLead>) => {
    setScoutQueue((current) =>
      current.map((lead) =>
        lead.id === leadId
          ? { ...lead, ...patch, updatedAt: Date.now() }
          : lead,
      ),
    );
  }, []);

  const addScoutDraft = () => {
    setError(null);
    if (!scoutDraft.title.trim() || !scoutDraft.source.trim() || !scoutDraft.draft.trim()) {
      setError('Scout draft needs a title, source, and pitch before it can be added.');
      return;
    }
    const next: ScoutLead = {
      id: `scout-${Date.now()}`,
      title: scoutDraft.title.trim(),
      source: scoutDraft.source.trim(),
      sourceUrl: scoutDraft.sourceUrl.trim(),
      context: scoutDraft.context.trim(),
      angle: scoutDraft.angle.trim(),
      draft: scoutDraft.draft.trim(),
      channel: scoutDraft.channel,
      status: 'needs_review',
      priority: scoutDraft.priority,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setScoutQueue((current) => [next, ...current]);
    setScoutSelectedId(next.id);
    setScoutDraft({
      title: '',
      source: '',
      sourceUrl: '',
      context: '',
      angle: '',
      draft: '',
      channel: 'email',
      priority: 'medium',
    });
  };

  const generateScoutDraft = () => {
    if (!selectedScoutLead) return;
    const sourceLine = selectedScoutLead.sourceUrl ? `Reference: ${selectedScoutLead.sourceUrl}` : `Source: ${selectedScoutLead.source}`;
    const safePitch = [
      `Hi, I saw your piece on ${selectedScoutLead.title}.`,
      selectedScoutLead.context,
      `PropAI Pulse can share a public-safe market summary, locality page, or broker workflow context without exposing private broker data.`,
      selectedScoutLead.angle,
      sourceLine,
      'If useful, I can send a short note or data snapshot that fits your audience.',
    ]
      .filter(Boolean)
      .join(' ');
    persistScoutLead(selectedScoutLead.id, { draft: safePitch, status: 'needs_review' });
  };

  const copyScoutDraft = async (lead: ScoutLead) => {
    await navigator.clipboard.writeText(lead.draft);
  };

  const removeScoutLead = (leadId: string) => {
    setScoutQueue((current) => {
      const nextQueue = current.filter((lead) => lead.id !== leadId);
      if (scoutSelectedId === leadId) {
        setScoutSelectedId(nextQueue[0]?.id || '');
      }
      return nextQueue;
    });
  };

  const markScoutStatus = (leadId: string, status: ScoutStatus) => {
    persistScoutLead(leadId, { status });
  };

  if (!isSuperAdmin) {
    return (
      <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Admin</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--text-primary)]">Super-admin access required</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          This workspace is signed in as a partner account. The Admin tab appears only for PropAI owner sessions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              <ShieldIcon className="h-3.5 w-3.5" />
              Super admin
            </div>
            <h2 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[34px]">
              PropAI Operations
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Manage partner workspaces, review system health, impersonate accounts for debugging, and view the global audit log.
            </p>
          </div>
          <button
            type="button"
            onClick={() => activeTab === 'audit' ? loadAuditLog() : activeTab === 'system' ? loadImpersonations() : loadAdminData(pagination.page)}
            className={cn(adminSecondaryButton, 'rounded-full')}
          >
            <RefreshIcon className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[16px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-2 shadow-[0_14px_40px_rgba(0,0,0,0.12)]">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'partners', label: 'Partners & Billing' },
          { id: 'groups', label: 'Group Directory' },
          { id: 'scout', label: 'Scout' },
          { id: 'audit', label: 'Audit Log' },
          { id: 'system', label: 'System & Sessions' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'rounded-[14px] px-5 py-2.5 text-[12px] font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-[#020f07] shadow-[0_8px_20px_rgba(62,232,138,0.16)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      
      {/* ── OVERVIEW ───────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Total Partners', value: summary.totalWorkspaces, icon: GroupsIcon },
            { label: 'Trial Accounts', value: summary.trialWorkspaces, icon: CreditCardIcon },
            { label: 'Live WhatsApp', value: summary.connectedWorkspaces, icon: SmartphoneIcon },
            { label: 'Parsed 24h', value: summary.messagesParsed24h, icon: WorkflowIcon },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{card.label}</p>
                  <Icon className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <p className="mt-3 text-3xl font-bold text-[var(--text-primary)]">{card.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PARTNERS & BILLING ─────────────────────────────────────────────── */}
      {activeTab === 'partners' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search by email, name, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] py-2.5 pl-10 pr-4 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
              />
            </div>
            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
              className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
            >
              <option value="">All Plans</option>
              <option value="Trial">Trial</option>
              <option value="Pro">Pro</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
            >
              <option value="">All Statuses</option>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-12"><LoaderIcon className="h-6 w-6 animate-spin text-[var(--accent)]" /></div>
          ) : (
            <div className="space-y-4">
              {workspaces.map((workspace) => (
                <div key={workspace.id} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-bold text-[var(--text-primary)]">{workspace.fullName || 'No Name'}</p>
                          {workspace.role === 'super_admin' && (
                            <span className={cn(adminPill, 'border-amber-500/30 bg-amber-500/10 text-amber-400')}>Super Admin</span>
                          )}
                        </div>
                        <p className="text-[12px] text-[var(--text-secondary)]">{workspace.email} • {workspace.phone || 'No Phone'}</p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                        <span className={cn(adminPill, 'border-[color:var(--border)] text-[var(--text-primary)]')}>Plan: {workspace.subscription.plan}</span>
                        <span className={cn(adminPill, workspace.subscription.status === 'active' ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-[color:var(--border)] text-[var(--text-secondary)]')}>
                          Status: {workspace.subscription.status}
                        </span>
                        <span className={cn(adminPill, 'border-[color:var(--border)] text-[var(--text-secondary)]')}>
                          WA: {workspace.whatsapp.connectedSessions ? 'Live' : 'Offline'}
                        </span>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 pt-2">
                         <div>
                          <p className="text-[10px] uppercase text-[var(--text-secondary)]">Created</p>
                          <p className="text-[12px] font-medium text-[var(--text-primary)]">{formatDate(workspace.createdAt)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-[var(--text-secondary)]">Groups</p>
                          <p className="text-[12px] font-medium text-[var(--text-primary)]">{workspace.whatsapp.groupCount} tracked</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-[var(--text-secondary)]">Parsed 24h</p>
                          <p className="text-[12px] font-medium text-[var(--text-primary)]">{workspace.whatsapp.messagesParsed24h} msgs ({workspace.whatsapp.parserSuccessRate}%)</p>
                        </div>
                      </div>
                    </div>

                    <div className="w-full max-w-[280px] shrink-0 space-y-4 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">Billing Actions</p>
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          {['Trial', 'Pro'].map((plan) => (
                            <button
                              key={plan}
                              onClick={() => void updateSubscription(workspace.id, { plan, status: plan === 'Trial' ? 'trial' : 'active' })}
                              disabled={isSaving === workspace.id}
                              className={cn(
                                'rounded-[10px] px-2 py-1.5 text-[10px] font-bold transition-colors',
                                workspace.subscription.plan === plan
                                  ? 'bg-[var(--accent)] text-black'
                                  : 'border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[color:var(--accent-border)]'
                              )}
                            >
                              {plan}
                            </button>
                          ))}
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => void updateSubscription(workspace.id, { status: 'active' })}
                            className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[10px] font-bold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)]"
                          >
                            Set Active
                          </button>
                          <button
                            onClick={() => void updateSubscription(workspace.id, { extendTrialDays: 7 })}
                            className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[10px] font-bold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)]"
                          >
                            +7d Trial
                          </button>
                        </div>
                      </div>
                      
                      <div className="pt-3 border-t border-[color:var(--border)]">
                        <button
                          onClick={() => impersonatePartner(workspace.id)}
                          disabled={isSaving === workspace.id + '_imp'}
                          className={cn(adminPrimaryButton, 'w-full')}
                        >
                          <LogoutIcon className="h-3 w-3" />
                          Access Workspace
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-4">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => loadAdminData(pagination.page - 1)}
                    className={cn(adminSecondaryButton, 'px-3 py-2 disabled:opacity-50')}
                  >
                    Previous
                  </button>
                  <span className="text-[12px] text-[var(--text-secondary)]">Page {pagination.page} of {pagination.pages}</span>
                  <button
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => loadAdminData(pagination.page + 1)}
                    className={cn(adminSecondaryButton, 'px-3 py-2 disabled:opacity-50')}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── GROUP DIRECTORY ─────────────────────────────────────────────────── */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full max-w-md rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
              >
                <option value="">Select partner workspace to view groups...</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.fullName || w.email} ({w.email})</option>
                ))}
              </select>
            </div>
          </div>

          {groupsLoading ? (
            <div className="flex justify-center p-12"><LoaderIcon className="h-6 w-6 animate-spin text-[var(--accent)]" /></div>
          ) : !selectedWorkspaceId ? (
             <div className="text-center p-12 text-[13px] text-[var(--text-secondary)]">Please select a workspace above.</div>
          ) : groupDirectory.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              No synced groups yet for this workspace. Partner must connect WhatsApp.
            </div>
          ) : (
            <div className="grid gap-3">
              {groupDirectory.map((group) => (
                <div key={group.groupJid} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 lg:w-1/3">
                      <p className="truncate text-[13px] font-bold text-[var(--text-primary)]">{group.name}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{group.participantsCount} members • {group.groupJid}</p>
                    </div>
                    
                    <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                      <input
                        placeholder="Locality"
                        defaultValue={group.locality || ''}
                        onBlur={(e) => e.target.value !== (group.locality||'') && updateGroup(group.groupJid, { locality: e.target.value || null })}
                        className="rounded border border-[color:var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-[11px]"
                      />
                      <input
                        placeholder="City"
                        defaultValue={group.city || ''}
                        onBlur={(e) => e.target.value !== (group.city||'') && updateGroup(group.groupJid, { city: e.target.value || null })}
                        className="rounded border border-[color:var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-[11px]"
                      />
                      <select
                        value={group.category}
                        onChange={(e) => updateGroup(group.groupJid, { category: e.target.value })}
                        className="rounded border border-[color:var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-[11px]"
                      >
                        <option value="other">Other</option>
                        <option value="broker">Broker</option>
                        <option value="rental">Rental</option>
                        <option value="sale">Sale</option>
                        <option value="commercial">Commercial</option>
                      </select>
                      <label className="flex items-center gap-2 text-[11px]">
                        <input
                          type="checkbox"
                          checked={group.broadcastEnabled}
                          onChange={(e) => updateGroup(group.groupJid, { broadcastEnabled: e.target.checked })}
                        />
                        Broadcast
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SCOUT ───────────────────────────────────────────────────────────── */}
      {activeTab === 'scout' && (
        <div className="space-y-6">
          <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
                  <BotIcon className="h-3.5 w-3.5" />
                  Private scout queue
                </div>
                <h3 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[28px]">
                  Draft outreach, review it, then decide.
                </h3>
                <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
                  This is a human-in-the-loop growth workspace. It surfaces useful targets, drafts a pitch, and leaves the final send decision to you.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                <span className={cn(adminPill, 'border-[color:var(--border)] text-[var(--text-secondary)]')}>{scoutQueue.length} leads</span>
                <span className={cn(adminPill, 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]')}>Human review only</span>
                <span className={cn(adminPill, 'border-[color:var(--border)] text-[var(--text-secondary)]')}>No auto-post</span>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <div className="space-y-4">
              <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="text-[14px] font-bold text-[var(--text-primary)]">Add a new scout draft</h4>
                    <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Paste a target, context, and pitch. The item lands in review, never auto-sends.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                    <span className={cn(adminPill, 'border-[color:var(--border)] text-[var(--text-secondary)]')}>Email / DM / comment</span>
                    <span className={cn(adminPill, 'border-[color:var(--border)] text-[var(--text-secondary)]')}>PR / outreach / partnership</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input
                    value={scoutDraft.title}
                    onChange={(e) => setScoutDraft((curr) => ({ ...curr, title: e.target.value }))}
                    placeholder="Target title"
                    className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                  />
                  <input
                    value={scoutDraft.source}
                    onChange={(e) => setScoutDraft((curr) => ({ ...curr, source: e.target.value }))}
                    placeholder="Source / publication"
                    className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                  />
                  <input
                    value={scoutDraft.sourceUrl}
                    onChange={(e) => setScoutDraft((curr) => ({ ...curr, sourceUrl: e.target.value }))}
                    placeholder="Target URL (optional)"
                    className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)] md:col-span-2"
                  />
                  <select
                    value={scoutDraft.channel}
                    onChange={(e) => setScoutDraft((curr) => ({ ...curr, channel: e.target.value as ScoutChannel }))}
                    className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                  >
                    <option value="email">Email</option>
                    <option value="dm">DM</option>
                    <option value="comment">Comment</option>
                    <option value="partnership">Partnership</option>
                  </select>
                  <select
                    value={scoutDraft.priority}
                    onChange={(e) => setScoutDraft((curr) => ({ ...curr, priority: e.target.value as ScoutLead['priority'] }))}
                    className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                  >
                    <option value="high">High priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="low">Low priority</option>
                  </select>
                </div>

                <textarea
                  value={scoutDraft.context}
                  onChange={(e) => setScoutDraft((curr) => ({ ...curr, context: e.target.value }))}
                  rows={3}
                  placeholder="Observed context"
                  className="mt-3 w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                />
                <textarea
                  value={scoutDraft.angle}
                  onChange={(e) => setScoutDraft((curr) => ({ ...curr, angle: e.target.value }))}
                  rows={2}
                  placeholder="Suggested angle"
                  className="mt-3 w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                />
                <textarea
                  value={scoutDraft.draft}
                  onChange={(e) => setScoutDraft((curr) => ({ ...curr, draft: e.target.value }))}
                  rows={5}
                  placeholder="Draft pitch"
                  className="mt-3 w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={addScoutDraft} className={adminPrimaryButton}>
                    <SparklesIcon className="h-3.5 w-3.5" />
                    Add to review queue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScoutDraft({
                        title: '',
                        source: '',
                        sourceUrl: '',
                        context: '',
                        angle: '',
                        draft: '',
                        channel: 'email',
                        priority: 'medium',
                      });
                    }}
                    className={adminSecondaryButton}
                  >
                    Clear form
                  </button>
                </div>
              </div>

              <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="text-[14px] font-bold text-[var(--text-primary)]">Review queue</h4>
                    <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Review, edit, approve, or discard before anything is sent.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'draft', 'needs_review', 'approved', 'sent', 'discarded'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setScoutFilter(status)}
                        className={cn(
                          adminSecondaryButton,
                          'px-3 py-2 text-[10px]',
                          scoutFilter === status && 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]',
                        )}
                      >
                        {status === 'all' ? 'All' : status.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {scoutFiltered.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-8 text-center text-[13px] text-[var(--text-secondary)]">
                      No scout drafts in this filter. Add one from the form above.
                    </div>
                  ) : (
                    scoutFiltered.map((lead) => {
                      const isSelected = lead.id === scoutSelectedId;
                      return (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => setScoutSelectedId(lead.id)}
                          className={cn(
                            'w-full rounded-[16px] border p-4 text-left transition-all',
                            isSelected
                              ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)]/20 shadow-[0_0_0_1px_rgba(62,232,138,0.12)]'
                              : 'border-[color:var(--border)] bg-[var(--bg-elevated)] hover:border-[color:var(--accent-border)]',
                          )}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[14px] font-bold text-[var(--text-primary)]">{lead.title}</p>
                                <span className={cn(
                                  adminPill,
                                  lead.status === 'approved'
                                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                                    : lead.status === 'sent'
                                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                                      : lead.status === 'discarded'
                                        ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                        : 'border-[color:var(--border)] text-[var(--text-secondary)]',
                                )}>
                                  {lead.status.replace(/_/g, ' ')}
                                </span>
                                <span className={cn(
                                  adminPill,
                                  lead.priority === 'high'
                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                    : 'border-[color:var(--border)] text-[var(--text-secondary)]',
                                )}>
                                  {lead.priority}
                                </span>
                              </div>
                              <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
                                {lead.source}
                                {lead.sourceUrl ? (
                                  <a
                                    href={lead.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ml-2 inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <LinkIcon className="h-3 w-3" />
                                    Open source
                                  </a>
                                ) : null}
                              </p>
                              <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">{lead.context}</p>
                              <p className="mt-2 text-[11px] leading-6 text-[var(--text-muted)]">{lead.angle}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void copyScoutDraft(lead);
                                }}
                                className={adminSecondaryButton}
                              >
                                <CopyIcon className="h-3.5 w-3.5" />
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  markScoutStatus(lead.id, 'approved');
                                }}
                                className={adminSecondaryButton}
                              >
                                <CheckIcon className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeScoutLead(lead.id);
                                }}
                                className={cn(adminSecondaryButton, 'text-red-300 hover:border-red-500/30 hover:bg-red-500/10')}
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                                Discard
                              </button>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4 sticky top-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-[14px] font-bold text-[var(--text-primary)]">Selected draft</h4>
                    <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Edit this item before you approve or send it.</p>
                  </div>
                  {selectedScoutLead ? (
                    <span className={cn(adminPill, 'border-[color:var(--border)] text-[var(--text-secondary)]')}>
                      {selectedScoutLead.channel}
                    </span>
                  ) : null}
                </div>

                {selectedScoutLead ? (
                  <div className="mt-4 space-y-3">
                    <input
                      value={selectedScoutLead.title}
                      onChange={(e) => persistScoutLead(selectedScoutLead.id, { title: e.target.value })}
                      className="w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                    />
                    <input
                      value={selectedScoutLead.source}
                      onChange={(e) => persistScoutLead(selectedScoutLead.id, { source: e.target.value })}
                      className="w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        value={selectedScoutLead.sourceUrl}
                        onChange={(e) => persistScoutLead(selectedScoutLead.id, { sourceUrl: e.target.value })}
                        className="w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                      />
                      {selectedScoutLead.sourceUrl ? (
                        <a
                          href={selectedScoutLead.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={adminSecondaryButton}
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          Open
                        </a>
                      ) : null}
                    </div>
                    <textarea
                      value={selectedScoutLead.context}
                      onChange={(e) => persistScoutLead(selectedScoutLead.id, { context: e.target.value })}
                      rows={3}
                      className="w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                    />
                    <textarea
                      value={selectedScoutLead.angle}
                      onChange={(e) => persistScoutLead(selectedScoutLead.id, { angle: e.target.value })}
                      rows={2}
                      className="w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                    />
                    <textarea
                      value={selectedScoutLead.draft}
                      onChange={(e) => persistScoutLead(selectedScoutLead.id, { draft: e.target.value, status: 'needs_review' })}
                      rows={8}
                      className="w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                    />

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <select
                        value={selectedScoutLead.channel}
                        onChange={(e) => persistScoutLead(selectedScoutLead.id, { channel: e.target.value as ScoutChannel })}
                        className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                      >
                        <option value="email">Email</option>
                        <option value="dm">DM</option>
                        <option value="comment">Comment</option>
                        <option value="partnership">Partnership</option>
                      </select>
                      <select
                        value={selectedScoutLead.priority}
                        onChange={(e) => persistScoutLead(selectedScoutLead.id, { priority: e.target.value as ScoutLead['priority'] })}
                        className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <select
                        value={selectedScoutLead.status}
                        onChange={(e) => persistScoutLead(selectedScoutLead.id, { status: e.target.value as ScoutStatus })}
                        className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)] sm:col-span-1"
                      >
                        <option value="draft">Draft</option>
                        <option value="needs_review">Needs review</option>
                        <option value="approved">Approved</option>
                        <option value="sent">Sent</option>
                        <option value="discarded">Discarded</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={generateScoutDraft} className={adminSecondaryButton}>
                        <SparklesIcon className="h-3.5 w-3.5" />
                        Generate draft
                      </button>
                      <button type="button" onClick={() => markScoutStatus(selectedScoutLead.id, 'approved')} className={adminPrimaryButton}>
                        <CheckIcon className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button type="button" onClick={() => markScoutStatus(selectedScoutLead.id, 'sent')} className={adminSecondaryButton}>
                        <MailIcon className="h-3.5 w-3.5" />
                        Mark sent
                      </button>
                      <button type="button" onClick={() => void copyScoutDraft(selectedScoutLead)} className={adminSecondaryButton}>
                        <CopyIcon className="h-3.5 w-3.5" />
                        Copy draft
                      </button>
                    </div>

                    <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Review notes</p>
                      <ul className="mt-3 space-y-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                        <li>• Keep approval human-led. This queue does not auto-send.</li>
                        <li>• Use public-safe PropAI pages when linking out.</li>
                        <li>• If the angle is thin, discard it before it reaches outreach.</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[14px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-8 text-center text-[13px] text-[var(--text-secondary)]">
                    No scout draft selected.
                  </div>
                )}
              </div>

              <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  <ShieldIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                  Scout safeguards
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    { label: 'Human review', copy: 'Every draft stops here until a super admin approves it.' },
                    { label: 'No spam loop', copy: 'The module is for targeted PR and partnership drafts only.' },
                    { label: 'Private context', copy: 'It stays inside the owner panel and does not expose private data.' },
                    { label: 'Crawl safe', copy: 'Outbound references should point to public-safe pages only.' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                      <p className="text-[12px] font-semibold text-[var(--text-primary)]">{item.label}</p>
                      <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{item.copy}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SYSTEM & SESSIONS ─────────────────────────────────────────────── */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)]">
            <div className="border-b border-[color:var(--border)] px-5 py-4">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Active Impersonation Sessions</h3>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Tokens generated by admins to access partner workspaces.</p>
            </div>
            <div className="p-0">
              {impersonations.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-[var(--text-secondary)]">No active impersonation sessions.</div>
              ) : (
                <div className="divide-y divide-[color:var(--border)]">
                  {impersonations.map((imp) => (
                    <div key={imp.token} className="flex items-center justify-between p-4">
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">Partner: {imp.partnerEmail}</p>
                        <p className="text-[11px] text-[var(--text-secondary)]">Admin: {imp.adminEmail} • Expires: {formatDate(imp.expiresAt)}</p>
                      </div>
                      <button
                        onClick={() => revokeImpersonation(imp.token)}
                        disabled={isSaving === imp.token}
                        className="rounded-[10px] border border-red-500/30 px-3 py-2 text-[11px] font-bold text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        Revoke Access
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIT LOG ─────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div>
          <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] overflow-hidden">
             <div className="border-b border-[color:var(--border)] px-5 py-4">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Security Audit Log</h3>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Chronological record of sensitive administrative actions.</p>
            </div>
            <div className="divide-y divide-[color:var(--border)]">
              {auditLog.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-[var(--text-secondary)]">Log is empty.</div>
              ) : (
                auditLog.map((event) => (
                  <div key={event.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--accent)]">
                          {event.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[12px] font-medium text-[var(--text-primary)]">{event.adminEmail}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                        Target: {event.targetEmail || event.targetId || 'System'}
                      </p>
                      <pre className="mt-2 max-w-full overflow-x-auto rounded border border-[color:var(--border)] bg-[#0d1117] p-2 text-[10px] text-[var(--text-muted)]">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </div>
                    <div className="text-right text-[11px] text-[var(--text-secondary)]">
                      {formatDate(event.timestamp)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
