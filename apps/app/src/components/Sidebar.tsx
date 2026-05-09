import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../lib/utils';
import {
  ActivityIcon,
  ShieldIcon,
  BookOpenIcon,
  ChannelIcon,
  CreditCardIcon,
  ChevronLeftIcon,
  DashboardIcon,
  EyeIcon,
  GroupsIcon,
  LogoutIcon,
  MessageSquareTextIcon,
  ChevronRightIcon,
  RefreshIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  StreamIcon,
  WorkflowIcon,
  XIcon,
} from '../lib/icons';
import { useAuth } from '../context/AuthContext';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import {
  createChannel,
  fetchChannels,
  type PersonalChannel,
} from '../services/channelApi';
import { handleApiError } from '../services/api';
import { SidebarCard } from './ui/SidebarCard';

const NAV_ITEMS = [
  { label: 'AI Agent', path: '/agent', icon: ActivityIcon },
  // Move Intelligence below AI Agent but above Admin by placing it after Team
  { label: 'Monitor', path: '/monitor', icon: EyeIcon },
  { label: 'Inbox', path: '/inbox', icon: MessageSquareTextIcon },
  { label: 'Stream', path: '/stream', icon: StreamIcon },
  { label: 'Dashboard', path: '/dashboard', icon: DashboardIcon },
  { label: 'WhatsApp', path: '/whatsapp', icon: GroupsIcon },
  { label: 'History Sync', path: '/history-sync', icon: RefreshIcon },
  { label: 'Wabro', path: '/wabro', icon: GroupsIcon },
  { label: 'Team', path: '/team', icon: ShieldIcon },
  { label: 'Intelligence', path: '/intelligence', icon: StreamIcon },
  { label: 'Admin', path: '/admin', icon: ShieldIcon },
  { label: 'Pricing', path: '/pricing', icon: CreditCardIcon },
  { label: 'Docs', path: '/docs', icon: BookOpenIcon },
  { label: 'Settings', path: '/settings', icon: SettingsIcon },
] as const;

const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
]);

const AI_MODEL_PRICING = {
  'gemini-2.5-flash': {
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    inputRate: 0.3,
    outputRate: 2.5,
    note: 'Based on paid-tier text pricing per 1M tokens.',
  },
  groq: {
    label: 'Groq',
    provider: 'Groq',
    inputRate: 0.05,
    outputRate: 0.08,
    note: 'Uses the low-latency 8B Groq baseline as the default estimate.',
  },
  openrouter: {
    label: 'GPT-4o Mini',
    provider: 'OpenRouter',
    inputRate: 0.15,
    outputRate: 0.6,
    note: 'Uses the OpenRouter GPT-4o Mini rate card by default.',
  },
  doubleword: {
    label: 'Qwen3 235B',
    provider: 'Doubleword',
    inputRate: 0.1,
    outputRate: 0.4,
    note: 'Uses the current Doubleword realtime Qwen3 235B estimate.',
  },
} as const;

const DEFAULT_AI_MODEL_KEY = 'gemini-2.5-flash';

function normalizeAiModelKey(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return DEFAULT_AI_MODEL_KEY;
  if (normalized === 'gemini' || normalized === 'google' || normalized === 'models/gemini-2.5-flash') {
    return DEFAULT_AI_MODEL_KEY;
  }
  if (normalized in AI_MODEL_PRICING) {
    return normalized as keyof typeof AI_MODEL_PRICING;
  }
  return DEFAULT_AI_MODEL_KEY;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

const splitValues = (value: string) =>
  value
    .split(',')
    .flatMap((cPart) => cPart.split(';').flatMap((sPart) => sPart.split('\n')))
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalize = (value: string) =>
  value.toLowerCase().split('').map(c => ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) ? c : ' ').join('').split(' ').filter(Boolean).join(' ');

const toSlug = (value: string) =>
  value.toLowerCase().split('').map(c => ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) ? c : ' ').join('').split(' ').filter(Boolean).join('-');

const matchesChannelQuery = (channel: PersonalChannel, query: string) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  const searchable = [
    channel.slug,
    channel.name,
    ...channel.localities,
    ...channel.keywords,
    ...channel.recordTypes,
    ...channel.dealTypes,
  ]
    .map(normalize)
    .join(' ');

  return searchable.includes(normalizedQuery);
};

const getInitial = (email?: string | null) => (email ? email.trim().charAt(0).toUpperCase() || 'P' : 'P');

