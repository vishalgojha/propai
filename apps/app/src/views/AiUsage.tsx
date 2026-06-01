import React from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

const OWNER_SUPER_ADMIN_EMAILS = new Set([
  'vishal@chaoscraftlabs.com',
  'vishal@chaoscraftslabs.com',
  'chariotrealty@gmail.com',
  'hello@chaoscraftlabs.com',
  'ojha007@gmail.com',
  'hello@propai.live',
]);

type UsageBucket = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

type UsageBreakdown = UsageBucket & {
  provider: string;
};

type ModelBreakdown = UsageBucket & {
  provider: string;
  model: string;
};

type DailyUsage = UsageBucket & {
  date: string;
};

type UsageSummary = {
  totals: UsageBucket;
  last30Days: UsageBucket;
  byProvider: UsageBreakdown[];
  byModel: ModelBreakdown[];
  daily: DailyUsage[];
  latestRequestAt: string | null;
};

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

function formatDateTime(value?: string | null) {
  if (!value) return 'No usage recorded yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No usage recorded yet';
  return parsed.toLocaleString();
}

const EMPTY_SUMMARY: UsageSummary = {
  totals: {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  },
  last30Days: {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  },
  byProvider: [],
  byModel: [],
  daily: [],
  latestRequestAt: null,
};

export const AiUsage: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = React.useState<UsageSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isResetting, setIsResetting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const isSuperAdmin =
    user?.appRole === 'super_admin' ||
    OWNER_SUPER_ADMIN_EMAILS.has(String(user?.email || '').trim().toLowerCase());

  const loadUsage = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await backendApi.get<UsageSummary>(ENDPOINTS.ai.usage);
      setSummary(response.data || EMPTY_SUMMARY);
    } catch (err) {
      setSummary(EMPTY_SUMMARY);
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isSuperAdmin) return;
    void loadUsage();
  }, [isSuperAdmin, loadUsage]);

  const handleReset = async () => {
    setIsResetting(true);
    setError(null);
    setInfo(null);
    try {
      const response = await backendApi.post<{ deletedCount?: number }>(ENDPOINTS.ai.usageReset);
      const deletedCount = Number(response.data?.deletedCount || 0);
      setInfo(`Usage counters reset. Cleared ${deletedCount} usage rows.`);
      await loadUsage();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setIsResetting(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">AI Usage</h1>
        <p className="mt-2 text-[14px] text-[var(--text-secondary)]">This page is limited to super admin access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Admin only</p>
            <h1 className="mt-2 text-[26px] font-semibold text-[var(--text-primary)]">AI usage</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--text-secondary)]">
              Real token usage is now pulled from recorded `ai_usage` rows. Totals reset automatically when API keys change, and you can also flush them manually here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">Latest request</p>
              <p className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">{formatDateTime(summary.latestRequestAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={isResetting || isLoading}
              className="rounded-[14px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[13px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[#04110a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResetting ? 'Resetting…' : 'Reset usage'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-[16px] border border-[rgba(255,120,120,0.25)] bg-[rgba(120,18,18,0.14)] px-4 py-3 text-[13px] text-[#ffb4b4]">
            {error}
          </div>
        ) : null}

        {info ? (
          <div className="mt-4 rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-[13px] text-[var(--accent)]">
            {info}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="All requests" value={isLoading ? '…' : formatCompactNumber(summary.totals.requests)} />
          <MetricCard label="30 day cost" value={isLoading ? '…' : formatUsd(summary.last30Days.estimatedCostUsd)} />
          <MetricCard label="30 day input" value={isLoading ? '…' : formatCompactNumber(summary.last30Days.inputTokens)} />
          <MetricCard label="30 day output" value={isLoading ? '…' : formatCompactNumber(summary.last30Days.outputTokens)} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Provider breakdown</p>
            <div className="mt-4 space-y-3">
              {summary.byProvider.length === 0 ? (
                <p className="text-[13px] text-[var(--text-secondary)]">No usage has been recorded yet.</p>
              ) : (
                summary.byProvider.map((provider) => (
                  <div key={provider.provider} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{provider.provider}</p>
                        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                          {formatCompactNumber(provider.requests)} req • {formatCompactNumber(provider.totalTokens)} total tokens
                        </p>
                      </div>
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{formatUsd(provider.estimatedCostUsd)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Top models</p>
            <div className="mt-4 space-y-3">
              {summary.byModel.length === 0 ? (
                <p className="text-[13px] text-[var(--text-secondary)]">No model usage recorded yet.</p>
              ) : (
                summary.byModel.slice(0, 6).map((model) => (
                  <div key={`${model.provider}-${model.model}`} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{model.model}</p>
                        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{model.provider}</p>
                      </div>
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{formatUsd(model.estimatedCostUsd)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Lifetime since last reset</p>
            <p className="mt-2 text-[18px] font-semibold text-[var(--text-primary)]">
              {formatCompactNumber(summary.totals.inputTokens)} input + {formatCompactNumber(summary.totals.outputTokens)} output
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
              Total estimated spend from recorded token usage: {formatUsd(summary.totals.estimatedCostUsd)}.
            </p>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Last 7 days</p>
            <div className="mt-3 space-y-2">
              {summary.daily.length === 0 ? (
                <p className="text-[13px] text-[var(--text-secondary)]">No recent activity.</p>
              ) : (
                summary.daily.map((day) => (
                  <div key={day.date} className="flex items-center justify-between text-[13px]">
                    <span className="text-[var(--text-secondary)]">{day.date}</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatCompactNumber(day.requests)} req • {formatUsd(day.estimatedCostUsd)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-[24px] font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
