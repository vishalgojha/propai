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

type ServiceState = 'idle' | 'loading' | 'ready' | 'degraded';

type AccessState = {
  hasAccess: boolean;
  reason: 'owner' | 'request-access';
};

const WABRO_PRICE = 'Rs 499/year';

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

  if (isOwner) {
    return { hasAccess: true, reason: 'owner' };
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
        WaBro backend is live. This route is using the same PropAI session and the shared `/api/wabro` backend surface.
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
            {body || 'WaBro is a separate broadcast product for broker campaigns. The route is live inside PropAI, but campaign execution should stay locked until WaBro access is explicitly enabled for the workspace.'}
          </p>
        </div>

        <div className="min-w-[220px] rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Plan</p>
          <strong className="mt-2 block text-[24px] font-bold text-[var(--text-primary)]">{WABRO_PRICE}</strong>
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
              {['Separate paid product', 'Android execution', 'Broker broadcasts'].map((pill) => (
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

  const load = React.useCallback(async () => {
    setServiceState('loading');
    setError(null);
    try {
      const response = await backendApi.get(ENDPOINTS.wabro.dashboardStats);
      setStats(response.data?.stats || EMPTY_STATS);
      setCampaigns(Array.isArray(response.data?.campaigns) ? response.data.campaigns : []);
      setServiceState('ready');
    } catch (err) {
      setError(handleApiError(err));
      setServiceState('degraded');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { serviceState, error, stats, campaigns, reload: load };
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
      title="Dedicated broadcast campaigns for broker outreach"
      subtitle="WaBro runs inside PropAI as its own product surface. Broker contacts auto-populate from Inbox DM tagging — tag a direct message as Realtor and it feeds your broadcast lists. Use this route for APK access, setup, campaigns, devices, and a separate access boundary."
      serviceState={serviceState}
      error={error}
      onRetry={reload}
      actions={
        <>
          <Link
            to="/wabro/app/setup"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
          >
            <BookOpenIcon className="h-3.5 w-3.5" />
            Setup
          </Link>
          <Link
            to="/wabro/app/campaigns"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#020f07] transition-opacity hover:opacity-90"
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
              <p>WaBro uses Android as the execution layer. The web app is for orchestration, not QR pairing or chat parsing.</p>
              <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Current device state</p>
                <p className="mt-2 text-[13px] font-semibold text-[var(--text-primary)]">
                  {stats.total_devices ? `${stats.active_devices} active / ${stats.total_devices} linked` : 'No device linked yet'}
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">Open the WaBro Android app, sign into the same account, and let it register as the delivery device.</p>
              </div>
            </div>
          </SurfaceSection>

          <SurfaceSection title="Product boundary" subtitle="Keep WaBro separate" icon={CheckCircleIcon}>
            <div className="space-y-2 text-[12px] leading-6 text-[var(--text-secondary)]">
              <p>WaBro is for broker broadcast campaigns, APK download, Android execution, and send visibility.</p>
              <p>WhatsApp stays responsible for QR, session health, inbox, parsing, and group sync. Do not merge those surfaces in copy or onboarding.</p>
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
          href="https://wabro.propai.live/WaBro.apk"
          target="_blank"
          rel="noreferrer"
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
  const { serviceState, error, stats, campaigns, reload } = useWabroDeviceData();
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
            <p>The current `/api/wabro` backend exposes aggregate device counts through dashboard stats, not a full per-device card model yet.</p>
            <p>That means this page can show whether the execution fleet is alive, but detailed Android metadata should be added later when the backend contract grows.</p>
            <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Later backend work</p>
              <ul className="mt-2 space-y-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                <li>Per-device status cards</li>
                <li>Crash/report visibility in UI</li>
                <li>Last sync and app version snapshots</li>
              </ul>
            </div>
          </div>
        </SurfaceSection>
      </div>
    </WabroShell>
  );
};

export const WabroSetup: React.FC = () => {
  const { user } = useAuth();
  const access = resolveWabroAccess(user);

  return (
    <WabroShell
      title="Android setup"
      subtitle="Set up WaBro as a broadcast delivery product. Broker contacts grow automatically when you tag DMs as Realtor from the Inbox. Keep the instructions limited to Android execution and campaign launch, not general WhatsApp connection workflows."
      serviceState="ready"
      error={null}
      actions={
        <a
          href="https://wabro.propai.live/WaBro.apk"
          target="_blank"
          rel="noreferrer"
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
        body="You can review the setup flow before access is enabled, but Android execution and campaign launch should remain locked until WaBro is explicitly turned on."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ['1. Install the Android app', 'Download the WaBro APK on the phone that will execute campaign delivery.'],
          ['2. Sign in with the same account', 'Use the same PropAI identity so the Android device registers against the same WaBro workspace.'],
          ['3. Build broker contacts', 'Tag incoming DMs as Realtor from the Inbox — they auto-populate as broker contacts with phone and locality. Or import lists manually via CSV in the campaigns route.'],
          ['4. Create the campaign on web', 'Write the message template and choose the target list inside PropAI → WaBro.'],
          ['5. Let Android execute', 'The Android app pulls pending campaigns and handles delivery execution from the linked device.'],
          ['6. Monitor results on web', 'Track sent, failed, skipped, and active-device state from the WaBro pages in PropAI.'],
        ].map(([title, body]) => (
          <div key={title} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">{title}</p>
            <p className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">{body}</p>
          </div>
        ))}
      </div>

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
