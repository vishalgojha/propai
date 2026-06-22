import axios from 'axios';
import { keyService, parseApiKeys } from './keyService';
import { aiUsageService } from './aiUsageService';
import { getWorkspaceDefaultModel, getWorkspaceExplicitDefaultModel, getWorkspaceSettingsRecord } from './workspaceSettingsService';

interface AIResponse {
    text: string;
    model: string;
    latency: number;
    provider?: ProviderId;
    modelId?: string;
    reasoning?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type ProviderError = {
    provider: ProviderId;
    message: string;
};

type ProviderId = 'Groq' | 'Google' | 'OpenRouter' | 'Doubleword' | 'Nvidia';

type OpenAICompatibleConfig = {
    baseURL: string;
    model: string;
    extraHeaders?: Record<string, string>;
    extraBody?: Record<string, any>;
    responseFormat?: {
        type: 'json_object';
    };
};

function normalizeTokenCount(value: unknown) {
    return Math.max(0, Math.round(Number(value) || 0));
}

function extractOpenAIUsage(payload: any) {
    const promptTokens = normalizeTokenCount(payload?.usage?.prompt_tokens);
    const completionTokens = normalizeTokenCount(payload?.usage?.completion_tokens);
    const totalTokens = normalizeTokenCount(payload?.usage?.total_tokens || (promptTokens + completionTokens));
    return {
        promptTokens,
        completionTokens,
        totalTokens,
    };
}

function extractGeminiUsage(payload: any) {
    const promptTokens = normalizeTokenCount(payload?.usageMetadata?.promptTokenCount);
    const completionTokens = normalizeTokenCount(payload?.usageMetadata?.candidatesTokenCount);
    const totalTokens = normalizeTokenCount(payload?.usageMetadata?.totalTokenCount || (promptTokens + completionTokens));
    return {
        promptTokens,
        completionTokens,
        totalTokens,
    };
}

function summarizeAiError(error: any) {
    const status = error?.response?.status;
    const raw = String(
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'AI provider unavailable',
    );
    const normalized = raw.toLowerCase();

    if (status === 429 || normalized.includes('quota') || normalized.includes('rate limit')) {
        return 'quota or rate limit reached';
    }
    if (status === 402 || normalized.includes('billing') || normalized.includes('credit') || normalized.includes('payment')) {
        return 'billing or credits unavailable';
    }
    if (status === 401 || status === 403 || normalized.includes('api key') || normalized.includes('unauthorized')) {
        return 'key invalid or unauthorized';
    }
    if (status === 400 && normalized.includes('model')) {
        return 'configured model unavailable';
    }

    return raw.replace(/\s+/g, ' ').slice(0, 160);
}

export class AIService {
    private readonly providerRequestTimeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 30_000);
    private googleModel = process.env.GOOGLE_MODEL || 'gemini-2.5-flash';
    private groqBaseURL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    private groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    private openRouterBaseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    private openRouterModel = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    private doublewordBaseURL = process.env.DOUBLEWORD_BASE_URL || 'https://api.doubleword.ai/v1';
    private doublewordModel = process.env.DOUBLEWORD_MODEL || 'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4';
    private nvidiaBaseURL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    private nvidiaModel = process.env.NVIDIA_MODEL || 'meta/llama-4-maverick-17b-128e-instruct';
    private readonly providerLogAt = new Map<string, number>();

    private shouldLogProvider(key: string, cooldownMs: number) {
        const now = Date.now();
        const lastAt = this.providerLogAt.get(key) || 0;
        if (now - lastAt < cooldownMs) {
            return false;
        }

        this.providerLogAt.set(key, now);
        return true;
    }

