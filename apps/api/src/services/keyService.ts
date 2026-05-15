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
        .map((entry) => entry.trim())
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

export class KeyService {
    async saveKey(tenantId: string, provider: string, key: string): Promise<{ success: boolean; error?: string }> {
        const updatedAt = new Date().toISOString();
        const fileKey = providerToWorkspaceKey(provider);

        const store = await readWorkspaceStore();
        store[tenantId] = {
            ...store[tenantId],
            aiKeys: {
                ...(store[tenantId]?.aiKeys || {}),
                [fileKey]: key,
            },
            updatedAt,
        };

        let dbError: string | null = null;
        try {
            const { error } = await getKeyStoreClient()
                .from(KEY_TABLE)
                .upsert({ tenant_id: tenantId, provider, key, updated_at: updatedAt }, { onConflict: 'tenant_id, provider' });

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

        if (fileError && dbError) {
            return { success: false, error: `${fileError}; ${dbError}` };
        }

        if (dbError) {
            return { success: false, error: dbError };
        }

        return { success: true };
    }

    async getKey(tenantId: string, provider: string): Promise<string | null> {
        const keys = await this.getKeys(tenantId, provider);
        return keys[0] || null;
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

    async testConnection(tenantId: string, provider: string): Promise<{ success: boolean; error?: string }> {
        const keys = await this.getKeys(tenantId, provider);
        if (!keys.length) return { success: false, error: 'API key not found' };

        try {
            let lastError = '';
            for (const key of keys) {
                try {
                    switch (provider) {
                        case 'Google':
                            await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                            break;
                        case 'OpenAI':
                            await axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
                            break;
                        case 'Groq':
                            await axios.get(`${process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
                            break;
                        case 'OpenRouter':
                            await axios.get(`${process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
                            break;
                        case 'Doubleword':
                            await axios.get(`${process.env.DOUBLEWORD_BASE_URL || 'https://api.doubleword.ai/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
                            break;
                        default:
                            return { success: false, error: 'Unsupported provider' };
                    }
                    return { success: true };
                } catch (error: any) {
                    lastError = error.message;
                }
            }
            return { success: false, error: lastError || 'All API keys failed connection test' };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}
export const keyService = new KeyService();
