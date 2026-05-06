import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import { AlertTriangleIcon, CheckCircleIcon, GroupsIcon, PlusIcon, RefreshIcon, ShieldIcon } from '../lib/icons';

type WorkspaceSummary = {
  ownerId: string;
  ownerEmail?: string | null;
  ownerName?: string | null;
  memberRole: string;
  isWorkspaceOwner: boolean;
  canManageTeam: boolean;
  canSendOutbound?: boolean;
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
      setActivity(activityResponse.data?.activity || []);
    } catch (err) {
      setError(handleApiError(err));
      setWorkspace(null);
      setMembers([]);
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

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              <GroupsIcon className="h-3.5 w-3.5" />
              Broker workspace admin
            </div>
            <h2 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[34px]">
              Add team members and monitor their activity
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
              This is the broker-facing admin surface. Use it to build your internal team, assign roles, and keep an eye on WhatsApp, broadcast, and workspace actions from one place.
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
                ? 'Can work the inbox, monitor, and outbound flows'
                : 'Read-only team access'}
          </p>
        </div>
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Team size</p>
          <p className="mt-3 text-lg font-bold text-[var(--text-primary)]">{members.length + 1}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Owner plus invited and active members</p>
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
                Invite a realtor, ops teammate, or internal admin by email. If they already have an account, the membership becomes active immediately. Otherwise it stays invited until they sign in.
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
                Your current role doesn’t allow member management. You can still see the team roster and recent workspace activity from here.
              </p>
            </div>
          )}

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
            This feed captures the actions we already log for the workspace: session connects, disconnects, direct sends, broadcasts, and team changes.
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
              This first production slice gives you team membership, status control, and a live activity feed. It doesn’t yet do granular permission matrices or team-by-team DM approvals, but the data layer is now ready for that next step.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
