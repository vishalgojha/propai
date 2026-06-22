import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { supabase, supabaseAdmin } from '../config/supabase';

type WorkspaceSettingsStore = Record<string, {
    aiKeys?: Record<string, string>;
    updatedAt?: string;
}>;

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'workspace-settings.json');
const KEY_TABLE = 'api_keys';

function providerToWorkspaceKey(provider: string) {
    switch (provider) {
        case 'Google':
            return 'gemini';
        case 'Groq':
            return 'groq';
        case 'OpenRouter':
            return 'openrouter';
        case 'OpenAI':
            return 'openai';
        default:
            return provider.toLowerCase();
    }
}

export function parseApiKeys(value?: string | null): string[] {
    return (value || '')
        .split(/[\n,;]+/)
        .map((entry) => entry.replace(/\s+/g, '').trim())
        .filter(Boolean);
}

async function readWorkspaceStore(): Promise<WorkspaceSettingsStore> {
    try {
        const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed as WorkspaceSettingsStore;
        }
    } catch {
        // ignore missing or invalid file
    }

    return {};
}

async function writeWorkspaceStore(store: WorkspaceSettingsStore) {
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function getKeyStoreClient() {
    return supabaseAdmin ?? supabase;
}

function isMissingRelationError(error: any) {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
}

function trimBaseUrl(value: string) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}

function summarizeProviderError(error: any) {
    const status = error?.response?.status;
    const bodyMessage = String(
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Connection test failed',
    );
    const normalized = bodyMessage.toLowerCase();
    if (status === 429 || normalized.includes('quota') || normalized.includes('rate limit')) {
        return 'Quota or rate limit reached for this key/model. Try another key or wait for quota reset.';
    }
    if (status === 402 || normalized.includes('billing') || normalized.includes('credit') || normalized.includes('payment')) {
        return 'Billing or credits are not active for this provider key.';
    }
    if (status === 401 || status === 403 || normalized.includes('api key')) {
        return 'The API key is invalid or does not have access to this model.';
    }
    if (status === 400 && normalized.includes('model')) {
        return 'The configured model is not available for this provider key.';
    }
    return status ? `HTTP ${status}: ${bodyMessage.slice(0, 180)}` : bodyMessage.slice(0, 180);
}

export class KeyService {
    async saveKey(tenantId: string, provider: string, key: string): Promise<{ success: boolean; error?: string }> {
        const updatedAt = new Date().toISOString();
        const fileKey = providerToWorkspaceKey(provider);
        const normalizedKey = parseApiKeys(key).join('\n');

        const store = await readWorkspaceStore();
        store[tenantId] = {
            ...store[tenantId],
            aiKeys: {
                ...(store[tenantId]?.aiKeys || {}),
                [fileKey]: normalizedKey,
            },
            updatedAt,
        };

        let dbError: string | null = null;
        try {
            const { error } = await getKeyStoreClient()
                .from(KEY_TABLE)
                .upsert({ tenant_id: tenantId, provider, key: normalizedKey, updated_at: updatedAt }, { onConflict: 'tenant_id, provider' });

            if (error) {
                dbError = error.message;
            }
        } catch (error: any) {
            dbError = error?.message || 'Failed to persist API key in database';
        }

        let fileError: string | null = null;
        try {
            await writeWorkspaceStore(store);
        } catch (error: any) {
            fileError = error?.message || 'Failed to persist API key in workspace settings';
        }

        if (dbError) {
            return { success: false, error: dbError };
        }

        if (fileError) {
            return { success: false, error: fileError };
        }

        return { success: true };
    }

    async getKey(tenantId: string, provider: string): Promise<string | null> {
        const keys = await this.getKeys(tenantId, provider);
        return keys[0] || null;
    }

    async getKeyMeta(tenantId: string, provider: string): Promise<{ updatedAt: string | null }> {
        try {
            const { data, error } = await getKeyStoreClient()
                .from(KEY_TABLE)
                .select('updated_at')
                .eq('tenant_id', tenantId)
                .eq('provider', provider)
                .maybeSingle();

            if (!error && data) {
                return { updatedAt: (data as any).updated_at || null };
            }
        } catch {
        }

        return { updatedAt: null };
    }

    async hasAnyKeys(tenantId: string): Promise<boolean> {
        const aiProviders = ['Google', 'Groq', 'OpenRouter', 'Doubleword', 'OpenAI'];
        try {
            const { data, error } = await getKeyStoreClient()
                .from(KEY_TABLE)
                .select('provider')
                .eq('tenant_id', tenantId)
                .in('provider', aiProviders);

            if (!error && data) {
                return (data as any[]).length > 0;
            }
        } catch {
        }

        const store = await readWorkspaceStore();
        const userStore = store[tenantId];
        if (userStore?.aiKeys) {
            return Object.values(userStore.aiKeys).some((v) => Boolean(v));
        }

        return false;
    }

