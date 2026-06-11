import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, MessageSquare, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import { PROPAI_ASSISTANT_NUMBER, PROPAI_CONNECT_WA_LINK } from '../lib/propai';

const DASHBOARD_CACHE_KEY = 'propai.dashboard_cache';

type DashboardCache = {
  whatsapp: WhatsappStatusResponse | null;
  streamStats: StreamStats;
  workspaceMetadata: WorkspaceMetadata | null;
  referral: ReferralSummary | null;
};

function readDashboardCache(): DashboardCache | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardCache;
  } catch {
    return null;
  }
}

function writeDashboardCache(data: DashboardCache) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* quota exceeded — ignore */
  }
}

type StreamStats = {
  total: number;
  unread: number;
};

type WhatsappStatusResponse = {
  status: 'connected' | 'connecting' | 'disconnected';
  activeCount: number;
  connectedPhoneNumber?: string | null;
  connectedOwnerName?: string | null;
};

type WorkspaceMetadata = {
  agencyName: string | null;
  primaryCity: string | null;
  serviceAreas: Array<{ city: string; locality: string; priority: number }>;
  updatedAt?: string | null;
};

type ReferralSummary = {
  code: string;
  link: string;
  qualifiedReferrals: number;
  pendingReferrals: number;
  progressToNextReward: number;
  freeMonthsEarned: number;
  assistantNumber: string;
  assistantWaLink: string;
  shareMessage: string;
};

const formatPlanLabel = (plan?: string | null) => {
  const normalized = String(plan || '').trim().toLowerCase();
  if (normalized === 'trial' || normalized === 'free') return 'Free';
  if (normalized === 'starter') return 'Starter';
  return 'Pro';
};

