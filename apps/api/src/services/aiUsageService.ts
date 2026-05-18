import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;

type ProviderId = 'Groq' | 'Google' | 'OpenRouter' | 'Doubleword';

type UsageRecordInput = {
    tenantId: string;
    provider: ProviderId;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
};

type UsageRow = {
    provider: string | null;
    model: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    estimated_cost_usd: number | null;
    created_at: string | null;
};

const PROVIDER_RATE_CARD: Record<ProviderId, { inputRate: number; outputRate: number }> = {
    Google: { inputRate: 0.3, outputRate: 2.5 },
    Groq: { inputRate: 0.05, outputRate: 0.08 },
    OpenRouter: { inputRate: 0.15, outputRate: 0.6 },
    Doubleword: { inputRate: 0.1, outputRate: 0.4 },
};

function safeInt(value: unknown) {
    return Math.max(0, Math.round(Number(value) || 0));
}

function safeNumber(value: unknown) {
    return Math.max(0, Number(value) || 0);
}

function roundUsd(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000;
}

function emptyTotals() {
    return {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
    };
}

export class AIUsageService {
    estimateCost(provider: ProviderId, promptTokens: number, completionTokens: number) {
        const rates = PROVIDER_RATE_CARD[provider];
        return roundUsd(
            ((safeInt(promptTokens) / 1_000_000) * rates.inputRate) +
            ((safeInt(completionTokens) / 1_000_000) * rates.outputRate),
        );
    }

    async recordUsage(input: UsageRecordInput) {
        const payload = {
            tenant_id: input.tenantId,
            provider: input.provider,
            model: String(input.model || input.provider).trim() || input.provider,
            prompt_tokens: safeInt(input.promptTokens),
            completion_tokens: safeInt(input.completionTokens),
            total_tokens: safeInt(input.totalTokens || (safeInt(input.promptTokens) + safeInt(input.completionTokens))),
            estimated_cost_usd: roundUsd(safeNumber(input.estimatedCostUsd)),
        };

        const { error } = await db
            .from('ai_usage')
            .insert(payload);

        if (error) {
            throw error;
        }
    }

    async getUsageSummary(tenantId: string) {
        const { data, error } = await db
            .from('ai_usage')
            .select('provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        const rows = (data || []) as UsageRow[];
        const last30Cutoff = new Date(Date.now() - (30 * 86_400_000));
        const last7Days = Array.from({ length: 7 }, (_, index) => {
            const day = new Date();
            day.setDate(day.getDate() - (6 - index));
            return day.toISOString().slice(0, 10);
        });

        const totals = emptyTotals();
        const last30Days = emptyTotals();
        const byProvider = new Map<string, ReturnType<typeof emptyTotals>>();
        const byModel = new Map<string, ReturnType<typeof emptyTotals> & { provider: string }>();
        const dailyMap = new Map<string, ReturnType<typeof emptyTotals>>();

        for (const day of last7Days) {
            dailyMap.set(day, emptyTotals());
        }

        for (const row of rows) {
            const promptTokens = safeInt(row.prompt_tokens);
            const completionTokens = safeInt(row.completion_tokens);
            const totalTokens = safeInt(row.total_tokens || (promptTokens + completionTokens));
            const estimatedCostUsd = safeNumber(row.estimated_cost_usd);
            const createdAt = row.created_at ? new Date(row.created_at) : null;
            const provider = String(row.provider || 'Unknown').trim() || 'Unknown';
            const model = String(row.model || provider).trim() || provider;

            const apply = (bucket: ReturnType<typeof emptyTotals>) => {
                bucket.requests += 1;
                bucket.inputTokens += promptTokens;
                bucket.outputTokens += completionTokens;
                bucket.totalTokens += totalTokens;
                bucket.estimatedCostUsd = roundUsd(bucket.estimatedCostUsd + estimatedCostUsd);
            };

            apply(totals);

            if (createdAt && createdAt >= last30Cutoff) {
                apply(last30Days);
            }

            if (!byProvider.has(provider)) {
                byProvider.set(provider, emptyTotals());
            }
            apply(byProvider.get(provider)!);

            const modelKey = `${provider}::${model}`;
            if (!byModel.has(modelKey)) {
                byModel.set(modelKey, { ...emptyTotals(), provider });
            }
            apply(byModel.get(modelKey)!);

            const dayKey = createdAt ? createdAt.toISOString().slice(0, 10) : null;
            if (dayKey && dailyMap.has(dayKey)) {
                apply(dailyMap.get(dayKey)!);
            }
        }

        return {
            totals,
            last30Days,
            byProvider: Array.from(byProvider.entries())
                .map(([provider, bucket]) => ({ provider, ...bucket }))
                .sort((left, right) => right.estimatedCostUsd - left.estimatedCostUsd),
            byModel: Array.from(byModel.entries())
                .map(([key, bucket]) => ({
                    provider: bucket.provider,
                    model: key.split('::')[1] || bucket.provider,
                    requests: bucket.requests,
                    inputTokens: bucket.inputTokens,
                    outputTokens: bucket.outputTokens,
                    totalTokens: bucket.totalTokens,
                    estimatedCostUsd: bucket.estimatedCostUsd,
                }))
                .sort((left, right) => right.estimatedCostUsd - left.estimatedCostUsd),
            daily: Array.from(dailyMap.entries()).map(([date, bucket]) => ({ date, ...bucket })),
            latestRequestAt: rows[0]?.created_at || null,
        };
    }

    async resetUsage(tenantId: string) {
        const { data, error } = await db
            .from('ai_usage')
            .delete()
            .eq('tenant_id', tenantId)
            .select('id');

        if (error) {
            throw error;
        }

        return {
            deletedCount: Array.isArray(data) ? data.length : 0,
        };
    }
}

export const aiUsageService = new AIUsageService();
