import React from 'react';
import { Activity, ArrowRight, Eye, History, Inbox, MessageSquare, RefreshCw, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { cn } from '../lib/utils';
import { useHistorySync } from '../hooks/useHistorySync';
import { useAuth } from '../context/AuthContext';
import { PROPAI_ASSISTANT_NUMBER, PROPAI_ASSISTANT_WA_LINK, PROPAI_PLAN_CARDS } from '../lib/propai';

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
  avgConfidence: number;
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
  if (normalized === 'trial' || normalized === 'free') return 'Trial';
  if (normalized === 'solo' || normalized === 'pro') return 'Solo';
  return 'Team';
};

const EmptyState: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-5xl flex-col justify-center space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-6 md:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent-dim)]">
              <Zap className="h-6 w-6 text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Your workspace is live</p>
              <h2 className="text-[24px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Good to have you, partner.</h2>
            </div>
          </div>

          <p className="mt-5 max-w-xl text-[13px] leading-6 text-[var(--text-secondary)]">
            Connect your WhatsApp number and Pulse starts working immediately — reading group messages, scoring listings, flagging requirements, and keeping your follow-up queue moving.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ['Never miss a listing', 'Every property you hear about, captured before the group scrolls past it.'],
              ['Follow up at the right time', 'Pulse flags hot leads and reminds you who to call next — no spreadsheet needed.'],
              ['Find matches instantly', "Describe what the buyer wants. Pulse searches your full inventory and returns the right unit."],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{copy}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
            Your workspace is secured and ready to receive WhatsApp data.
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/whatsapp')}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#020f07] transition hover:brightness-95"
            >
              <Sparkles className="h-4 w-4" />
              Connect WhatsApp
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/history-sync')}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-base)]"
            >
              <History className="h-4 w-4 text-[var(--accent)]" />
              Import chat history
            </button>
            <a
              href={PROPAI_ASSISTANT_WA_LINK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-base)]"
            >
              <MessageSquare className="h-4 w-4 text-[var(--accent)]" />
              Message Assistant
            </a>
          </div>
        </div>

        <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] p-6 md:p-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">3 steps to your first deal</p>
          <div className="mt-3 space-y-4">
            <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[12px] font-medium text-[var(--text-primary)]">1. Connect your WhatsApp</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Go to Sources, scan the QR, and Pulse starts reading your group messages automatically.</p>
            </div>
            <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[12px] font-medium text-[var(--text-primary)]">2. Tell Pulse what you heard</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Message the agent: "3BHK Bandra West 1.8Cr sale" — Pulse files it, scores it, and routes the match.</p>
            </div>
            <div className="rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[12px] font-medium text-[var(--text-primary)]">3. Close your first deal</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Check matched requirements, pending follow-ups, and hot leads — all in one place, ranked by urgency.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Plans</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {PROPAI_PLAN_CARDS.map((plan) => (
              <div key={plan.name} className="rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">{plan.name}</p>
                <p className="mt-2 text-[22px] font-bold text-[var(--text-primary)]">{plan.price}</p>
                <p className="text-[12px] text-[var(--text-secondary)]">{plan.devices}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[14px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]">Referral lane</p>
          <p className="mt-2 text-[14px] font-semibold text-[var(--text-primary)]">Refer 3 paying brokers, get 1 free month.</p>
          <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
            Your referral code is {user?.referral?.code || 'generated after signup'}. Share Pulse with the PropAI Assistant contact included for onboarding help.
          </p>
          <p className="mt-3 text-[12px] font-medium text-[var(--text-primary)]">Assistant: {PROPAI_ASSISTANT_NUMBER}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] px-5 py-4 text-[12px] text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between">
        <span>Connect WhatsApp in the Sources page to activate live group message parsing.</span>
        <span className="text-[var(--text-primary)]">Workspace ready</span>
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
  const historySync = useHistorySync();
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
      const [statusResponse, statsResponse, metadataResponse, referralResponse] = await Promise.all([
        backendApi.get<WhatsappStatusResponse>(ENDPOINTS.whatsapp.status),
        backendApi.get<StreamStats>(ENDPOINTS.streamItems.stats),
        backendApi.get<{ metadata: WorkspaceMetadata }>(ENDPOINTS.workspace.metadata),
        backendApi.get<{ referral: ReferralSummary }>(ENDPOINTS.workspace.referral),
      ]);

      const nextWhatsapp = statusResponse.data || null;
      const nextStreamStats = statsResponse.data || { total: 0, unread: 0, avgConfidence: 0 };
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
  const hasAnyData = hasStreamData || historySync.totalProcessed > 0 || isConnected || hasCachedData;
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
  const avgConfidence = Number(streamStats?.avgConfidence || 0);
  const subscription = user?.subscription;
  const planLabel = formatPlanLabel(subscription?.plan);
  const trialDaysLeft = subscription?.trial_days_remaining;
  const deviceLimit = planLabel === 'Team' ? 5 : 2;

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
          <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[var(--text-secondary)]">
            A quick view of what’s connected, what’s new, and what to do next.
          </p>
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
            onClick={() => navigate('/agent')}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#020f07] transition hover:brightness-95"
          >
            <MessageSquare className="h-4 w-4" />
            Ask the agent
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Plan status</p>
              <h2 className="mt-1 text-[20px] font-bold text-[var(--text-primary)]">{planLabel}</h2>
              <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                {planLabel === 'Trial'
                  ? `Your 3-day free trial is live${typeof trialDaysLeft === 'number' ? ` with ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left.` : '.'}`
                  : `Your workspace is on the ${planLabel} plan.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                {whatsapp?.activeCount || 0}/{deviceLimit} devices active
              </span>
              {typeof trialDaysLeft === 'number' ? (
                <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]">
                  Trial countdown: {trialDaysLeft}d
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {PROPAI_PLAN_CARDS.map((plan) => (
              <div key={plan.name} className={cn(
                'rounded-[12px] border p-4',
                plan.name === planLabel
                  ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)]'
                  : 'border-[color:var(--border)] bg-[var(--bg-elevated)]',
              )}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">{plan.name}</p>
                <p className="mt-2 text-[20px] font-bold text-[var(--text-primary)]">{plan.price}</p>
                <p className="text-[12px] text-[var(--text-secondary)]">{plan.devices}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">Referral progress</p>
          <h2 className="mt-1 text-[20px] font-bold text-[var(--text-primary)]">{referral?.progressToNextReward || 0}/3 referrals</h2>
          <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
            Refer 3 paying brokers who complete trial and payment to earn 1 free month. Free months earned so far: {referral?.freeMonthsEarned || 0}.
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${((referral?.progressToNextReward || 0) / 3) * 100}%` }} />
          </div>
          <div className="mt-4 rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Share code</p>
            <p className="mt-1 text-[16px] font-bold text-[var(--text-primary)]">{referral?.code || 'Generating...'}</p>
            <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
              Share {referral?.link || 'your referral link'} and tell new brokers they can message the PropAI Assistant at {PROPAI_ASSISTANT_NUMBER} for onboarding help.
            </p>
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
              <a
                href={PROPAI_ASSISTANT_WA_LINK}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-semibold text-[var(--text-primary)]"
              >
                Message Assistant
              </a>
            </div>
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
          onClick={() => navigate('/whatsapp')}
          cta={whatsapp?.status === 'connected' ? 'Manage sources' : 'Connect now'}
        />
        <StatCard
          title="Stream"
          value={loading ? '—' : `${unread} unread`}
          hint={loading ? 'Loading stream stats...' : `${total} total items · avg confidence ${Math.round(avgConfidence)}%`}
          icon={<Sparkles className="h-5 w-5" />}
          tone={unread > 0 ? 'warn' : total > 0 ? 'good' : 'neutral'}
          onClick={() => navigate('/stream')}
          cta={unread > 0 ? 'Review new items' : total > 0 ? 'Open Stream' : 'Seed with history'}
        />
        <StatCard
          title="History sync"
          value={historySync.isProcessing ? 'Importing' : historySync.totalProcessed > 0 ? 'Complete' : 'Not started'}
          hint={historySync.totalProcessed > 0
            ? `${historySync.totalProcessed} messages processed · ${typeof historySync.progress === 'number' ? `${Math.round(historySync.progress)}%` : '…'}`
            : 'Import a WhatsApp TXT export to backfill listings and requirements.'}
          icon={<History className="h-5 w-5" />}
          tone={historySync.isProcessing ? 'warn' : historySync.totalProcessed > 0 ? 'good' : 'neutral'}
          onClick={() => navigate('/history-sync')}
          cta={historySync.totalProcessed > 0 ? 'View importer' : 'Import TXT'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          title="Monitor"
          value="Groups + DMs"
          hint="Live mirror view of your WhatsApp activity for debugging and review."
          icon={<Eye className="h-5 w-5" />}
          onClick={() => navigate('/monitor')}
          cta="Open Monitor"
        />
        <StatCard
          title="Inbox"
          value="Direct messages"
          hint="1:1 follow-up lane (no groups). Keep conversations clean and searchable."
          icon={<Inbox className="h-5 w-5" />}
          onClick={() => navigate('/inbox')}
          cta="Open Inbox"
        />
        <StatCard
          title="Next actions"
          value={isConnected ? (unread > 0 ? 'Review Stream' : 'Ask agent') : 'Connect WhatsApp'}
          hint={isConnected
            ? (unread > 0 ? 'Clear unread items to keep follow-ups moving.' : 'Describe a buyer need and get matching inventory instantly.')
            : 'Connect WhatsApp to start live group parsing and auto-capture.'}
          icon={<ArrowRight className="h-5 w-5" />}
          tone={isConnected ? (unread > 0 ? 'warn' : 'good') : 'warn'}
          onClick={() => navigate(isConnected ? (unread > 0 ? '/stream' : '/agent') : '/whatsapp')}
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
