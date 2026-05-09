import axios from 'axios';
import { keyService, parseApiKeys } from './keyService';
import { getWorkspaceDefaultModel } from './workspaceSettingsService';

interface AIResponse {
    text: string;
    model: string;
    latency: number;
}

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type ProviderError = {
    provider: ProviderId;
    message: string;
};

type ProviderId = 'Concentrate' | 'Groq' | 'Google' | 'OpenRouter' | 'Doubleword';

type OpenAICompatibleConfig = {
    baseURL: string;
    model: string;
    extraHeaders?: Record<string, string>;
    responseFormat?: {
        type: 'json_object';
    };
};

export class AIService {
    private concentrateBaseURL = process.env.CONCENTRATE_BASE_URL || 'https://api.concentrate.ai/v1';
    private concentrateModel = process.env.CONCENTRATE_MODEL || 'auto';
    private googleModel = process.env.GOOGLE_MODEL || 'gemini-2.5-flash';
    private groqBaseURL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    private groqModel = process.env.GROQ_MODEL || 'llama3-8b-8192';
    private openRouterBaseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    private openRouterModel = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    private doublewordBaseURL = process.env.DOUBLEWORD_BASE_URL || 'https://api.doubleword.ai/v1';
    private doublewordModel = process.env.DOUBLEWORD_MODEL || 'qwen3-235b';

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
        const errors: ProviderError[] = [];

