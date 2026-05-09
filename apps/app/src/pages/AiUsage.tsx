import React from 'react';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

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

export const AiUsage: React.FC = () => {
  const { user } = useAuth();
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
        const fallbackPricing = AI_MODEL_PRICING[DEFAULT_AI_MODEL_KEY];
        setUsageModelKey(DEFAULT_AI_MODEL_KEY);
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

  if (!isSuperAdmin) {
    return (
      <div className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">AI Usage</h1>
        <p className="mt-2 text-[14px] text-[var(--text-secondary)]">This page is limited to super admin access.</p>
      </div>
    );
  }

  const usagePricing = AI_MODEL_PRICING[usageModelKey];
  const inputTokens = Math.max(0, Number(usageCalculator.inputTokens) || 0);
  const outputTokens = Math.max(0, Number(usageCalculator.outputTokens) || 0);
  const requestsPerDay = Math.max(0, Number(usageCalculator.requestsPerDay) || 0);
  const inputRate = Math.max(0, Number(usageCalculator.inputRate) || 0);
  const outputRate = Math.max(0, Number(usageCalculator.outputRate) || 0);
  const usageCostPerRequest = ((inputTokens / 1_000_000) * inputRate) + ((outputTokens / 1_000_000) * outputRate);
  const usageDailyCost = usageCostPerRequest * requestsPerDay;
  const usageMonthlyCost = usageDailyCost * 30;
  const usageMonthlyInputTokens = inputTokens * requestsPerDay * 30;
  const usageMonthlyOutputTokens = outputTokens * requestsPerDay * 30;

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Admin only</p>
            <h1 className="mt-2 text-[26px] font-semibold text-[var(--text-primary)]">AI usage calculator</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--text-secondary)]">
              Estimate request, daily, and monthly AI spend using the current workspace default model as the starting rate card.
            </p>
          </div>
          <div className="rounded-[16px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">{usagePricing.provider}</p>
            <p className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">{usagePricing.label}</p>
            <p className="text-[12px] text-[var(--text-secondary)]">Loaded from workspace settings</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">In tokens</span>
                <input
                  value={usageCalculator.inputTokens}
                  onChange={(event) => setUsageCalculator((current) => ({ ...current, inputTokens: event.target.value }))}
                  inputMode="numeric"
                  className="mt-2 w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Out tokens</span>
                <input
                  value={usageCalculator.outputTokens}
                  onChange={(event) => setUsageCalculator((current) => ({ ...current, outputTokens: event.target.value }))}
                  inputMode="numeric"
                  className="mt-2 w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Req/day</span>
                <input
                  value={usageCalculator.requestsPerDay}
                  onChange={(event) => setUsageCalculator((current) => ({ ...current, requestsPerDay: event.target.value }))}
                  inputMode="numeric"
                  className="mt-2 w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">$ / 1M in</span>
                <input
                  value={usageCalculator.inputRate}
                  onChange={(event) => setUsageCalculator((current) => ({ ...current, inputRate: event.target.value }))}
                  inputMode="decimal"
                  className="mt-2 w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">$ / 1M out</span>
                <input
                  value={usageCalculator.outputRate}
                  onChange={(event) => setUsageCalculator((current) => ({ ...current, outputRate: event.target.value }))}
                  inputMode="decimal"
                  className="mt-2 w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-3 text-[14px] text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
                />
              </label>
            </div>
          </div>

          <div className="grid gap-3">
            <MetricCard label="Per req" value={formatUsd(usageCostPerRequest)} />
            <MetricCard label="Daily" value={formatUsd(usageDailyCost)} />
            <MetricCard label="30 days" value={formatUsd(usageMonthlyCost)} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Monthly volume</p>
            <p className="mt-2 text-[18px] font-semibold text-[var(--text-primary)]">
              {formatCompactNumber(usageMonthlyInputTokens)} input + {formatCompactNumber(usageMonthlyOutputTokens)} output
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{usagePricing.note}</p>
          </div>

          <div className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">Why separate page</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
              This keeps the sidebar compact for everyday use while preserving the full calculator for admin review when you actually need it.
            </p>
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
