import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import { AlertTriangleIcon, GroupsIcon, PlusIcon, RefreshIcon, ShieldIcon } from '../lib/icons';

type WorkspaceSummary = {
  ownerId: string;
  ownerEmail?: string | null;
  ownerName?: string | null;
  memberRole: string;
  isWorkspaceOwner: boolean;
  canManageTeam: boolean;
  canSendOutbound?: boolean;
  assignedSessionLabels?: string[];
  preferredSessionLabel?: string | null;
  hasSessionRestriction?: boolean;
};

type WorkspaceMember = {
  id: string;
  userId?: string | null;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  role: string;
  status: string;
  invitedAt?: string | null;
  joinedAt?: string | null;
  lastActiveAt?: string | null;
  updatedAt?: string | null;
  assignedSessionLabels?: string[];
  preferredSessionLabel?: string | null;
};

type WorkspaceSessionOption = {
  label: string;
  ownerName?: string | null;
  phoneNumber?: string | null;
  status: string;
  lastSync?: string | null;
};

type WorkspaceActivity = {
  id: string;
  actor_email?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  event_type: string;
  summary: string;
  created_at: string;
};

const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';

export const Team: React.FC = () => {
  const [workspace, setWorkspace] = React.useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = React.useState<WorkspaceMember[]>([]);
  const [sessions, setSessions] = React.useState<WorkspaceSessionOption[]>([]);
  const [activity, setActivity] = React.useState<WorkspaceActivity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    email: '',
    fullName: '',
    phone: '',
    role: 'realtor',
  });

  const loadTeamData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [teamResponse, activityResponse] = await Promise.all([
        backendApi.get(ENDPOINTS.workspace.team),
        backendApi.get(ENDPOINTS.workspace.activity),
      ]);

      setWorkspace(teamResponse.data?.workspace || null);
      setMembers(teamResponse.data?.members || []);
      setSessions(teamResponse.data?.sessions || []);
      setActivity(activityResponse.data?.activity || []);
    } catch (err) {
      setError(handleApiError(err));
      setWorkspace(null);
      setMembers([]);
      setSessions([]);
      setActivity([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadTeamData();
  }, [loadTeamData]);

  const addMember = async () => {
    if (!workspace?.canManageTeam || !form.email.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await backendApi.post(ENDPOINTS.workspace.team, form);
      if (response.data?.member) {
        setMembers((current) => [response.data.member, ...current.filter((member) => member.id !== response.data.member.id)]);
      }
      setForm({ email: '', fullName: '', phone: '', role: 'realtor' });
      void loadTeamData();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const updateMember = async (memberId: string, patch: Partial<WorkspaceMember>) => {
    if (!workspace?.canManageTeam) return;

    setError(null);
    try {
      const response = await backendApi.patch(ENDPOINTS.workspace.updateMember(memberId), patch);
      const next = response.data?.member;
      if (next) {
        setMembers((current) => current.map((member) => (member.id === memberId ? next : member)));
      }
      void loadTeamData();
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const connectedSessions = React.useMemo(
    () => sessions.filter((session) => session.status === 'connected'),
    [sessions],
  );

  const toggleAssignedSession = async (member: WorkspaceMember, sessionLabel: string) => {
    const assigned = new Set(member.assignedSessionLabels || []);
    if (assigned.has(sessionLabel)) {
      assigned.delete(sessionLabel);
    } else {
      assigned.add(sessionLabel);
    }

    const nextAssigned = Array.from(assigned);
    const nextPreferred = nextAssigned.includes(member.preferredSessionLabel || '')
      ? member.preferredSessionLabel || null
      : nextAssigned[0] || null;

    await updateMember(member.id, {
      assignedSessionLabels: nextAssigned,
      preferredSessionLabel: nextPreferred,
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              <GroupsIcon className="h-3.5 w-3.5" />
              Team workspace
            </div>
            <h2 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[34px]">
              Run one broker workspace with clear operator lanes
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Add operators, assign which WhatsApp numbers they can send from, and keep broker activity inside one shared PropAI Pulse workspace instead of splitting the business into separate accounts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTeamData()}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Workspace owner</p>
          <p className="mt-3 text-lg font-bold text-[var(--text-primary)]">{workspace?.ownerName || workspace?.ownerEmail || 'Workspace'}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{workspace?.ownerEmail || '—'}</p>
        </div>
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Your role</p>
          <p className="mt-3 text-lg font-bold capitalize text-[var(--text-primary)]">{workspace?.memberRole || 'broker'}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {workspace?.canManageTeam
              ? 'Can add and manage team members'
              : workspace?.canSendOutbound
                ? workspace?.hasSessionRestriction
                  ? `Can work only assigned lanes${workspace.preferredSessionLabel ? `, defaulting to ${workspace.preferredSessionLabel}` : ''}`
                  : 'Can work the inbox, monitor, and outbound flows'
                : 'Read-only team access'}
          </p>
        </div>
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Connected lanes</p>
          <p className="mt-3 text-lg font-bold text-[var(--text-primary)]">{connectedSessions.length}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Numbers currently live inside this broker workspace</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6">
          {workspace?.canManageTeam ? (
            <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
              <div className="flex items-center gap-2">
                <PlusIcon className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Add team member</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Invite a realtor, ops teammate, or internal operator by email. If they already have an account, the membership becomes active immediately. Otherwise it stays invited until they sign in.
              </p>

              <div className="mt-5 space-y-3">
                <input
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email address"
                  className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                />
                <input
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Full name"
                  className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                />
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Phone number"
                  className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                />
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
                >
                  <option value="realtor">Realtor</option>
                  <option value="admin">Admin</option>
                  <option value="ops">Ops</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  onClick={() => void addMember()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-black transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <PlusIcon className="h-4 w-4" />
                  {isSaving ? 'Adding...' : 'Add member'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
              <div className="flex items-center gap-2">
                <ShieldIcon className="h-4 w-4 text-[var(--amber)]" />
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Read-only workspace access</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Your current role doesn’t allow member management. You can still review the roster, lane ownership, and recent workspace activity from here.
              </p>
            </div>
          )}

          <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Connected WhatsApp lanes</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Each connected number stays inside the same broker workspace. Assign lanes to operators when you want to prevent two teammates from sending from the same number.
            </p>
            <div className="mt-4 space-y-3">
              {connectedSessions.map((session) => (
                <div key={session.label} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{session.ownerName || session.label}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{session.phoneNumber || 'No number captured'}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                    {session.label} · {session.status} · last sync {formatDate(session.lastSync)}
                  </p>
                </div>
              ))}
              {!isLoading && connectedSessions.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[color:var(--border)] px-4 py-8 text-sm text-[var(--text-secondary)]">
                  No live WhatsApp numbers yet. Connect devices in WhatsApp setup first, then assign them here.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Team roster</h3>
            <div className="mt-4 space-y-3">
              {members.map((member) => (
                <div key={member.id} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{member.fullName || member.email}</p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{member.email}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                        {member.phone || 'No phone yet'} · invited {formatDate(member.invitedAt)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 md:items-end">
                      {workspace?.canManageTeam ? (
                        <>
                          <select
                            value={member.role}
                            onChange={(event) => void updateMember(member.id, { role: event.target.value })}
                            className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none"
                          >
                            <option value="admin">Admin</option>
                            <option value="realtor">Realtor</option>
                            <option value="ops">Ops</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <select
                            value={member.status}
                            onChange={(event) => void updateMember(member.id, { status: event.target.value })}
                            className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none"
                          >
                            <option value="invited">Invited</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </>
                      ) : (
                        <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                          {member.role} · {member.status}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--text-secondary)]">
                    <span>Joined {formatDate(member.joinedAt)}</span>
                    <span>Last active {formatDate(member.lastActiveAt)}</span>
                  </div>
                  <div className="mt-4 rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Outbound lane assignment</p>
                        <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                          Leave this empty for shared access, or assign specific numbers when this operator should only send from selected lanes.
                        </p>
                      </div>
                      {member.assignedSessionLabels && member.assignedSessionLabels.length > 0 ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                          Restricted to {member.assignedSessionLabels.length} lane{member.assignedSessionLabels.length > 1 ? 's' : ''}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                          Shared lane access
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {connectedSessions.map((session) => {
                        const isAssigned = (member.assignedSessionLabels || []).includes(session.label);
                        return (
                          <button
                            key={session.label}
                            type="button"
                            disabled={!workspace?.canManageTeam}
                            onClick={() => void toggleAssignedSession(member, session.label)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                              isAssigned
                                ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                                : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                            )}
                          >
                            {session.ownerName || session.label}
                            {session.phoneNumber ? ` · ${session.phoneNumber}` : ''}
                          </button>
                        );
                      })}
                      {connectedSessions.length === 0 ? (
                        <div className="text-[12px] text-[var(--text-secondary)]">
                          Connect a WhatsApp number before assigning lanes.
                        </div>
                      ) : null}
                    </div>
                    {workspace?.canManageTeam ? (
                      <div className="mt-3">
                        <select
                          value={member.preferredSessionLabel || ''}
                          onChange={(event) => void updateMember(member.id, { preferredSessionLabel: event.target.value || null })}
                          disabled={(member.assignedSessionLabels || []).length === 0}
                          className="w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none disabled:opacity-60"
                        >
                          <option value="">Preferred lane for this operator</option>
                          {(member.assignedSessionLabels || []).map((label) => {
                            const session = connectedSessions.find((entry) => entry.label === label) || sessions.find((entry) => entry.label === label);
                            return (
                              <option key={label} value={label}>
                                {session?.ownerName || label}{session?.phoneNumber ? ` • ${session.phoneNumber}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {!isLoading && members.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[color:var(--border)] px-4 py-8 text-sm text-[var(--text-secondary)]">
                  No team members yet. Add your first realtor or ops teammate from the panel above.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">Recent workspace activity</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            This feed captures the actions already logged for the broker workspace: session connects, disconnects, direct sends, broadcasts, and team changes.
          </p>

          <div className="mt-5 space-y-3">
            {activity.map((event) => (
              <div key={event.id} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{event.summary}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      {(event.actor_name || event.actor_email || 'Workspace user')} · {event.actor_role || 'broker'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--text-secondary)]">{formatDate(event.created_at)}</span>
                </div>
              </div>
            ))}

            {!isLoading && activity.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[color:var(--border)] px-4 py-10 text-sm text-[var(--text-secondary)]">
                We haven’t logged workspace activity yet. It will start filling as the team sends messages, changes members, or updates WhatsApp sessions.
              </div>
            ) : null}
          </div>

          <div className="mt-6 rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-base)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <AlertTriangleIcon className="h-4 w-4 text-[var(--amber)]" />
              <span className="font-semibold">Current scope</span>
            </div>
            <p className="mt-2">
              This production slice now covers team membership, lane assignment, and outbound guardrails by WhatsApp number. It still does not do thread ownership, approval chains, or team-by-team DM review queues yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