    async chat(
        prompt: string,
        modelPreference: string = 'Auto',
        taskType?: string,
        tenantId?: string,
        systemPrompt?: string,
        conversationHistory: ChatMessage[] = []
    ): Promise<AIResponse> {
        const start = Date.now();

        const providers = await this.buildProviderOrder(modelPreference, taskType, tenantId);
        const settings = tenantId ? (await getWorkspaceSettingsRecord(tenantId).catch(() => null))?.settings : null;
        const effectiveHistory = this.applyContextBuffer(conversationHistory, settings?.contextBuffer);
        const effectiveSystemPrompt = this.applyTokenLogic(systemPrompt, settings?.tokenLogic);
        const errors: ProviderError[] = [];

        for (const provider of providers) {
            try {
                const response = await this.callModel(prompt, provider, tenantId, effectiveSystemPrompt, effectiveHistory);
                if (tenantId && response.usage) {
                    void aiUsageService.recordUsage({
                        tenantId,
                        provider: response.provider || provider,
                        model: response.modelId || response.model,
                        promptTokens: response.usage.promptTokens,
                        completionTokens: response.usage.completionTokens,
                        totalTokens: response.usage.totalTokens,
                        estimatedCostUsd: aiUsageService.estimateCost(
                            response.provider || provider,
                            response.usage.promptTokens,
                            response.usage.completionTokens,
                        ),
                        }).catch((usageError) => {
                            if (this.shouldLogProvider('record_usage_failed', 15 * 60_000)) {
                                console.error('[AIService] Failed to record AI usage', usageError);
                            }
                        });
                }
                return {
                    ...response,
                    latency: Date.now() - start
                };
            } catch (error: any) {
                const responseBody = error?.response?.data ? JSON.stringify(error.response.data).slice(0, 500) : '';
                const message = summarizeAiError(error);
                errors.push({ provider, message });
                if (this.shouldLogProvider(`provider_error:${provider}`, 5 * 60_000)) {
                    console.error(`AI Error with ${provider}, falling back...`, error);
                    if (responseBody) {
                        console.error(`[${provider}] Response body:`, responseBody);
                    }
                }
            }
        }

        const fallbackError = new Error(this.formatFallbackError(errors));
        (fallbackError as any).providerErrors = errors;
        throw fallbackError;
    }


    private routeByTask(taskType?: string): ProviderId {
        switch (taskType) {
            case 'quick_reply':
            case 'listing_parsing':
            case 'agent_router':
            case 'lead_qualification':
                return 'Google';
            default:
                return 'Google';
        }
    }

    private normalizeProviderPreference(value?: string | null): ProviderId | null {
        const normalized = (value || '').trim().toLowerCase();

        switch (normalized) {
            case 'auto':
            case 'google':
            case 'gemini':
            case 'gemini-2.5-flash':
            case 'models/gemini-2.5-flash':
                return 'Google';
            case 'groq':
            case 'llama3-8b-8192':
                return 'Groq';
        case 'openrouter':
        case 'openai/gpt-4o-mini':
            return 'OpenRouter';
        case 'doubleword':
        case 'qwen3-235b':
        case 'kimi-k2':
        case 'qwen/qwen3.6-35b-a3b-fp8':
            return 'Doubleword';
        case 'nvidia':
        case 'nemotron':
        case 'llama-4-maverick':
        case 'meta/llama-4-maverick-17b-128e-instruct':
            return 'Nvidia';
        default:
            return null;
        }
    }

    private async buildProviderOrder(modelPreference: string, taskType?: string, tenantId?: string): Promise<ProviderId[]> {
        const savedDefault = tenantId ? await getWorkspaceDefaultModel(tenantId).catch(() => null) : null;
        const explicitDefault = tenantId ? await getWorkspaceExplicitDefaultModel(tenantId).catch(() => null) : null;
        const explicitPreference = this.normalizeProviderPreference(modelPreference && modelPreference !== 'Auto' ? modelPreference : null);
        const savedPreference = this.normalizeProviderPreference(explicitDefault || savedDefault);
        const taskPreference = this.routeByTask(taskType);
        const preferred = explicitPreference || savedPreference;

        // Admin tenant uses Nvidia-first chain; regular users use Google-first
        const isAdmin = tenantId === '796c59fb-5e34-43b9-a4b5-bf1f2c7f9ac0';
        const defaultOrder: ProviderId[] = isAdmin
            ? ['Nvidia', 'Doubleword', 'OpenRouter', 'Google']
            : ['Google', 'OpenRouter', 'Doubleword', 'Nvidia'];

        // If the workspace or request explicitly selected a provider, do not silently
        // cascade across unrelated providers. Fallback chaining is only useful in Auto mode.
        if (explicitPreference && preferred && defaultOrder.includes(preferred)) {
            return [preferred];
        }

        if (preferred && defaultOrder.includes(preferred)) {
            return [preferred, ...defaultOrder.filter((provider) => provider !== preferred)];
        }

        // Task-level routing (e.g. listing_parsing → Google) only applies when no user preference set
        if (taskPreference && defaultOrder.includes(taskPreference)) {
            return [taskPreference, ...defaultOrder.filter((provider) => provider !== taskPreference)];
        }

        return defaultOrder;
    }