        for (const provider of providers) {
            try {
                const response = await this.callModel(prompt, provider, tenantId, systemPrompt, conversationHistory);
                return {
                    ...response,
                    latency: Date.now() - start
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : 'AI provider unavailable';
                errors.push({ provider, message });
                console.error(`AI Error with ${provider}, falling back...`, error);
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
            case 'concentrate':
            case 'auto':
            case 'concentrate-auto':
                return 'Concentrate';
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
            return 'Doubleword';
        default:
            return null;
        }
    }

    private async buildProviderOrder(modelPreference: string, taskType?: string, tenantId?: string): Promise<ProviderId[]> {
        const savedDefault = tenantId ? await getWorkspaceDefaultModel(tenantId).catch(() => null) : null;
        const tenantConcentrateKey = tenantId ? await keyService.getKey(tenantId, 'Concentrate').catch(() => null) : null;
        const hasConcentrate = Boolean(tenantConcentrateKey || process.env.CONCENTRATE_API_KEY);
        const preferred =
            this.normalizeProviderPreference(modelPreference && modelPreference !== 'Auto' ? modelPreference : null) ||
            this.normalizeProviderPreference(savedDefault) ||
            this.routeByTask(taskType);
        const order: ProviderId[] = hasConcentrate
            ? ['Concentrate', 'Google', 'Groq', 'OpenRouter', 'Doubleword']
            : ['Google', 'Groq', 'OpenRouter', 'Doubleword'];

        if (preferred && order.includes(preferred)) {
            return [preferred, ...order.filter((provider) => provider !== preferred)];
        }

        return order;
    }

    private formatFallbackError(errors: ProviderError[]): string {
        const primary = errors[0]?.message || 'AI provider unavailable';
        const providerSummary = errors
            .map((entry) => `${entry.provider}: ${entry.message}`)
            .join(' | ');

        return providerSummary
            ? `${primary}. Tried ${providerSummary}.`
            : primary;
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

    private buildConversationTranscript(prompt: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): string {
        const messages = this.buildMessages(prompt, systemPrompt, conversationHistory);
        return messages
            .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
            .join('\n\n');
    }

    private async callModel(prompt: string, modelId: ProviderId, tenantId?: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<AIResponse> {
        switch (modelId) {
            case 'Concentrate':
                return await this.callConcentrate(prompt, tenantId, systemPrompt, conversationHistory);
            case 'Groq':
                return await this.callGroq(prompt, tenantId, systemPrompt, conversationHistory);
            case 'Google':
                return await this.callGemini(prompt, tenantId, systemPrompt, conversationHistory);
            case 'OpenRouter':
                return await this.callOpenRouter(prompt, tenantId, systemPrompt, conversationHistory);
            case 'Doubleword':
                return await this.callDoubleword(prompt, tenantId, systemPrompt, conversationHistory);
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
            case 'Concentrate':
                return this.getEnvKeys(process.env.CONCENTRATE_API_KEY);
            case 'Google':
                return this.getEnvKeys(process.env.GOOGLE_API_KEY);
            case 'Groq':
                return this.getEnvKeys(process.env.GROQ_API_KEY);
            case 'OpenRouter':
                return this.getEnvKeys(process.env.OPENROUTER_API_KEY);
            case 'Doubleword':
                return this.getEnvKeys(process.env.DOUBLEWORD_API_KEY);
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
            latency: 0 
        };
    }

    private async callConcentrate(prompt: string, tenantId?: string, systemPrompt?: string, conversationHistory: ChatMessage[] = []): Promise<AIResponse> {
        const keys = await this.getKeysForProvider('Concentrate', tenantId);
        if (!keys.length) {
            throw new Error('Concentrate API key not configured');
        }

        const res = await this.withKeyRotation('Concentrate', keys, (key) => {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            };
            const baseURL = this.concentrateBaseURL.endsWith('/') ? this.concentrateBaseURL.slice(0, -1) : this.concentrateBaseURL;
            return axios.post(`${baseURL}/responses`, {
                model: this.concentrateModel,
                input: this.buildConversationTranscript(prompt, systemPrompt, conversationHistory),
            }, { headers });
        });

        const output = Array.isArray(res.data?.output) ? res.data.output : [];
        const text = output
            .flatMap((entry: any) => Array.isArray(entry?.content) ? entry.content : [])
            .filter((part: any) => part?.type === 'output_text' && typeof part?.text === 'string')
            .map((part: any) => part.text)
            .join('\n')
            .trim();

        if (!text) {
            throw new Error('Concentrate returned an empty response');
        }

        return {
            text,
            model: `Concentrate ${res.data?.model || this.concentrateModel}`,
            latency: 0,
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
        }));
        return { 
            text: res.data.candidates[0].content.parts[0].text, 
            model: 'Gemini 2.5 Flash', 
            latency: 0 
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
            latency: 0 
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
        }, key, systemPrompt, conversationHistory));
        return { 
            text: res.data.choices[0].message.content, 
            model: `Doubleword ${this.doublewordModel}`, 
            latency: 0 
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
        }, { headers });
    }


    async getStatus(tenantId?: string) {
        const tenantGroqKey = tenantId ? await keyService.getKey(tenantId, 'Groq') : null;
        const tenantGoogleKey = tenantId ? await keyService.getKey(tenantId, 'Google') : null;
        const tenantOpenRouterKey = tenantId ? await keyService.getKey(tenantId, 'OpenRouter') : null;
        const tenantDoublewordKey = tenantId ? await keyService.getKey(tenantId, 'Doubleword') : null;
        const hasConcentrate = Boolean(process.env.CONCENTRATE_API_KEY);
        const hasGroq = Boolean(tenantGroqKey || process.env.GROQ_API_KEY);
        const hasGoogle = Boolean(tenantGoogleKey || process.env.GOOGLE_API_KEY);
        const hasOpenRouter = Boolean(tenantOpenRouterKey || process.env.OPENROUTER_API_KEY);
        const hasDoubleword = Boolean(tenantDoublewordKey || process.env.DOUBLEWORD_API_KEY);

        return {
          models: {
            Concentrate: { name: `Concentrate ${this.concentrateModel}`, latency: 250, status: hasConcentrate ? 'online' : 'offline' },
            Groq: { name: `Groq ${this.groqModel}`, latency: 150, status: hasGroq ? 'online' : 'offline' },
            Google: { name: 'Gemini 2.5 Flash', latency: 300, status: hasGoogle ? 'online' : 'offline' },
            OpenRouter: { name: `OpenRouter ${this.openRouterModel}`, latency: 350, status: hasOpenRouter ? 'online' : 'offline' },
            Doubleword: { name: `Doubleword ${this.doublewordModel}`, latency: 300, status: hasDoubleword ? 'online' : 'offline' },
          }
        };
    }
}

export const aiService = new AIService();
