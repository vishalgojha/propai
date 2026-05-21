import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import { CheckIcon, GroupsIcon, ListingIcon, LoaderIcon, MailIcon, MapPinIcon, PlusIcon, RefreshIcon, SaveIcon, ShieldCheckIcon, ShieldIcon } from '../lib/icons';
import { useAuth } from '../context/AuthContext';
import { buildFullName, splitFullName } from '../lib/names';

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

type WorkspaceMetadata = {
  agencyName: string | null;
  primaryCity: string | null;
  serviceAreas: Array<{ city: string; locality: string; priority: number }>;
};

type ProfileEditorState = {
  firstName: string;
  lastName: string;
  agencyName: string;
  primaryCity: string;
  areasText: string;
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

const parseServiceAreas = (text: string, primaryCity: string) => {
  const city = primaryCity.trim();
  const areas = new Map<string, { city: string; locality: string; priority: number }>();

  for (const token of text.split(',')) {
    const locality = token.replace(/\s+/g, ' ').trim();
    if (!locality) continue;

    const key = `${city.toLowerCase()}::${locality.toLowerCase()}`;
    if (!areas.has(key)) {
      areas.set(key, { city, locality, priority: 0 });
    }
  }

  return Array.from(areas.values()).slice(0, 30);
};

const formatPlanLabel = (plan?: string | null) => {
  const normalized = String(plan || '').trim().toLowerCase();
  if (normalized === 'trial' || normalized === 'free') return 'Trial';
  if (normalized === 'solo' || normalized === 'pro') return 'Solo';
  return plan || 'Team';
};

export const Team: React.FC = () => {
  const { user } = useAuth();
  const [workspace, setWorkspace] = React.useState<WorkspaceSummary | null>(null);
  const [workspaceMetadata, setWorkspaceMetadata] = React.useState<WorkspaceMetadata | null>(null);
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
  const [profileEditor, setProfileEditor] = React.useState<ProfileEditorState>({
    firstName: '',
    lastName: '',
    agencyName: '',
    primaryCity: 'Mumbai',
    areasText: '',
  });
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [profileSaved, setProfileSaved] = React.useState(false);

  const syncProfileEditor = React.useCallback((metadata?: WorkspaceMetadata | null) => {
    const firstName = String(user?.first_name || '').trim();
    const lastName = String(user?.last_name || '').trim();
    const split = !firstName && !lastName ? splitFullName(user?.full_name) : { firstName, lastName };

    setProfileEditor({
      firstName: split.firstName || '',
      lastName: split.lastName || '',
      agencyName: metadata?.agencyName || '',
      primaryCity: metadata?.primaryCity || 'Mumbai',
      areasText: (metadata?.serviceAreas || []).map((area) => area.locality).join(', '),
    });
  }, [user?.first_name, user?.full_name, user?.last_name]);

  const loadTeamData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [teamResponse, activityResponse, metadataResponse] = await Promise.all([
        backendApi.get(ENDPOINTS.workspace.team),
        backendApi.get(ENDPOINTS.workspace.activity),
        backendApi.get<{ metadata: WorkspaceMetadata }>(ENDPOINTS.workspace.metadata),
      ]);

      setWorkspace(teamResponse.data?.workspace || null);
      setMembers(teamResponse.data?.members || []);
      setSessions(teamResponse.data?.sessions || []);
      setActivity(activityResponse.data?.activity || []);
      const metadata = metadataResponse.data?.metadata || null;
      setWorkspaceMetadata(metadata);
      syncProfileEditor(metadata);
    } catch (err) {
      setError(handleApiError(err));
      setWorkspace(null);
      setWorkspaceMetadata(null);
      setMembers([]);
      setSessions([]);
      setActivity([]);
    } finally {
      setIsLoading(false);
    }
  }, [syncProfileEditor]);

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
  const planLabel = React.useMemo(() => formatPlanLabel(user?.subscription?.plan), [user?.subscription?.plan]);
  const profileName = React.useMemo(
    () => buildFullName(user?.first_name, user?.last_name) || user?.full_name || workspace?.ownerName || user?.email || 'Workspace owner',
    [user?.email, user?.first_name, user?.full_name, user?.last_name, workspace?.ownerName],
  );
  const serviceAreas = React.useMemo(
    () => parseServiceAreas(profileEditor.areasText, profileEditor.primaryCity || 'Mumbai'),
    [profileEditor.areasText, profileEditor.primaryCity],
  );

  const updateProfileField = <K extends keyof ProfileEditorState>(key: K, value: ProfileEditorState[K]) => {
    setProfileEditor((current) => ({ ...current, [key]: value }));
  };

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

  const saveProfile = async () => {
    const firstName = profileEditor.firstName.trim();
    const lastName = profileEditor.lastName.trim();
    const fullName = buildFullName(firstName, lastName);
    const agencyName = profileEditor.agencyName.trim();
    const primaryCity = profileEditor.primaryCity.trim();

    if (!firstName || !lastName) {
      setError('First name and last name are required.');
      return;
    }

    if (agencyName.length < 2) {
      setError('Agency name must be at least 2 characters.');
      return;
    }

    if (primaryCity.length < 2) {
      setError('Primary city must be at least 2 characters.');
      return;
    }

    if (serviceAreas.length === 0) {
      setError('Add at least one service area.');
      return;
    }

    setIsSavingProfile(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.workspace.metadata, {
        agencyName,
        primaryCity,
        serviceAreas,
      });

      const followUpErrors: string[] = [];

      try {
        await backendApi.post(ENDPOINTS.identity.onboarding, {
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          agency_name: agencyName,
          city: primaryCity,
          localities: serviceAreas.map((area) => area.locality),
        });
      } catch (err) {
        followUpErrors.push(`Onboarding sync failed: ${handleApiError(err)}`);
      }

      try {
        await backendApi.post(ENDPOINTS.auth.me, { fullName });
      } catch (err) {
        followUpErrors.push(`Account name sync failed: ${handleApiError(err)}`);
      }

      await loadTeamData();
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 1800);
      if (followUpErrors.length > 0) {
        setError(`Workspace profile saved. ${followUpErrors.join(' ')}`);
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              <GroupsIcon className="h-3.5 w-3.5" />
              Profile & team
            </div>
            <h2 className="mt-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[34px]">
              Your workspace profile, roster, and operator access
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Keep account details current, show the right agency footprint, and control which teammates can work each connected WhatsApp lane.
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Profile owner</p>
          <p className="mt-3 text-lg font-bold text-[var(--text-primary)]">{profileName}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{user?.email || workspace?.ownerEmail || '—'}</p>
        </div>
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Workspace profile</p>
          <p className="mt-3 text-lg font-bold text-[var(--text-primary)]">{workspaceMetadata?.agencyName || 'Complete your profile'}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {workspaceMetadata?.primaryCity || 'Set agency name and city below'}
          </p>
        </div>
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Current plan</p>
          <p className="mt-3 text-lg font-bold text-[var(--text-primary)]">{planLabel}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Controls connected devices, lane sharing, and workspace access.</p>
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
                  : 'Can work stream review and outbound flows'
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
          <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Workspace profile</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              This is the profile other parts of PropAI use for onboarding, workspace identity, and broker coverage.
            </p>

            <div className="mt-5 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={profileEditor.firstName}
                  onChange={(event) => updateProfileField('firstName', event.target.value)}
                  placeholder="First name"
                  className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                />
                <input
                  value={profileEditor.lastName}
                  onChange={(event) => updateProfileField('lastName', event.target.value)}
                  placeholder="Last name"
                  className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                />
              </div>
              <input
                value={profileEditor.agencyName}
                onChange={(event) => updateProfileField('agencyName', event.target.value)}
                placeholder="Agency name"
                className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
              />
              <input
                value={profileEditor.primaryCity}
                onChange={(event) => updateProfileField('primaryCity', event.target.value)}
                placeholder="Primary city"
                className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
              />
              <textarea
                value={profileEditor.areasText}
                onChange={(event) => updateProfileField('areasText', event.target.value)}
                placeholder="Service areas, comma separated"
                className="min-h-[96px] w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
              />
            </div>

            <div className="mt-4 grid gap-3 rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)]">
              <div className="flex items-center gap-2">
                <MailIcon className="h-4 w-4 text-[var(--accent)]" />
                <span>{user?.email || workspace?.ownerEmail || 'No account email'}</span>
              </div>
              <div className="flex items-center gap-2">
                <ListingIcon className="h-4 w-4 text-[var(--accent)]" />
                <span>{profileEditor.agencyName.trim() || 'Agency name not set'}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-4 w-4 text-[var(--accent)]" />
                <span>
                  {profileEditor.primaryCity.trim() || 'City not set'} · {serviceAreas.length} service area{serviceAreas.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={isSavingProfile}
              className={cn(
                'mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-all',
                profileSaved ? 'bg-green-500 text-black' : 'bg-[var(--accent)] text-black hover:opacity-90',
              )}
            >
              {isSavingProfile ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              ) : profileSaved ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <SaveIcon className="h-4 w-4" />
              )}
              {profileSaved ? 'Saved' : 'Save profile'}
            </button>
          </div>

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
            Review recent membership changes, session activity, and workspace operations in one place.
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

        </div>
      </div>
    </div>
  );
};