    private formatFallbackError(errors: ProviderError[]): string {
        if (errors.length === 0) {
            return 'AI provider unavailable';
        }

        const providerSummary = errors
            .map((entry) => `${entry.provider}: ${entry.message}`)
            .join(' | ');

        return `Tried ${providerSummary}. All AI providers failed.`;
    }

    private buildMessages(prompt: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): ChatMessage[] {
        const messages: ChatMessage[] = [];

        if (systemPrompt?.trim()) {
            messages.push({ role: 'system', content: systemPrompt.trim() });
        }

        for (const entry of conversationHistory) {
            if (!entry?.content?.trim()) {
                continue;
            }

            if (entry.role === 'system') {
                continue;
            }

            messages.push({
                role: entry.role,
                content: entry.content.trim(),
            });
        }

        messages.push({ role: 'user', content: prompt });
        return messages;
    }

    private applyContextBuffer(conversationHistory: ChatMessage[] = [], contextBuffer?: string | null): ChatMessage[] {
        const normalized = String(contextBuffer || 'Optimized').trim().toLowerCase();
        const maxMessages = normalized === 'low'
            ? 6
            : normalized === 'maximum'
                ? 40
                : 16;

        if (!Array.isArray(conversationHistory) || conversationHistory.length <= maxMessages) {
            return conversationHistory;
        }

        return conversationHistory.slice(-maxMessages);
    }

    private applyTokenLogic(systemPrompt?: string, tokenLogic?: string | null): string | undefined {
        const normalized = String(tokenLogic || 'Precision').trim().toLowerCase();
        const instruction = normalized === 'efficiency'
            ? 'Workspace AI setting: prioritize concise answers and avoid unnecessary reasoning or extra alternatives.'
            : normalized === 'experimental'
                ? 'Workspace AI setting: use broader reasoning and suggest creative options when useful, while staying factual.'
                : 'Workspace AI setting: prioritize accuracy, concrete details, and careful clarification when facts are uncertain.';

        return [systemPrompt?.trim(), instruction].filter(Boolean).join('\n\n') || undefined;
    }

    private buildConversationTranscript(prompt: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): string {
        const messages = this.buildMessages(prompt, systemPrompt, conversationHistory);
        return messages
            .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
            .join('\n\n');
    }

