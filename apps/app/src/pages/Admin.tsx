import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { AlertTriangleIcon, CheckCircleIcon, LoaderIcon, RefreshIcon, ShieldIcon, SmartphoneIcon, CreditCardIcon, LogoutIcon, ArrowRightIcon, GroupsIcon, SearchIcon, WorkflowIcon } from '../lib/icons';

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

const formatDate = (value?: string | number | null) =>
  value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Not set';

const adminPrimaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] shadow-[0_10px_28px_rgba(37,211,102,0.18)] transition-all hover:-translate-y-[1px] hover:brightness-95 disabled:opacity-50 disabled:hover:translate-y-0';
const adminSecondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-all hover:border-[color:var(--accent-border)] hover:bg-[var(--bg-hover)]';
const adminPill =
  'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]';

export const Admin: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState<'overview' | 'partners' | 'groups' | 'audit' | 'system'>('overview');
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

  const isSuperAdmin = user?.appRole === 'super_admin';

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
              Manage partner workspaces, monitor system health, impersonate accounts for debugging, and view the global audit log.
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
          { id: 'audit', label: 'Audit Log' },
          { id: 'system', label: 'System & Sessions' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'rounded-[14px] px-5 py-2.5 text-[12px] font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-[#020f07] shadow-[0_8px_20px_rgba(37,211,102,0.16)]'
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
              <option value="Solo">Solo</option>
              <option value="Team">Team</option>
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
                          {['Trial', 'Solo', 'Team'].map((plan) => (
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