    async getKeys(tenantId: string, provider: string): Promise<string[]> {
        try {
            const { data, error } = await getKeyStoreClient()
                .from(KEY_TABLE)
                .select('key')
                .eq('tenant_id', tenantId)
                .eq('provider', provider)
                .maybeSingle();

            if (error && !isMissingRelationError(error)) {
                console.error('[KeyService] Failed to load DB key', error);
            }

            if ((data as any)?.key) return parseApiKeys((data as any).key);
        } catch (error) {
            console.error('[KeyService] Unexpected DB load failure', error);
        }

        const store = await readWorkspaceStore();
        const fileKey = providerToWorkspaceKey(provider);
        return parseApiKeys(store[tenantId]?.aiKeys?.[fileKey] || null);
    }

    async deleteKey(tenantId: string, provider: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await getKeyStoreClient()
                .from(KEY_TABLE)
                .delete()
                .eq('tenant_id', tenantId)
                .eq('provider', provider);

            if (error) {
                return { success: false, error: error.message };
            }
        } catch (error: any) {
            return { success: false, error: error?.message || 'Failed to delete API key' };
        }

        const store = await readWorkspaceStore();
        if (store[tenantId]?.aiKeys) {
            const fileKey = providerToWorkspaceKey(provider);
            delete store[tenantId].aiKeys![fileKey];
            await writeWorkspaceStore(store);
        }

        return { success: true };
    }

    async testConnection(tenantId: string, provider: string): Promise<{ success: boolean; error?: string }> {
        const providerMap: Record<string, string> = {
            gemini: 'Google',
            groq: 'Groq',
            openrouter: 'OpenRouter',
            doubleword: 'Doubleword',
            nvidia: 'Nvidia',
            google: 'Google',
            openai: 'OpenAI',
        };
        provider = providerMap[provider] || provider;
        const keys = await this.getKeys(tenantId, provider);
        if (!keys.length) return { success: false, error: 'API key not found' };

        try {
            let lastError = '';
            for (const key of keys) {
                try {
                    switch (provider) {
                        case 'Google':
                            await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GOOGLE_MODEL || 'gemini-2.5-flash'}:generateContent?key=${key}`, {
                                contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
                            });
                            break;
                        case 'OpenAI':
                            await axios.post('https://api.openai.com/v1/chat/completions', {
                                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                                messages: [{ role: 'user', content: 'Reply with OK.' }],
                                max_tokens: 8,
                            }, { headers: { Authorization: `Bearer ${key}` } });
                            break;
                        case 'Groq':
                            await axios.post(`${trimBaseUrl(process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1')}/chat/completions`, {
                                model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
                                messages: [{ role: 'user', content: 'Reply with OK.' }],
                                max_tokens: 8,
                            }, { headers: { Authorization: `Bearer ${key}` } });
                            break;
                        case 'OpenRouter':
                            await axios.post(`${trimBaseUrl(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1')}/chat/completions`, {
                                model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
                                messages: [{ role: 'user', content: 'Reply with OK.' }],
                                max_tokens: 8,
                            }, {
                                headers: {
                                    Authorization: `Bearer ${key}`,
                                    'HTTP-Referer': process.env.APP_URL || 'https://app.propai.live',
                                    'X-Title': 'PropAI Pulse',
                                },
                            });
                            break;
                        case 'Doubleword':
                            await axios.post(`${trimBaseUrl(process.env.DOUBLEWORD_BASE_URL || 'https://api.doubleword.ai/v1')}/chat/completions`, {
                                model: process.env.DOUBLEWORD_MODEL || 'Qwen/Qwen3-14B-FP8',
                                messages: [{ role: 'user', content: 'Reply with OK.' }],
                                max_tokens: 8,
                            }, { headers: { Authorization: `Bearer ${key}` } });
                            break;
                        case 'Nvidia':
                            await axios.post(`${trimBaseUrl(process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1')}/chat/completions`, {
                                model: process.env.NVIDIA_MODEL || 'meta/llama-4-maverick-17b-128e-instruct',
                                messages: [{ role: 'user', content: 'Reply with OK.' }],
                                max_tokens: 8,
                            }, { headers: { Authorization: `Bearer ${key}` } });
                            break;
                        default:
                            return { success: false, error: 'Unsupported provider' };
                    }
                    return { success: true };
                } catch (error: any) {
                    lastError = summarizeProviderError(error);
                }
            }
            return { success: false, error: lastError || 'All API keys failed connection test' };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}
export const keyService = new KeyService();