    private async callModel(prompt: string, modelId: ProviderId, tenantId?: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<AIResponse> {
        switch (modelId) {
            case 'Groq':
                return await this.callGroq(prompt, tenantId, systemPrompt, conversationHistory);
            case 'Google':
                return await this.callGemini(prompt, tenantId, systemPrompt, conversationHistory);
            case 'OpenRouter':
                return await this.callOpenRouter(prompt, tenantId, systemPrompt, conversationHistory);
            case 'Doubleword':
                return await this.callDoubleword(prompt, tenantId, systemPrompt, conversationHistory);
            case 'Nvidia':
                return await this.callNvidia(prompt, tenantId, systemPrompt, conversationHistory);
        }
    }


    private getEnvKeys(envValue?: string): string[] {
        return parseApiKeys(envValue);
    }

    private async getKeysForProvider(provider: ProviderId, tenantId?: string): Promise<string[]> {
        if (tenantId) {
            const keys = await keyService.getKeys(tenantId, provider);
            if (keys.length) return keys;
        }

        switch (provider) {
            case 'Google':
                return this.getEnvKeys(process.env.GOOGLE_API_KEY);
            case 'Groq':
                return this.getEnvKeys(process.env.GROQ_API_KEY);
            case 'OpenRouter':
                return this.getEnvKeys(process.env.OPENROUTER_API_KEY);
            case 'Doubleword':
                return this.getEnvKeys(process.env.DOUBLEWORD_API_KEY);
            case 'Nvidia':
                return this.getEnvKeys(process.env.NVIDIA_API_KEY);
        }
    }

    private isKeyExhaustedError(error: any) {
        const status = error?.response?.status;
        const message = String(
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error?.message ||
            ''
        ).toLowerCase();

        return [401, 403, 429].includes(status) ||
            message.includes('quota') ||
            message.includes('rate limit') ||
            message.includes('rate_limit') ||
            message.includes('insufficient') ||
            message.includes('exhaust') ||
            message.includes('credit') ||
            message.includes('billing') ||
            message.includes('unauthorized') ||
            message.includes('invalid api key');
    }

    private async withKeyRotation<T>(provider: ProviderId, keys: string[], fn: (key: string) => Promise<T>): Promise<T> {
        let lastError: any = null;

        for (const key of keys) {
            try {
                return await fn(key);
            } catch (error) {
                lastError = error;
                if (!this.isKeyExhaustedError(error)) {
                    throw error;
                }
            }
        }

        const message = lastError instanceof Error ? lastError.message : `${provider} API keys exhausted`;
        throw new Error(`${provider} API keys exhausted or unavailable: ${message}`);
    }

    private async callGroq(prompt: string, tenantId?: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<AIResponse> {
        const keys = await this.getKeysForProvider('Groq', tenantId);
        if (!keys.length) {
            throw new Error('Groq API key not configured');
        }
        const res = await this.withKeyRotation('Groq', keys, (key) => this.callOpenAICompatible(prompt, {
            baseURL: this.groqBaseURL,
            model: this.groqModel,
        }, key, systemPrompt, conversationHistory));
        return { 
            text: res.data.choices[0].message.content, 
            model: `Groq ${this.groqModel}`, 
            latency: 0,
            provider: 'Groq',
            modelId: this.groqModel,
            usage: extractOpenAIUsage(res.data),
        };
    }

    private async callGemini(prompt: string, tenantId?: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<AIResponse> {
        const keys = await this.getKeysForProvider('Google', tenantId);
        if (!keys.length) {
            throw new Error('Gemini API key not configured');
        }

        const messages = this.buildMessages(prompt, systemPrompt, conversationHistory);
        const contents = messages
            .filter((entry) => entry.role !== 'system')
            .map((entry) => ({
                role: entry.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: entry.content }],
            }));

        const res = await this.withKeyRotation('Google', keys, (key) => axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${this.googleModel}:generateContent?key=${key}`, {
            contents,
            ...(systemPrompt?.trim()
                ? { systemInstruction: { parts: [{ text: systemPrompt.trim() }] } }
                : {}),
        }, { timeout: this.providerRequestTimeoutMs }));
        return { 
            text: res.data.candidates[0].content.parts[0].text, 
            model: 'Gemini 2.5 Flash', 
            latency: 0,
            provider: 'Google',
            modelId: this.googleModel,
            usage: extractGeminiUsage(res.data),
        };
    }

    private async callOpenRouter(prompt: string, tenantId?: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<AIResponse> {
        const keys = await this.getKeysForProvider('OpenRouter', tenantId);
        if (!keys.length) {
            throw new Error('OpenRouter API key not configured');
        }
        const res = await this.withKeyRotation('OpenRouter', keys, (key) => this.callOpenAICompatible(prompt, {
            baseURL: this.openRouterBaseURL,
            model: this.openRouterModel,
            extraHeaders: {
                'HTTP-Referer': process.env.APP_URL || 'https://app.propai.live',
                'X-Title': 'PropAI Pulse',
            },
            responseFormat: {
                type: 'json_object',
            },
        }, key, systemPrompt, conversationHistory));
        return { 
            text: res.data.choices?.[0]?.message?.content || res.data.message?.content || res.data.response, 
            model: `OpenRouter ${this.openRouterModel}`, 
            latency: 0,
            provider: 'OpenRouter',
            modelId: this.openRouterModel,
            usage: extractOpenAIUsage(res.data),
        };
    }

    private async callDoubleword(prompt: string, tenantId?: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<AIResponse> {
        const keys = await this.getKeysForProvider('Doubleword', tenantId);
        if (!keys.length) {
            throw new Error('Doubleword API key not configured');
        }
        const res = await this.withKeyRotation('Doubleword', keys, (key) => this.callOpenAICompatible(prompt, {
            baseURL: this.doublewordBaseURL,
            model: this.doublewordModel,
            extraBody: {
                chat_template_kwargs: {
                    enable_thinking: false,
                },
            },
        }, key, systemPrompt, conversationHistory));
        return { 
            text: res.data.choices[0].message.content, 
            model: `Doubleword ${this.doublewordModel}`, 
            latency: 0,
            provider: 'Doubleword',
            modelId: this.doublewordModel,
            usage: extractOpenAIUsage(res.data),
        };
    }

    private async callNvidia(prompt: string, tenantId?: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<AIResponse> {
        const keys = await this.getKeysForProvider('Nvidia', tenantId);
        if (!keys.length) {
            throw new Error('NVIDIA API key not configured');
        }
        const res = await this.withKeyRotation('Nvidia', keys, (key) => this.callOpenAICompatible(prompt, {
            baseURL: this.nvidiaBaseURL,
            model: this.nvidiaModel,
        }, key, systemPrompt, conversationHistory));
        return { 
            text: res.data.choices[0].message.content, 
            model: `Nvidia ${this.nvidiaModel}`, 
            latency: 0,
            provider: 'Nvidia',
            modelId: this.nvidiaModel,
            usage: extractOpenAIUsage(res.data),
        };
    }

    private async callOpenAICompatible(prompt: string, config: OpenAICompatibleConfig, apiKey: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<any> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(config.extraHeaders || {}),
        };

        const baseURL = config.baseURL.endsWith('/') ? config.baseURL.slice(0, -1) : config.baseURL;
        return axios.post(`${baseURL}/chat/completions`, {
            model: config.model,
            messages: this.buildMessages(prompt, systemPrompt, conversationHistory),
            ...(config.responseFormat ? { response_format: config.responseFormat } : {}),
            ...(config.extraBody || {}),
        }, { headers, timeout: this.providerRequestTimeoutMs });
    }


    async getStatus(tenantId?: string) {
        const tenantGroqKey = tenantId ? await keyService.getKey(tenantId, 'Groq') : null;
        const tenantGoogleKey = tenantId ? await keyService.getKey(tenantId, 'Google') : null;
        const tenantOpenRouterKey = tenantId ? await keyService.getKey(tenantId, 'OpenRouter') : null;
        const tenantDoublewordKey = tenantId ? await keyService.getKey(tenantId, 'Doubleword') : null;
        const tenantNvidiaKey = tenantId ? await keyService.getKey(tenantId, 'Nvidia') : null;
        const savedDefault = tenantId ? await getWorkspaceDefaultModel(tenantId).catch(() => null) : null;
        const explicitDefault = tenantId ? await getWorkspaceExplicitDefaultModel(tenantId).catch(() => null) : null;
        const hasGroq = Boolean(tenantGroqKey || process.env.GROQ_API_KEY);
        const hasGoogle = Boolean(tenantGoogleKey || process.env.GOOGLE_API_KEY);
        const hasOpenRouter = Boolean(tenantOpenRouterKey || process.env.OPENROUTER_API_KEY);
        const hasDoubleword = Boolean(tenantDoublewordKey || process.env.DOUBLEWORD_API_KEY);
        const hasNvidia = Boolean(tenantNvidiaKey || process.env.NVIDIA_API_KEY);
        const isAdmin = tenantId === '796c59fb-5e34-43b9-a4b5-bf1f2c7f9ac0';
        const providerOrder: ProviderId[] = isAdmin
            ? ['Nvidia', 'Doubleword', 'OpenRouter', 'Google']
            : ['Google', 'OpenRouter', 'Doubleword', 'Nvidia'];
        const preferred =
            this.normalizeProviderPreference(explicitDefault || savedDefault) ||
            (isAdmin ? 'Nvidia' : 'Google');
        const orderedProviders = preferred && providerOrder.includes(preferred)
            ? [preferred, ...providerOrder.filter((provider) => provider !== preferred)]
            : providerOrder;

        return {
          preferredProvider: preferred,
          providerOrder: orderedProviders,
          defaultModel: explicitDefault || (savedDefault || this.googleModel),
          models: {
            Groq: { name: `Groq ${this.groqModel}`, latency: 150, status: hasGroq ? 'online' : 'offline' },
            Google: { name: 'Gemini 2.5 Flash', latency: 300, status: hasGoogle ? 'online' : 'offline' },
            OpenRouter: { name: `OpenRouter ${this.openRouterModel}`, latency: 350, status: hasOpenRouter ? 'online' : 'offline' },
            Doubleword: { name: `Doubleword ${this.doublewordModel}`, latency: 300, status: hasDoubleword ? 'online' : 'offline' },
            Nvidia: { name: `Nvidia ${this.nvidiaModel}`, latency: 350, status: hasNvidia ? 'online' : 'offline' },
          }
        };
    }
}

export const aiService = new AIService();
