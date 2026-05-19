import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BroadcastIcon,
  CheckCircleIcon,
  CreditCardIcon,
  GroupsIcon,
  RefreshIcon,
  SaveIcon,
  SettingsIcon,
  SmartphoneIcon,
} from '../lib/icons';
import { cn } from '../lib/utils';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { PROPAI_ASSISTANT_WA_LINK } from '../lib/propai';
import { SurfaceSection } from '../components/ui/SurfaceSection';

type WabroStats = {
  total_campaigns: number;
  total_sent: number;
  total_failed: number;
  total_skipped: number;
  active_devices: number;
  total_devices: number;
};

type WabroCampaign = {
  id: string;
  name: string;
  status: string;
  total_contacts?: number | null;
  sent_count?: number | null;
  failed_count?: number | null;
  skipped_count?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
};

type WabroList = {
  name: string;
  count: number;
};

type WabroContact = {
  id: string;
  name: string;
  phone: string;
  locality?: string | null;
};

type WabroDevice = {
  device_id: string;
  display_name: string;
  device_model?: string | null;
  android_version?: string | null;
  app_version?: string | null;
  platform?: string | null;
  registration_status?: string | null;
  last_poll_at?: string | null;
  last_sync_at?: string | null;
  claimed_at?: string | null;
  created_at?: string | null;
};

type WabroPendingRegistration = {
  id: string;
  device_label: string;
  platform: string;
  status: string;
  expires_at?: string | null;
  created_at?: string | null;
};

type WabroProvisionPayload = {
  registration: WabroPendingRegistration;
  token: string;
  token_masked: string;
};

type ServiceState = 'idle' | 'loading' | 'ready' | 'degraded';

type AccessState = {
  hasAccess: boolean;
  reason: 'owner' | 'trial' | 'request-access';
  trialDaysRemaining?: number | null;
};

const WABRO_PRICE = '₹499 / bi-annual';
const WABRO_TRIAL_DAYS = 7;

const WABRO_NAV = [
  { label: 'Overview', path: '/wabro/app' },
  { label: 'Campaigns', path: '/wabro/app/campaigns' },
  { label: 'Devices', path: '/wabro/app/devices' },
  { label: 'Setup', path: '/wabro/app/setup' },
  { label: 'Billing', path: '/wabro/app/billing' },
] as const;

const EMPTY_STATS: WabroStats = {
  total_campaigns: 0,
  total_sent: 0,
  total_failed: 0,
  total_skipped: 0,
  active_devices: 0,
  total_devices: 0,
};

function resolveWabroAccess(user: ReturnType<typeof useAuth>['user']): AccessState {
  const isOwner = user?.appRole === 'super_admin';
  const createdAt = user?.subscription?.created_at ? new Date(user.subscription.created_at) : null;
  const renewalDate = user?.subscription?.renewal_date ? new Date(user.subscription.renewal_date) : null;
  const now = Date.now();
  const explicitTrialDays = typeof user?.subscription?.trial_days_remaining === 'number'
    ? user.subscription.trial_days_remaining
    : null;
  const daysSinceCreated = createdAt ? Math.floor((now - createdAt.getTime()) / 86_400_000) : null;
  const createdWithinTrial = typeof daysSinceCreated === 'number' && daysSinceCreated < WABRO_TRIAL_DAYS;
  const renewalWithinTrial = renewalDate ? renewalDate.getTime() > now : false;
  const isTrialSubscription = ['trial', 'trialing'].includes(String(user?.subscription?.status || '').toLowerCase())
    || ['trial', 'free'].includes(String(user?.subscription?.plan || '').toLowerCase());

  if (isOwner) {
    return { hasAccess: true, reason: 'owner' };
  }

  if (isTrialSubscription || createdWithinTrial || renewalWithinTrial) {
    const computedRemaining = explicitTrialDays ?? (
      createdAt
        ? Math.max(0, WABRO_TRIAL_DAYS - Math.floor((now - createdAt.getTime()) / 86_400_000))
        : null
    );
    return {
      hasAccess: true,
      reason: 'trial',
      trialDaysRemaining: computedRemaining,
    };
  }

  return { hasAccess: false, reason: 'request-access' };
}

function formatNumber(value?: number | null) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatShortDate(value?: string | null) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function parseBulkContacts(raw: string) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', phone = '', locality = ''] = line.split(',').map((part) => part.trim());
      return { name, phone, locality };
    })
    .filter((row) => row.name && row.phone);
}