const formatShortDate = (value?: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(value));
};

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  whatsappStatus: {
    status: 'connected' | 'connecting' | 'disconnected';
    connectedPhoneNumber?: string | null;
    connectedOwnerName?: string | null;
    activeCount: number;
    selectedSessionLabel?: string | null;
  };
};

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, isCollapsed, onToggleCollapsed, whatsappStatus }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const selectedChannelId = searchParams.get('channel');
  const [channels, setChannels] = React.useState<PersonalChannel[]>([]);
  const [channelSearch, setChannelSearch] = React.useState('');
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [channelName, setChannelName] = React.useState('');
  const [localitiesText, setLocalitiesText] = React.useState('');
  const [keywordsText, setKeywordsText] = React.useState('');
  const [isChannelsLoading, setIsChannelsLoading] = React.useState(false);
  const [usageModelKey, setUsageModelKey] = React.useState<keyof typeof AI_MODEL_PRICING>(DEFAULT_AI_MODEL_KEY);
  const [usageCalculator, setUsageCalculator] = React.useState({
    inputTokens: '1500',
    outputTokens: '600',
    requestsPerDay: '40',
    inputRate: String(AI_MODEL_PRICING[DEFAULT_AI_MODEL_KEY].inputRate),
    outputRate: String(AI_MODEL_PRICING[DEFAULT_AI_MODEL_KEY].outputRate),
  });

  const isSuperAdmin =
    user?.appRole === 'super_admin' ||
    OWNER_SUPER_ADMIN_EMAILS.has(String(user?.email || '').trim().toLowerCase());

  React.useEffect(() => {
    let mounted = true;

    const loadChannels = async () => {
      setIsChannelsLoading(true);
      try {
        const nextChannels = await fetchChannels();
        if (!mounted) return;
        setChannels(nextChannels);
      } catch (err) {
        if (!mounted) return;
        console.error(handleApiError(err));
        setChannels([]);
      } finally {
        if (mounted) {
          setIsChannelsLoading(false);
        }
      }
    };

    const handleRefresh = () => {
      void loadChannels();
    };

    const handleCreated = (event: Event) => {
      const detail = (event as CustomEvent<PersonalChannel | { id?: string; name?: string }>).detail;
      if (!detail?.id) {
        void loadChannels();
        return;
      }

      setChannels((current) => {
        if (current.some((channel) => channel.id === detail.id)) {
          return current;
        }

        const optimisticChannel: PersonalChannel = {
          id: detail.id,
          name: detail.name || 'New channel',
          slug: toSlug(detail.name || 'new channel'),
          channelType: 'mixed',
          localities: [],
          keywords: [],
          keywordsExclude: [],
          dealTypes: [],
          recordTypes: [],
          bhkValues: [],
          assetClasses: [],
          budgetMin: null,
          budgetMax: null,
          confidenceMin: 0,
          pinned: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unreadCount: 0,
          itemCount: 0,
        };

        return [optimisticChannel, ...current];
      });

      void loadChannels();
    };

    void loadChannels();
    window.addEventListener('channels:refresh', handleRefresh);
    window.addEventListener('channels:created', handleCreated as EventListener);
    const interval = window.setInterval(handleRefresh, 12000);

    return () => {
      mounted = false;
      window.removeEventListener('channels:refresh', handleRefresh);
      window.removeEventListener('channels:created', handleCreated as EventListener);
      window.clearInterval(interval);
    };
  }, [user?.email]);

  React.useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;

    const loadUsageModel = async () => {
      try {
        const response = await backendApi.get(ENDPOINTS.settings.get);
        if (cancelled) return;
        const nextKey = normalizeAiModelKey(response.data?.settings?.defaultModel);
        const nextPricing = AI_MODEL_PRICING[nextKey];
        setUsageModelKey(nextKey);
        setUsageCalculator((current) => ({
          ...current,
          inputRate: String(nextPricing.inputRate),
          outputRate: String(nextPricing.outputRate),
        }));
      } catch {
        if (cancelled) return;
        const fallbackKey = DEFAULT_AI_MODEL_KEY;
        const fallbackPricing = AI_MODEL_PRICING[fallbackKey];
        setUsageModelKey(fallbackKey);
        setUsageCalculator((current) => ({
          ...current,
          inputRate: String(fallbackPricing.inputRate),
          outputRate: String(fallbackPricing.outputRate),
        }));
      }
    };

    void loadUsageModel();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  const activeChannel = React.useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) || null,
    [channels, selectedChannelId],
  );
  const subscription = user?.subscription;
  const trialDays = subscription?.trial_days_remaining;
  const isTrial = subscription?.status === 'trial' || subscription?.status === 'trialing' || subscription?.plan === 'Free';

  const visibleChannels = React.useMemo(() => {
    const filtered = channels.filter((channel) => matchesChannelQuery(channel, channelSearch));
    return [...filtered].sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }

      if (left.unreadCount !== right.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }

      if (left.itemCount !== right.itemCount) {
        return right.itemCount - left.itemCount;
      }

      return left.name.localeCompare(right.name);
    });
  }, [channels, channelSearch]);

  const navItems = React.useMemo(() => {
    if (!isSuperAdmin) {
      return NAV_ITEMS;
    }

    return [
      ...NAV_ITEMS.slice(0, 8),
      { label: 'Admin', path: '/admin', icon: ShieldIcon },
      ...NAV_ITEMS.slice(8),
    ] as const;
  }, [isSuperAdmin]);

  const usagePricing = AI_MODEL_PRICING[usageModelKey];
  const usageInputTokens = Math.max(0, Number(usageCalculator.inputTokens) || 0);
  const usageOutputTokens = Math.max(0, Number(usageCalculator.outputTokens) || 0);
  const usageRequestsPerDay = Math.max(0, Number(usageCalculator.requestsPerDay) || 0);
  const usageInputRate = Math.max(0, Number(usageCalculator.inputRate) || 0);
  const usageOutputRate = Math.max(0, Number(usageCalculator.outputRate) || 0);
  const usageCostPerRequest =
    (usageInputTokens / 1_000_000) * usageInputRate +
    (usageOutputTokens / 1_000_000) * usageOutputRate;
  const usageDailyCost = usageCostPerRequest * usageRequestsPerDay;
  const usageMonthlyCost = usageDailyCost * 30;
  const usageMonthlyInputTokens = usageInputTokens * usageRequestsPerDay * 30;
  const usageMonthlyOutputTokens = usageOutputTokens * usageRequestsPerDay * 30;

  const uplinkLabel =
    whatsappStatus.status === 'connected'
      ? 'Uplink active'
      : whatsappStatus.status === 'connecting'
        ? 'Uplink connecting'
        : 'Uplink offline';
  const uplinkBarClassName =
    whatsappStatus.status === 'connected'
      ? 'bg-[var(--accent)]'
      : whatsappStatus.status === 'connecting'
        ? 'bg-[var(--amber)]'
        : 'bg-[var(--red)]';
  const uplinkTextClassName =
    whatsappStatus.status === 'connected'
      ? 'text-[var(--accent)]'
      : whatsappStatus.status === 'connecting'
        ? 'text-[var(--amber)]'
        : 'text-[var(--red)]';

  const goTo = (path: string) => {
    navigate(path);
    onClose();
  };

  const openChannel = (channel: PersonalChannel) => {
    navigate(`/stream?channel=${channel.id}&channelName=${encodeURIComponent(channel.name)}`);
    onClose();
  };

  const handleCreateChannel = async () => {
    const trimmedName = channelName.trim();
    const localities = splitValues(localitiesText);
    const keywords = splitValues(keywordsText);

    if (!trimmedName && localities.length === 0 && keywords.length === 0) {
      return;
    }

    try {
      const baseName = trimmedName || localities[0] || keywords[0] || 'new channel';
      const nextChannel = await createChannel({
        name: baseName,
        localities,
        keywords,
        pinned: true,
      });

      setChannels((current) => {
        const next = [nextChannel, ...current.filter((channel) => channel.id !== nextChannel.id)];
        return next;
      });
      setIsCreateOpen(false);
      setChannelName('');
      setLocalitiesText('');
      setKeywordsText('');
      window.dispatchEvent(new Event('channels:refresh'));
      navigate(`/stream?channel=${nextChannel.id}&channelName=${encodeURIComponent(nextChannel.name)}`);
      onClose();
    } catch (err) {
      console.error(handleApiError(err));
    }
  };

  const showLogout = () => {
    logout();
    navigate('/login');
    onClose();
  };

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[min(88vw,320px)] max-w-[320px] flex-col border-r-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.4)] transition-[transform,width] duration-200 ease-out lg:static lg:z-auto lg:h-screen lg:max-w-none lg:translate-x-0 lg:shadow-none',
        isCollapsed ? 'lg:w-[72px]' : 'lg:w-[260px]',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="border-b-[0.5px] border-[color:var(--border)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border-[0.5px] border-[color:var(--accent-border)] bg-[var(--accent-dim)] shadow-[0_0_0_1px_rgba(37,211,102,0.04)]">
              <WorkflowIcon className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div className={cn('min-w-0', isCollapsed && 'lg:hidden')}>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">PropAI Pulse</p>
              <p className="truncate text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">AI-routed broker channels</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] lg:inline-flex"
              aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-pressed={isCollapsed}
            >
              <ChevronLeftIcon className={cn('h-4 w-4 transition-transform', isCollapsed && 'rotate-180')} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] lg:hidden"
              aria-label="Close navigation"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="pulse-scrollbar min-h-0 flex-1 overflow-y-auto">
          <nav className="border-b-[0.5px] border-[color:var(--border)] px-3 py-3">
            <div className="space-y-1">
              {navItems.map((item) => {
                const isActive =
                  location.pathname === item.path ||
                  (item.path === '/dashboard' && location.pathname === '/app/dashboard');
                const Icon = item.icon;

                return (
                  <button
                    key={item.path}
                    onClick={() => goTo(item.path)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[8px] border-l-[3px] px-3 py-2.5 text-left transition-colors',
                      isCollapsed && 'lg:justify-center lg:px-2',
                      isActive
                        ? 'border-[color:var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]'
                        : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                    )}
                    title={item.label}
                    aria-label={item.label}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]')} />
                    <span className={cn('text-[12px] font-semibold tracking-[0.01em]', isCollapsed && 'lg:hidden')}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className={cn('flex min-h-0 flex-1 flex-col px-3 py-3', isCollapsed && 'lg:hidden')}>
            <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--text-secondary)]">Channels</p>
            <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Personal views from Stream.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              console.log('Add channel clicked');
              setIsCreateOpen(true);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            title="Create channel"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

            <div className="relative mt-3">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={channelSearch}
                onChange={(event) => setChannelSearch(event.target.value)}
                placeholder="search stream..."
                className="w-full rounded-[6px] border border-[color:var(--border)] bg-[var(--bg-elevated)] py-2 pl-9 pr-3 text-[10px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
              />
            </div>

            <div className="pulse-scrollbar mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 pb-3">
              {visibleChannels.length === 0 ? (
                <SidebarCard className="p-3 text-[11px] leading-5 text-[var(--text-secondary)]">
                  {isChannelsLoading ? 'Loading your channels...' : 'No channels match that search. Create one from a locality or keyword.'}
                </SidebarCard>
              ) : (
                visibleChannels.map((channel) => {
                  const isActive = activeChannel?.id === channel.id;
                  const count = channel.unreadCount;

                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => openChannel(channel)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-[8px] border-l-[3px] px-3 py-2 text-left transition-colors',
                        isActive
                          ? 'border-[color:var(--accent)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
                          : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      <ChannelIcon className={cn('h-3 w-3 shrink-0', isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]')} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-medium">{channel.name}</span>
                          {channel.pinned ? <PinIcon className="h-3 w-3 shrink-0 text-[var(--accent)]" /> : null}
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-[var(--text-secondary)]">
                          {channel.localities.slice(0, 2).join(' / ') || channel.keywords.slice(0, 2).join(' / ') || 'keyword filter'}
                        </p>
                      </div>
                      {count > 0 ? (
                        <span className="ml-1 inline-flex min-w-6 justify-center rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                          {count}
                        </span>
                      ) : null}
                      {isActive ? <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--accent)]" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className={cn('shrink-0 space-y-3 border-t-[0.5px] border-[color:var(--border)] px-3 py-3', isCollapsed && 'lg:hidden')}>
          {isSuperAdmin ? (
            <SidebarCard className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">AI usage</p>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{usagePricing.label}</p>
                  <p className="text-[10px] text-[var(--text-secondary)]">{usagePricing.provider} model from workspace settings</p>
                </div>
                <div className="rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
                  Admin
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">In tokens</span>
                  <input
                    value={usageCalculator.inputTokens}
                    onChange={(event) => setUsageCalculator((current) => ({ ...current, inputTokens: event.target.value }))}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                  />
                </label>
                <label className="block">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Out tokens</span>
                  <input
                    value={usageCalculator.outputTokens}
                    onChange={(event) => setUsageCalculator((current) => ({ ...current, outputTokens: event.target.value }))}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                  />
                </label>
                <label className="block">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Req/day</span>
                  <input
                    value={usageCalculator.requestsPerDay}
                    onChange={(event) => setUsageCalculator((current) => ({ ...current, requestsPerDay: event.target.value }))}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                  />
                </label>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">$ / 1M in</span>
                  <input
                    value={usageCalculator.inputRate}
                    onChange={(event) => setUsageCalculator((current) => ({ ...current, inputRate: event.target.value }))}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                  />
                </label>
                <label className="block">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">$ / 1M out</span>
                  <input
                    value={usageCalculator.outputRate}
                    onChange={(event) => setUsageCalculator((current) => ({ ...current, outputRate: event.target.value }))}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-2">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Per req</p>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{formatUsd(usageCostPerRequest)}</p>
                </div>
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-2">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">Daily</p>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{formatUsd(usageDailyCost)}</p>
                </div>
                <div className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2 py-2">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">30 days</p>
                  <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{formatUsd(usageMonthlyCost)}</p>
                </div>
              </div>

              <p className="mt-3 text-[10px] leading-5 text-[var(--text-secondary)]">
                Monthly volume: {formatCompactNumber(usageMonthlyInputTokens)} input + {formatCompactNumber(usageMonthlyOutputTokens)} output tokens. {usagePricing.note}
              </p>
            </SidebarCard>
          ) : null}

          <SidebarCard className="flex items-center gap-3 px-3 py-2">
            <motion.div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.04)]"
              initial={false}
              animate={{ opacity: 1 }}
            >
              <motion.div
                className={cn('h-full rounded-full', uplinkBarClassName)}
                animate={
                  whatsappStatus.status === 'connected'
                    ? { width: ['35%', '82%', '42%'] }
                    : whatsappStatus.status === 'connecting'
                      ? { width: ['18%', '55%', '30%'] }
                      : { width: '12%' }
                }
                transition={
                  whatsappStatus.status === 'disconnected'
                    ? { duration: 0.2, ease: 'easeOut' }
                    : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
                }
              />
            </motion.div>
            <span className={cn('text-[9px] font-bold uppercase tracking-[0.22em]', uplinkTextClassName)}>{uplinkLabel}</span>
          </SidebarCard>

          <SidebarCard className="p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] text-[11px] font-bold text-[var(--accent)]">
                {getInitial(user?.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{user?.email || 'Signed in broker'}</p>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                  {activeChannel ? `#${activeChannel.name}` : 'Personal channels'}
                </p>
                {whatsappStatus.connectedPhoneNumber ? (
                  <p className="mt-1 truncate text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    Active number {whatsappStatus.connectedPhoneNumber}
                  </p>
                ) : null}
              </div>
            </div>

            {subscription ? (
              <SidebarCard variant="accent" className="mt-3 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                    {isTrial ? '7-day trial' : subscription.plan}
                  </span>
                  {typeof trialDays === 'number' ? (
                    <span className="text-[10px] font-semibold text-[var(--text-primary)]">{trialDays}d left</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                  Activated {formatShortDate(subscription.created_at)} · Expires {formatShortDate(subscription.renewal_date)}
                </p>
              </SidebarCard>
            ) : null}

            <button
              type="button"
              onClick={showLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
            >
              <LogoutIcon className="h-3.5 w-3.5" />
              Sign out
            </button>
          </SidebarCard>
        </div>
      </div>

      <AnimatePresence>
        {isCreateOpen ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-3">
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full shadow-2xl"
            >
              <SidebarCard variant="surface" className="rounded-[12px] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--text-secondary)]">Create channel</p>
                  <h3 className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">Locality or keyword channel</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-[8px] border border-[color:var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Channel name</span>
                  <input
                    value={channelName}
                    onChange={(event) => setChannelName(event.target.value)}
                    placeholder="andheri-west"
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Localities</span>
                  <textarea
                    value={localitiesText}
                    onChange={(event) => setLocalitiesText(event.target.value)}
                    placeholder="Andheri West, Lokhandwala"
                    rows={2}
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Keywords</span>
                  <textarea
                    value={keywordsText}
                    onChange={(event) => setKeywordsText(event.target.value)}
                    placeholder="urgent, 2bhk rent, pre-leased"
                    rows={2}
                    className="mt-1 w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[color:var(--accent-border)]"
                  />
                </label>
                <p className="text-[11px] leading-5 text-[var(--text-secondary)]">
                  Pulse will route matching stream items into this channel automatically after you save it.
                </p>
                <button
                  type="button"
                  onClick={handleCreateChannel}
                  className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] px-3 py-2.5 text-[12px] font-semibold text-black transition-colors hover:brightness-110"
                >
                  <WorkflowIcon className="h-4 w-4" />
                  Save channel
                </button>
              </div>
              </SidebarCard>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
};