const EmptyState: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-[58vh] max-w-4xl flex-col gap-4">
      <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">No live data yet</p>
            <h2 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">Connect WhatsApp, then work from data.</h2>
            <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
              Clean inputs matter: one connected number, one workspace profile, and verified listings are what make the dashboard useful.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={PROPAI_CONNECT_WA_LINK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#020f07] transition hover:brightness-95"
            >
              <Sparkles className="h-4 w-4" />
              Connect WhatsApp
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ['Connect WhatsApp', 'Required for live parsing and session status.'],
            ['Add workspace profile', 'Agency, city, and service areas improve matching.'],
            ['Open Stream', 'Review new items and remove bad data quickly.'],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
              <p className="text-[12px] font-semibold text-[var(--text-primary)]">{title}</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
          If WhatsApp gets stuck on connecting, reset the stale session before trying again.
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: 'good' | 'warn' | 'neutral';
  onClick?: () => void;
  cta?: string;
}> = ({ title, value, hint, icon, tone = 'neutral', onClick, cta }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={cn(
      'group w-full rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5 text-left transition',
      onClick ? 'hover:bg-[var(--bg-elevated)]' : 'cursor-default',
    )}
  >
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">{title}</p>
        <p className="mt-2 truncate text-[26px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">{value}</p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{hint}</p>
      </div>
      <div className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border',
        tone === 'good'
          ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
          : tone === 'warn'
            ? 'border-[color:rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.12)] text-[var(--amber)]'
            : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
      )}>
        {icon}
      </div>
    </div>
    {cta ? (
      <div className="mt-4 inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--accent)]">
        <span>{cta}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    ) : null}
  </button>
);

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cached = React.useRef(readDashboardCache());
  const [whatsapp, setWhatsapp] = React.useState<WhatsappStatusResponse | null>(cached.current?.whatsapp ?? null);
  const [streamStats, setStreamStats] = React.useState<StreamStats | null>(cached.current?.streamStats ?? null);
  const [workspaceMetadata, setWorkspaceMetadata] = React.useState<WorkspaceMetadata | null>(cached.current?.workspaceMetadata ?? null);
  const [referral, setReferral] = React.useState<ReferralSummary | null>(cached.current?.referral ?? null);
  const [isSavingMetadata, setIsSavingMetadata] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const streamStatsRequest = backendApi.get<StreamStats>(ENDPOINTS.streamItems.stats).catch((err) => {
        if ((err as any)?.response?.status === 403) {
          return { data: { total: 0, unread: 0 } } as { data: StreamStats };
        }

        throw err;
      });

      const [statusResponse, statsResponse, metadataResponse, referralResponse] = await Promise.all([
        backendApi.get<WhatsappStatusResponse>(ENDPOINTS.whatsapp.status),
        streamStatsRequest,
        backendApi.get<{ metadata: WorkspaceMetadata }>(ENDPOINTS.workspace.metadata),
        backendApi.get<{ referral: ReferralSummary }>(ENDPOINTS.workspace.referral),
      ]);

      const nextWhatsapp = statusResponse.data || null;
      const nextStreamStats = statsResponse.data || { total: 0, unread: 0 };
      const nextMetadata = metadataResponse.data?.metadata || null;
      const nextReferral = referralResponse.data?.referral || null;

      setWhatsapp(nextWhatsapp);
      setStreamStats(nextStreamStats);
      setWorkspaceMetadata(nextMetadata);
      setReferral(nextReferral);

      writeDashboardCache({
        whatsapp: nextWhatsapp,
        streamStats: nextStreamStats,
        workspaceMetadata: nextMetadata,
        referral: nextReferral,
      });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const isConnected = whatsapp?.status === 'connected';
  const hasStreamData = Number(streamStats?.total || 0) > 0;
  const hasCachedData = Boolean(cached.current && (cached.current.streamStats.total > 0 || cached.current.whatsapp?.status === 'connected' || cached.current.workspaceMetadata?.agencyName));
  const hasAnyData = hasStreamData || isConnected || hasCachedData;
  const needsOnboarding = !workspaceMetadata?.agencyName || !workspaceMetadata?.primaryCity || (workspaceMetadata?.serviceAreas?.length || 0) === 0;

  if (!hasAnyData && !loading && !error) {
    return <EmptyState />;
  }

  const whatsappValue = loading ? '—' : (
    whatsapp?.status === 'connected'
      ? `${whatsapp.activeCount || 1} connected`
      : whatsapp?.status === 'connecting'
        ? 'Connecting'
        : 'Disconnected'
  );

  const whatsappHint = whatsapp?.status === 'connected'
    ? `Pulse is receiving data from ${whatsapp.connectedOwnerName || 'your device'}${whatsapp.connectedPhoneNumber ? ` · ${whatsapp.connectedPhoneNumber}` : ''}.`
    : whatsapp?.status === 'connecting'
      ? 'Finish pairing / QR scan to start live parsing.'
      : 'Connect WhatsApp to start live group parsing.';

  const unread = Number(streamStats?.unread || 0);
  const total = Number(streamStats?.total || 0);
  const subscription = user?.subscription;
  const planLabel = formatPlanLabel(subscription?.plan);
  const trialDaysLeft = subscription?.trial_days_remaining;
  const deviceLimit = 1;

  const handleSaveMetadata = async (payload: { agencyName: string; primaryCity: string; serviceAreas: WorkspaceMetadata['serviceAreas'] }) => {
    setIsSavingMetadata(true);
    setError(null);
    try {
      const response = await backendApi.post<{ metadata: WorkspaceMetadata }>(ENDPOINTS.workspace.metadata, payload);
      if (response.data?.metadata) {
        setWorkspaceMetadata(response.data.metadata);
      } else {
        await load();
      }
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsSavingMetadata(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Home</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">Pulse Dashboard</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--text-secondary)]">Live data, recent items, next action.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)]"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('propai:open-pulse'))}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#020f07] transition hover:brightness-95"
          >
            <MessageSquare className="h-4 w-4" />
            Ask Pulse
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Account</p>
              <h2 className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">{planLabel}</h2>
              <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                {planLabel === 'Free'
                  ? `Free trial live${typeof trialDaysLeft === 'number' ? ` · ${trialDaysLeft}d left` : ''}.`
                  : `Workspace on the ${planLabel} plan.`}
              </p>
            </div>
            <span className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              {whatsapp?.activeCount || 0}/{deviceLimit} devices active
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
            {typeof trialDaysLeft === 'number' ? (
              <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5">Trial {trialDaysLeft}d</span>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/pricing')}
              className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[var(--text-primary)] transition hover:bg-[var(--bg-base)]"
            >
              Open pricing
            </button>
          </div>
        </div>

        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Referral</p>
              <h2 className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">{referral?.code || 'Generating...'}</h2>
              <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                {referral?.progressToNextReward || 0}/3 paid referrals. New brokers can message the assistant at {PROPAI_ASSISTANT_NUMBER}.
              </p>
            </div>
            <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
              {referral?.freeMonthsEarned || 0} free months
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (referral?.shareMessage) {
                  void navigator.clipboard.writeText(referral.shareMessage);
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[11px] font-semibold text-[#020f07]"
            >
              Copy referral copy
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[14px] border border-[color:rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-5 py-4 text-[12px] text-[var(--text-primary)]">
          {error}
        </div>
      ) : null}

      {needsOnboarding ? (
        <OnboardingCard
          initial={workspaceMetadata}
          isSaving={isSavingMetadata}
          onSave={handleSaveMetadata}
        />
      ) : workspaceMetadata ? (
        <div className="rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">Workspace profile</p>
              <h2 className="mt-1 text-[18px] font-bold text-[var(--text-primary)]">{workspaceMetadata.agencyName}</h2>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                {workspaceMetadata.primaryCity}{workspaceMetadata.serviceAreas?.length ? ` · ${workspaceMetadata.serviceAreas.length} service area${workspaceMetadata.serviceAreas.length === 1 ? '' : 's'}` : ''}
              </p>
            </div>
          </div>
          {workspaceMetadata.serviceAreas?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {workspaceMetadata.serviceAreas.slice(0, 8).map((area) => (
                <span key={area.locality} className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">
                  {area.locality}
                </span>
              ))}
              {workspaceMetadata.serviceAreas.length > 8 ? (
                <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">
                  +{workspaceMetadata.serviceAreas.length - 8} more
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          title="WhatsApp connection"
          value={whatsappValue}
          hint={whatsappHint}
          icon={<Activity className="h-5 w-5" />}
          tone={whatsapp?.status === 'connected' ? 'good' : whatsapp?.status === 'connecting' ? 'warn' : 'neutral'}
          onClick={() => {
            if (whatsapp?.status === 'connected') {
              navigate('/whatsapp');
            } else {
              window.open(PROPAI_CONNECT_WA_LINK, '_blank', 'noopener');
            }
          }}
          cta={whatsapp?.status === 'connected' ? 'Manage sources' : 'Connect now'}
        />
        <StatCard
          title="Stream"
          value={loading ? '—' : `${unread} unread`}
          hint={loading ? 'Loading stream stats...' : `${total} total items`}
          icon={<Sparkles className="h-5 w-5" />}
          tone={unread > 0 ? 'warn' : total > 0 ? 'good' : 'neutral'}
          onClick={() => navigate('/stream')}
          cta={unread > 0 ? 'Review new items' : total > 0 ? 'Open Stream' : 'Browse listings'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          title="Pulse assistant"
          value="Plain-language ops"
          hint="Save requirements, search CRM, check follow-ups, and work the workspace from the dock."
          icon={<Activity className="h-5 w-5" />}
          onClick={() => window.dispatchEvent(new Event('propai:open-pulse'))}
          cta="Open Pulse"
        />
        <StatCard
          title="Next actions"
          value={isConnected ? (unread > 0 ? 'Review Stream' : 'Ask agent') : 'Connect WhatsApp'}
          hint={isConnected
            ? (unread > 0 ? 'Clear unread items to keep follow-ups moving.' : 'Describe a buyer need and get matching inventory instantly.')
            : 'Connect WhatsApp to start live group parsing and auto-capture.'}
          icon={<ArrowRight className="h-5 w-5" />}
          tone={isConnected ? (unread > 0 ? 'warn' : 'good') : 'warn'}
          onClick={() => {
            if (isConnected) {
              if (unread > 0) {
                navigate('/stream');
              } else {
                window.dispatchEvent(new Event('propai:open-pulse'));
              }
            } else {
              window.open(PROPAI_CONNECT_WA_LINK, '_blank', 'noopener');
            }
          }}
          cta="Go"
        />
      </div>
    </div>
  );
};

const parseAreas = (value: string, primaryCity: string) => {
  const tokens = value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const areas = new Map<string, { city: string; locality: string; priority: number }>();
  for (const token of tokens) {
    const normalized = token.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = `${primaryCity.toLowerCase()}::${normalized.toLowerCase()}`;
    areas.set(key, { city: primaryCity, locality: normalized, priority: 0 });
  }
  return Array.from(areas.values()).slice(0, 30);
};

const OnboardingCard: React.FC<{
  initial: WorkspaceMetadata | null;
  isSaving: boolean;
  onSave: (payload: { agencyName: string; primaryCity: string; serviceAreas: WorkspaceMetadata['serviceAreas'] }) => void;
}> = ({ initial, isSaving, onSave }) => {
  const [agencyName, setAgencyName] = React.useState(initial?.agencyName || '');
  const [primaryCity, setPrimaryCity] = React.useState(initial?.primaryCity || 'Mumbai');
  const [areasText, setAreasText] = React.useState(() => (initial?.serviceAreas || []).map((a) => a.locality).join(', '));

  React.useEffect(() => {
    setAgencyName((current) => current || initial?.agencyName || '');
    setPrimaryCity((current) => current || initial?.primaryCity || 'Mumbai');
    setAreasText((current) => {
      if (current.trim()) return current;
      const next = (initial?.serviceAreas || []).map((a) => a.locality).join(', ');
      return next || current;
    });
  }, [initial?.agencyName, initial?.primaryCity, initial?.serviceAreas]);

  const cleanedAgencyName = agencyName.trim();
  const cleanedCity = primaryCity.trim();
  const previewAreas = React.useMemo(() => parseAreas(areasText, cleanedCity || 'Mumbai'), [areasText, cleanedCity]);

  const canSave = cleanedAgencyName.length >= 2 && cleanedCity.length >= 2 && previewAreas.length > 0 && !isSaving;

  return (
    <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">First-time setup</p>
          <h2 className="mt-1 text-[16px] font-semibold text-[var(--text-primary)]">Tell Pulse where you operate</h2>
          <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--text-secondary)]">
            This creates structured workspace metadata (agency name, city, service areas) so Stream and AI don’t have to guess.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Agency name</span>
          <input
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            placeholder="e.g., Shah Realty"
            className="mt-2 w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Primary city</span>
          <input
            value={primaryCity}
            onChange={(e) => setPrimaryCity(e.target.value)}
            placeholder="e.g., Mumbai"
            className="mt-2 w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
          />
        </label>
        <label className="block lg:col-span-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Locations you serve</span>
          <textarea
            value={areasText}
            onChange={(e) => setAreasText(e.target.value)}
            placeholder="Bandra West, Khar West, Santacruz West, Andheri West"
            className="mt-2 min-h-[86px] w-full rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent)]"
          />
          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Tip: comma-separated is fine. We’ll turn this into structured service areas.
          </p>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] text-[var(--text-secondary)]">
          {previewAreas.length > 0 ? `${previewAreas.length} service areas ready` : 'Add at least one locality'}
        </div>
        <button
          type="button"
          onClick={() => onSave({ agencyName: cleanedAgencyName, primaryCity: cleanedCity, serviceAreas: previewAreas })}
          disabled={!canSave}
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#020f07] transition hover:brightness-95 disabled:opacity-50"
        >
          {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Save workspace profile
        </button>
      </div>
    </div>
  );
};