function ServiceBanner({
  state,
  error,
  onRetry,
}: {
  state: ServiceState;
  error: string | null;
  onRetry?: () => void;
}) {
  if (state === 'ready' && !error) {
    return (
      <div className="rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[12px] text-[var(--text-primary)]">
        WaBro is live inside PropAI. This route is using your shared PropAI session and the monorepo `/api/wabro` backend.
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[12px] text-[var(--text-secondary)]">
        Loading WaBro workspace data…
      </div>
    );
  }

  if (state === 'degraded' || error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[color:var(--amber)]/25 bg-[rgba(245,158,11,0.08)] px-4 py-3">
        <div>
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">WaBro backend is temporarily unavailable</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
            {error || 'The product shell is available, but campaign and device data could not be loaded right now.'}
          </p>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}

function AccessGate({
  access,
  title,
  body,
}: {
  access: AccessState;
  title?: string;
  body?: string;
}) {
  if (access.hasAccess) {
    return null;
  }

  return (
    <div className="rounded-[18px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
            <CreditCardIcon className="h-3.5 w-3.5" />
            WaBro access
          </div>
          <h3 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            {title || 'Unlock WaBro'}
          </h3>
          <p className="mt-2 max-w-xl text-[13px] leading-6 text-[var(--text-secondary)]">
            {body || 'WaBro includes a 7-day free trial so you can install the Android app, confirm the shared login flow, and test delivery before paying. After the trial, campaign execution stays behind the WaBro plan.'}
          </p>
        </div>

        <div className="min-w-[220px] rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Plan after trial</p>
          <strong className="mt-2 block text-[24px] font-bold text-[var(--text-primary)]">{WABRO_PRICE}</strong>
          <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">Free for the first {WABRO_TRIAL_DAYS} days.</p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              to="/wabro/app/billing"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90"
            >
              View plan
            </Link>
            <a
              href={PROPAI_ASSISTANT_WA_LINK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            >
              Ask for access
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function WabroShell({
  title,
  subtitle,
  children,
  actions,
  serviceState,
  error,
  onRetry,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  serviceState: ServiceState;
  error: string | null;
  onRetry?: () => void;
}) {
  const location = useLocation();

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
              <BroadcastIcon className="h-3.5 w-3.5" />
              WaBro
            </div>
            <h2 className="mt-4 text-[30px] font-bold tracking-[-0.03em] text-[var(--text-primary)] md:text-[36px]">
              {title}
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--text-secondary)]">{subtitle}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Live in PropAI', 'Android execution', 'Shared auth + backend'].map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>

          {actions ? <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">{actions}</div> : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {WABRO_NAV.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  active
                    ? 'border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]'
                    : 'border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <ServiceBanner state={serviceState} error={error} onRetry={onRetry} />
      {children}
    </div>
  );
}

function useWabroOverviewData() {
  const [serviceState, setServiceState] = React.useState<ServiceState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<WabroStats>(EMPTY_STATS);
  const [campaigns, setCampaigns] = React.useState<WabroCampaign[]>([]);
  const [lists, setLists] = React.useState<WabroList[]>([]);

  const load = React.useCallback(async () => {
    setServiceState('loading');
    setError(null);
    try {
      const [statsResp, listsResp] = await Promise.all([
        backendApi.get(ENDPOINTS.wabro.dashboardStats),
        backendApi.get(ENDPOINTS.wabro.contacts),
      ]);
      setStats(statsResp.data?.stats || EMPTY_STATS);
      setCampaigns(Array.isArray(statsResp.data?.campaigns) ? statsResp.data.campaigns : []);
      setLists(Array.isArray(listsResp.data?.lists) ? listsResp.data.lists : []);
      setServiceState('ready');
    } catch (err) {
      setError(handleApiError(err));
      setServiceState('degraded');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { serviceState, error, stats, campaigns, lists, reload: load };
}

function useWabroCampaignData() {
  const [serviceState, setServiceState] = React.useState<ServiceState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [campaigns, setCampaigns] = React.useState<WabroCampaign[]>([]);
  const [lists, setLists] = React.useState<WabroList[]>([]);
  const [isSavingList, setIsSavingList] = React.useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = React.useState(false);

  const load = React.useCallback(async () => {
    setServiceState('loading');
    setError(null);
    try {
      const [campaignResp, listsResp] = await Promise.all([
        backendApi.get(ENDPOINTS.wabro.campaigns),
        backendApi.get(ENDPOINTS.wabro.contacts),
      ]);
      setCampaigns(Array.isArray(campaignResp.data?.campaigns) ? campaignResp.data.campaigns : []);
      setLists(Array.isArray(listsResp.data?.lists) ? listsResp.data.lists : []);
      setServiceState('ready');
    } catch (err) {
      setError(handleApiError(err));
      setServiceState('degraded');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const addContacts = React.useCallback(async (payload: { list_name: string; contacts: Array<{ name: string; phone: string; locality?: string }> }) => {
    setIsSavingList(true);
    setError(null);
    try {
      await backendApi.post(ENDPOINTS.wabro.contacts, payload);
      await load();
    } catch (err) {
      setError(handleApiError(err));
      throw err;
    } finally {
      setIsSavingList(false);
    }
  }, [load]);

  const createCampaign = React.useCallback(async (payload: { name: string; listName: string; message_template: string }) => {
    setIsSavingCampaign(true);
    setError(null);
    try {
      const contactsResp = await backendApi.get(ENDPOINTS.wabro.contactsByList(payload.listName));
      const contacts = Array.isArray(contactsResp.data?.contacts) ? contactsResp.data.contacts : [];
      await backendApi.post(ENDPOINTS.wabro.campaigns, {
        name: payload.name,
        message_template: payload.message_template,
        contacts: contacts.map((contact: WabroContact) => ({ name: contact.name, phone: contact.phone })),
      });
      await load();
    } catch (err) {
      setError(handleApiError(err));
      throw err;
    } finally {
      setIsSavingCampaign(false);
    }
  }, [load]);

  const updateCampaignStatus = React.useCallback(async (campaignId: string, status: string) => {
    setError(null);
    try {
      await backendApi.patch(ENDPOINTS.wabro.campaignStatus(campaignId), { status });
      await load();
    } catch (err) {
      setError(handleApiError(err));
    }
  }, [load]);

  return {
    serviceState,
    error,
    campaigns,
    lists,
    isSavingList,
    isSavingCampaign,
    addContacts,
    createCampaign,
    updateCampaignStatus,
    reload: load,
  };
}

function useWabroDeviceData() {
  const [serviceState, setServiceState] = React.useState<ServiceState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<WabroStats>(EMPTY_STATS);
  const [campaigns, setCampaigns] = React.useState<WabroCampaign[]>([]);
  const [devices, setDevices] = React.useState<WabroDevice[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = React.useState<WabroPendingRegistration[]>([]);

  const load = React.useCallback(async () => {
    setServiceState('loading');
    setError(null);
    try {
      const [statsResponse, devicesResponse] = await Promise.all([
        backendApi.get(ENDPOINTS.wabro.dashboardStats),
        backendApi.get(ENDPOINTS.wabro.devices),
      ]);
      setStats(statsResponse.data?.stats || EMPTY_STATS);
      setCampaigns(Array.isArray(statsResponse.data?.campaigns) ? statsResponse.data.campaigns : []);
      setDevices(Array.isArray(devicesResponse.data?.devices) ? devicesResponse.data.devices : []);
      setPendingRegistrations(Array.isArray(devicesResponse.data?.pending_registrations) ? devicesResponse.data.pending_registrations : []);
      setServiceState('ready');
    } catch (err) {
      setError(handleApiError(err));
      setServiceState('degraded');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { serviceState, error, stats, campaigns, devices, pendingRegistrations, reload: load };
}

function useWabroSetupData() {
  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [provision, setProvision] = React.useState<WabroProvisionPayload | null>(null);

  const createProvision = React.useCallback(async (deviceLabel: string) => {
    setIsCreating(true);
    setError(null);
    try {
      const response = await backendApi.post(ENDPOINTS.wabro.deviceProvision, {
        device_label: deviceLabel,
        platform: 'android',
      });
      setProvision(response.data || null);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { isCreating, error, provision, createProvision };
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">{label}</p>
      <strong className="mt-3 block text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">{value}</strong>
      <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{note}</p>
    </div>
  );
}

function CampaignCard({
  campaign,
  onStatusChange,
}: {
  campaign: WabroCampaign;
  onStatusChange?: (campaignId: string, status: string) => void;
}) {
  const processed = Number(campaign.sent_count || 0) + Number(campaign.failed_count || 0) + Number(campaign.skipped_count || 0);

  return (
    <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
            {campaign.status}
          </div>
          <h3 className="mt-3 text-[16px] font-semibold text-[var(--text-primary)]">{campaign.name}</h3>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
            {processed}/{formatNumber(campaign.total_contacts)} processed · Created {formatShortDate(campaign.created_at)}
          </p>
        </div>

        {onStatusChange ? (
          <div className="flex flex-wrap gap-2">
            {['running', 'paused', 'cancelled'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onStatusChange(campaign.id, status)}
                className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
              >
                {status}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Sent</p>
          <strong className="mt-2 block text-[18px] text-[var(--text-primary)]">{formatNumber(campaign.sent_count)}</strong>
        </div>
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Failed</p>
          <strong className="mt-2 block text-[18px] text-[var(--text-primary)]">{formatNumber(campaign.failed_count)}</strong>
        </div>
        <div className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Skipped</p>
          <strong className="mt-2 block text-[18px] text-[var(--text-primary)]">{formatNumber(campaign.skipped_count)}</strong>
        </div>
      </div>
    </div>
  );
}

export const WabroOverview: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const access = resolveWabroAccess(user);
  const { serviceState, error, stats, campaigns, lists, reload } = useWabroOverviewData();

  return (
    <WabroShell
      title="WaBro dashboard inside PropAI"
      subtitle="WaBro now runs directly inside the main PropAI app at /wabro/app. Use this surface for campaign operations, Android device setup, delivery visibility, and APK access while broker contacts keep auto-populating from Inbox DM tagging."
      serviceState={serviceState}
      error={error}
      onRetry={reload}
      actions={
        <>
          <a
            href="/wabro.apk"
            download
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90"
          >
            <SmartphoneIcon className="h-3.5 w-3.5" />
            Download APK
          </a>
          <Link
            to="/wabro/app/setup"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
          >
            <BookOpenIcon className="h-3.5 w-3.5" />
            Setup guide
          </Link>
          <Link
            to="/wabro/app/campaigns"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
          >
            Open campaigns
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </>
      }
    >
      <AccessGate access={access} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Campaigns" value={formatNumber(stats.total_campaigns)} note="Broadcast campaigns created in this workspace." />
        <StatCard label="Sent" value={formatNumber(stats.total_sent)} note="Messages marked sent across synced WaBro logs." />
        <StatCard label="Devices" value={`${formatNumber(stats.active_devices)} / ${formatNumber(stats.total_devices)}`} note="Active Android execution devices in the last 5 minutes." />
        <StatCard label="Broker Lists" value={formatNumber(lists.length)} note="Reusable contact lists for campaign launch. Tag DMs as Realtor from the Inbox to grow them automatically." />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <SurfaceSection
          title="Latest campaigns"
          subtitle="Recent delivery activity"
          icon={BroadcastIcon}
          actions={
            <button
              type="button"
              onClick={() => navigate('/wabro/app/campaigns')}
              className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            >
              Manage
            </button>
          }
        >
          <div className="space-y-3">
            {campaigns.length ? campaigns.slice(0, 4).map((campaign) => (
              <div key={campaign.id}>
                <CampaignCard campaign={campaign} />
              </div>
            )) : (
                  <div className="rounded-[16px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] p-5 text-[12px] text-[var(--text-secondary)]">
                    No campaigns yet. Tag DMs as Realtor in the Inbox to build broker contacts, or import a list from the campaigns route.
                  </div>
            )}
          </div>
        </SurfaceSection>

        <div className="space-y-4">
          <SurfaceSection title="Android execution" subtitle="Linked-device model" icon={SmartphoneIcon}>
            <div className="space-y-3 text-[12px] leading-6 text-[var(--text-secondary)]">
              <p>WaBro uses Android as the execution layer, while this dashboard handles orchestration through the shared PropAI deployment and monorepo backend.</p>
              <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Current device state</p>
                <p className="mt-2 text-[13px] font-semibold text-[var(--text-primary)]">
                  {stats.total_devices ? `${stats.active_devices} active / ${stats.total_devices} linked` : 'No device linked yet'}
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">Download the APK from the sidebar or this page, sign into the same PropAI account, and let the phone register against this workspace as the delivery device.</p>
              </div>
            </div>
          </SurfaceSection>

          <SurfaceSection title="Product boundary" subtitle="Keep WaBro separate" icon={CheckCircleIcon}>
            <div className="space-y-2 text-[12px] leading-6 text-[var(--text-secondary)]">
              <p>WaBro is the product surface for broker broadcast campaigns, APK download, Android execution, and send visibility.</p>
              <p>WhatsApp still owns QR, session health, inbox, parsing, and group sync. WaBro shares auth and deployment with PropAI, but its copy should stay focused on broadcasts and Android execution.</p>
            </div>
          </SurfaceSection>
        </div>
      </div>
    </WabroShell>
  );
};

export const WabroCampaigns: React.FC = () => {
  const { user } = useAuth();
  const access = resolveWabroAccess(user);
  const {
    serviceState,
    error,
    campaigns,
    lists,
    isSavingList,
    isSavingCampaign,
    addContacts,
    createCampaign,
    updateCampaignStatus,
    reload,
  } = useWabroCampaignData();
  const [listName, setListName] = React.useState('');
  const [bulkContacts, setBulkContacts] = React.useState('');
  const [listStatus, setListStatus] = React.useState<string | null>(null);
  const [campaignName, setCampaignName] = React.useState('');
  const [selectedList, setSelectedList] = React.useState('');
  const [messageTemplate, setMessageTemplate] = React.useState('');
  const [campaignStatus, setCampaignStatus] = React.useState<string | null>(null);

  const handleSaveList = async () => {
    const contacts = parseBulkContacts(bulkContacts);
    if (!listName.trim() || !contacts.length) {
      setListStatus('Enter a list name and at least one valid contact row.');
      return;
    }

    try {
      await addContacts({ list_name: listName.trim(), contacts });
      setListStatus(`${contacts.length} brokers imported into ${listName.trim()}.`);
      setBulkContacts('');
      setListName('');
    } catch {
      setListStatus('Could not save broker list right now.');
    }
  };

  const handleCreateCampaign = async () => {
    if (!campaignName.trim() || !selectedList || !messageTemplate.trim()) {
      setCampaignStatus('Provide a campaign name, broker list, and message template.');
      return;
    }

    try {
      await createCampaign({
        name: campaignName.trim(),
        listName: selectedList,
        message_template: messageTemplate.trim(),
      });
      setCampaignStatus(`Campaign "${campaignName.trim()}" created.`);
      setCampaignName('');
      setSelectedList('');
      setMessageTemplate('');
    } catch {
      setCampaignStatus('Could not create the campaign right now.');
    }
  };

  return (
    <WabroShell
      title="Campaign operations"
      subtitle="Manage reusable broker lists, create campaign payloads on web, and push execution through linked Android devices. Broker contacts auto-fill from Inbox DM tagging — no manual import needed."
      serviceState={serviceState}
      error={error}
      onRetry={reload}
      actions={
        <a
          href="/wabro.apk"
          download
          className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90"
        >
          <SmartphoneIcon className="h-3.5 w-3.5" />
          Download APK
        </a>
      }
    >
      <AccessGate access={access} body="Campaign creation, broker list management (auto-populated from Inbox DM tagging), and Android execution are all part of the WaBro paid product surface." />

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <SurfaceSection title="Broker lists" subtitle="Import outreach targets or auto-populate from Inbox DM tagging" icon={GroupsIcon}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">List name</label>
              <input
                value={listName}
                onChange={(event) => setListName(event.target.value)}
                placeholder="Mumbai brokers · West zone"
                className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Bulk contacts</label>
              <textarea
                value={bulkContacts}
                onChange={(event) => setBulkContacts(event.target.value)}
                rows={7}
                placeholder={'Rohan Mehta,+919819000111,Andheri West\nAarti Shah,+919819000222,Thane'}
                className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
              />
              <p className="text-[11px] text-[var(--text-secondary)]">Format: <code>name, phone, locality</code></p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveList}
                disabled={isSavingList || !access.hasAccess}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SaveIcon className="h-3.5 w-3.5" />
                {isSavingList ? 'Saving…' : 'Save list'}
              </button>
              {listStatus ? <span className="text-[11px] text-[var(--text-secondary)]">{listStatus}</span> : null}
            </div>

            <div className="space-y-2">
              {lists.length ? lists.map((list) => (
                <div key={list.name} className="flex items-center justify-between rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">{list.name}</p>
                    <p className="text-[11px] text-[var(--text-secondary)]">{formatNumber(list.count)} brokers</p>
                  </div>
                </div>
              )) : (
                <div className="rounded-[14px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 text-[12px] text-[var(--text-secondary)]">
                  No broker lists yet.
                </div>
              )}
            </div>
          </div>
        </SurfaceSection>

        <SurfaceSection title="Create campaign" subtitle="Prepare delivery payloads" icon={BroadcastIcon}>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Campaign name</label>
                <input
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="June broker blast"
                  className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Broker list</label>
                <select
                  value={selectedList}
                  onChange={(event) => setSelectedList(event.target.value)}
                  className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
                >
                  <option value="">Choose broker list</option>
                  {lists.map((list) => (
                    <option key={list.name} value={list.name}>
                      {list.name} · {list.count} brokers
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Message template</label>
              <textarea
                value={messageTemplate}
                onChange={(event) => setMessageTemplate(event.target.value)}
                rows={6}
                placeholder="Hi {{name}}, sharing a fresh property update for your buyers..."
                className="w-full rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCreateCampaign}
                disabled={isSavingCampaign || !access.hasAccess}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BroadcastIcon className="h-3.5 w-3.5" />
                {isSavingCampaign ? 'Creating…' : 'Create campaign'}
              </button>
              {campaignStatus ? <span className="text-[11px] text-[var(--text-secondary)]">{campaignStatus}</span> : null}
            </div>

            <div className="space-y-3">
              {campaigns.length ? campaigns.map((campaign) => (
                <div key={campaign.id}>
                  <CampaignCard campaign={campaign} onStatusChange={access.hasAccess ? updateCampaignStatus : undefined} />
                </div>
              )) : (
                <div className="rounded-[14px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 text-[12px] text-[var(--text-secondary)]">
                  No campaigns created yet.
                </div>
              )}
            </div>
          </div>
        </SurfaceSection>
      </div>
    </WabroShell>
  );
};

export const WabroDevices: React.FC = () => {
  const { user } = useAuth();
  const access = resolveWabroAccess(user);
  const { serviceState, error, stats, campaigns, devices, pendingRegistrations, reload } = useWabroDeviceData();
  const runningCampaigns = campaigns.filter((campaign) => ['running', 'pending', 'paused'].includes(String(campaign.status || '').toLowerCase()));

  return (
    <WabroShell
      title="Android execution devices"
      subtitle="WaBro uses Android as the delivery layer. This page is the product-specific device surface, not the general WhatsApp QR/session screen."
      serviceState={serviceState}
      error={error}
      onRetry={reload}
      actions={
        <Link
          to="/wabro/app/setup"
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          Android setup
        </Link>
      }
    >
      <AccessGate access={access} body="Linked execution devices and live delivery state belong to the WaBro paid surface." />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active devices" value={formatNumber(stats.active_devices)} note="Polled in the last 5 minutes." />
        <StatCard label="Linked devices" value={formatNumber(stats.total_devices)} note="Registered against the current workspace." />
        <StatCard label="Open campaigns" value={formatNumber(runningCampaigns.length)} note="Campaigns still waiting on Android execution or completion." />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <SurfaceSection title="Execution model" subtitle="What belongs here" icon={SmartphoneIcon}>
          <div className="space-y-3 text-[12px] leading-6 text-[var(--text-secondary)]">
            <p>WaBro devices do one job: execute campaign sends from Android.</p>
            <p>They do not replace the PropAI WhatsApp connection screens. QR pairing, live session state, and chat sync still belong to the main WhatsApp surface.</p>
            <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Current workspace</p>
              <p className="mt-2 text-[13px] font-semibold text-[var(--text-primary)]">
                {stats.total_devices ? `${stats.total_devices} linked device${stats.total_devices === 1 ? '' : 's'}` : 'No device linked yet'}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                Install the APK, sign into the same PropAI account, and let the device heartbeat against the WaBro backend.
              </p>
            </div>
          </div>
        </SurfaceSection>

        <SurfaceSection title="Operations notes" subtitle="Current backend scope" icon={AlertTriangleIcon}>
          <div className="space-y-3 text-[12px] leading-6 text-[var(--text-secondary)]">
            <p>WaBro devices are now provisioned explicitly from PropAI before Android starts polling.</p>
            <p>The Android app should only call the tokenized device routes and must never spin up its own linked-device or Baileys session.</p>
            <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Later backend work</p>
              <ul className="mt-2 space-y-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                <li>Revocation actions for compromised device tokens</li>
                <li>Crash/report visibility in UI</li>
                <li>APK self-update prompts from app-version</li>
              </ul>
            </div>
          </div>
        </SurfaceSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SurfaceSection title="Linked devices" subtitle="Claimed Android executors" icon={SmartphoneIcon}>
          <div className="space-y-3">
            {devices.length ? devices.map((device) => (
              <div key={device.device_id} className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">{device.display_name}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{device.device_model || device.device_id}</p>
                  </div>
                  <div className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                    {device.registration_status || 'claimed'}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 text-[11px] text-[var(--text-secondary)]">
                  <p>Platform: {device.platform || 'android'}</p>
                  <p>App version: {device.app_version || 'unknown'}</p>
                  <p>Last poll: {formatDateTime(device.last_poll_at)}</p>
                  <p>Last sync: {formatDateTime(device.last_sync_at)}</p>
                </div>
              </div>
            )) : (
              <div className="rounded-[14px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 text-[12px] text-[var(--text-secondary)]">
                No Android device has claimed this workspace yet.
              </div>
            )}
          </div>
        </SurfaceSection>

        <SurfaceSection title="Pending provisions" subtitle="Tokens created but not claimed" icon={SettingsIcon}>
          <div className="space-y-3">
            {pendingRegistrations.length ? pendingRegistrations.map((registration) => (
              <div key={registration.id} className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{registration.device_label}</p>
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Status: {registration.status}</p>
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Expires: {formatShortDate(registration.expires_at)}</p>
              </div>
            )) : (
              <div className="rounded-[14px] border border-dashed border-[color:var(--border)] bg-[var(--bg-elevated)] p-4 text-[12px] text-[var(--text-secondary)]">
                No pending device provisions.
              </div>
            )}
          </div>
        </SurfaceSection>
      </div>
    </WabroShell>
  );
};

export const WabroSetup: React.FC = () => {
  const { user } = useAuth();
  const access = resolveWabroAccess(user);
  const [deviceLabel, setDeviceLabel] = React.useState('Primary Android');
  const { isCreating, error, provision, createProvision } = useWabroSetupData();

  return (
    <WabroShell
      title="WaBro Android setup inside PropAI"
      subtitle="Set up the Android delivery flow that powers WaBro inside the main PropAI app. Open WaBro from the dashboard, download the APK, sign in with the same PropAI account, and keep the instructions focused on broadcast execution rather than general WhatsApp connection workflows."
      serviceState="ready"
      error={null}
      actions={
        <a
          href="/wabro.apk"
          download
          className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90"
        >
          <SmartphoneIcon className="h-3.5 w-3.5" />
          Download APK
        </a>
      }
    >
      <AccessGate
        access={access}
        title="Prepare WaBro setup"
        body="You can review the setup flow before access is enabled, but Android execution and campaign launch should remain locked until WaBro is explicitly turned on for this PropAI workspace."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ['1. Open WaBro inside PropAI', 'Start from /wabro/app so you are inside the live WaBro dashboard, using the shared PropAI login and the current workspace before touching the Android phone.'],
          ['2. Download and install the APK', 'Use the Download APK action here or the sidebar shortcut on the phone that will execute campaign delivery.'],
          ['3. Sign in with the same account', 'Use the same PropAI identity so the Android device registers against this WaBro workspace without a separate auth flow.'],
          ['4. Build broker contacts', 'Tag incoming DMs as Realtor from the Inbox so broker contacts auto-populate with phone and locality, or import a list manually from the campaigns page.'],
          ['5. Create the campaign on web', 'Write the message template and choose the target list inside PropAI → WaBro.'],
          ['6. Let Android execute', 'The Android app pulls pending campaigns from the shared `/api/wabro` backend and handles delivery from the linked device.'],
          ['7. Monitor results on web', 'Track sent, failed, skipped, and active-device state from the WaBro pages in PropAI.'],
        ].map(([title, body]) => (
          <div key={title} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">{title}</p>
            <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">{body}</p>
          </div>
        ))}
      </div>

      <SurfaceSection title="Provision Android device" subtitle="Create the token Android should use" icon={SaveIcon}>
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <label className="block text-[11px] font-semibold text-[var(--text-primary)]" htmlFor="wabro-device-label">
              Device label
            </label>
            <input
              id="wabro-device-label"
              value={deviceLabel}
              onChange={(event) => setDeviceLabel(event.target.value)}
              className="mt-3 w-full rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-border)]"
              placeholder="Primary Android"
            />
            <button
              type="button"
              onClick={() => createProvision(deviceLabel.trim() || 'Primary Android')}
              disabled={isCreating}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <SaveIcon className="h-3.5 w-3.5" />
              {isCreating ? 'Creating…' : 'Create provision token'}
            </button>
            {error ? <p className="mt-3 text-[11px] text-[var(--amber)]">{error}</p> : null}
          </div>

          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Android handoff</p>
            {provision ? (
              <>
                <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                  Use this token inside the Android app. It should be sent on every device route call and must never be reused by a second phone.
                </p>
                <div className="mt-4 rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Provision token</p>
                  <code className="mt-2 block break-all text-[12px] text-[var(--text-primary)]">{provision.token}</code>
                </div>
                <p className="mt-3 text-[11px] text-[var(--text-secondary)]">
                  Registration: {provision.registration.device_label} · expires {formatShortDate(provision.registration.expires_at)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">
                Generate a token here, then configure the Android package to call the public WaBro device endpoints instead of the old standalone WaBro backend or any Baileys session flow.
              </p>
            )}
          </div>
        </div>
      </SurfaceSection>

      <SurfaceSection title="Copy guardrails" subtitle="Keep WaBro distinct from WhatsApp" icon={BookOpenIcon}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[11px] font-semibold text-[var(--text-primary)]">Avoid on WaBro pages</p>
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-[var(--text-secondary)]">
              <li>QR pairing</li>
              <li>Baileys terminology</li>
              <li>Inbox / chat sync language</li>
              <li>Group parsing workflows</li>
            </ul>
          </div>
          <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[11px] font-semibold text-[var(--text-primary)]">Use instead</p>
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-[var(--text-secondary)]">
              <li>Broadcast campaigns</li>
              <li>Linked Android device</li>
              <li>Execution layer</li>
              <li>Broker lists and campaign delivery</li>
            </ul>
          </div>
        </div>
      </SurfaceSection>
    </WabroShell>
  );
};

export const WabroBilling: React.FC = () => {
  const { user } = useAuth();
  const access = resolveWabroAccess(user);
  const normalizedPlan = String(user?.subscription?.plan || 'Trial');

  return (
    <WabroShell
      title="WaBro plan and access"
      subtitle="Treat WaBro as its own paid product even when it lives inside the PropAI shell. Broker contacts auto-populate from Inbox DM tagging — tag a DM as Realtor and it feeds your broadcast lists."
      serviceState="ready"
      error={null}
      actions={
        <a
          href={PROPAI_ASSISTANT_WA_LINK}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90"
        >
          <CreditCardIcon className="h-3.5 w-3.5" />
          Request WaBro
        </a>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(17,24,32,0.98),rgba(13,17,23,0.98))] p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
            <CreditCardIcon className="h-3.5 w-3.5" />
            WaBro yearly plan
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <strong className="block text-[38px] font-bold tracking-[-0.04em] text-[var(--text-primary)]">{WABRO_PRICE}</strong>
              <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
                Separate paid access for broker broadcast campaigns, Android execution, APK distribution, and campaign operations.
              </p>
            </div>
            <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Current PropAI workspace plan</p>
              <p className="mt-2 text-[16px] font-semibold text-[var(--text-primary)]">{normalizedPlan}</p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {access.hasAccess ? 'WaBro access is currently open for this account.' : 'WaBro access still needs explicit enablement.'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">What is included</p>
          <ul className="mt-4 space-y-3 text-[12px] leading-6 text-[var(--text-secondary)]">
            <li>APK download and Android execution model</li>
            <li>Campaign creation and broker list management (auto-populated from Inbox DM tagging)</li>
            <li>Device status and send outcome visibility</li>
            <li>Separate product boundary from QR, inbox, and chat sync surfaces</li>
          </ul>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href={PROPAI_ASSISTANT_WA_LINK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90"
            >
              Ask for WaBro access
            </a>
            <Link
              to="/wabro/app/setup"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            >
              Review setup
            </Link>
          </div>
        </div>
      </div>
    </WabroShell>
  );
};
