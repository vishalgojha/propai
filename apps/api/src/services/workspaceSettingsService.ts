import fs from 'fs/promises';
import path from 'path';
import { supabase, supabaseAdmin } from '../config/supabase';

export type AIConfig = {
    concentrate?: string;
    gemini?: string;
    groq?: string;
    openrouter?: string;
    doubleword?: string;
};

export type WorkspaceSettings = {
    autoSyncPeriod: string;
    deduplication: boolean;
    noiseFilter: boolean;
    tokenLogic: string;
    contextBuffer: string;
    defaultModel: string;
    elevenlabsKey: string;
    primaryVoice: string;
    autoRead: boolean;
    broadcastVoice: boolean;
    dailyBriefing: boolean;
    highValueLeads: boolean;
    performanceAnalytics: boolean;
};

export type SettingsStore = Record<string, {
    settings: Partial<WorkspaceSettings>;
    aiKeys: AIConfig;
    updatedAt: string;
}>;

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'workspace-settings.json');
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const SETTINGS_TABLE = 'workspace_settings';

export const DEFAULT_SETTINGS: WorkspaceSettings = {
    autoSyncPeriod: 'Auto',
    deduplication: true,
    noiseFilter: true,
    tokenLogic: 'Precision',
    contextBuffer: 'Optimized',
    defaultModel: GEMINI_DEFAULT_MODEL,
    elevenlabsKey: '',
    primaryVoice: 'Callum',
    autoRead: false,
    broadcastVoice: true,
    dailyBriefing: true,
    highValueLeads: true,
    performanceAnalytics: false,
};

export function normalizeDefaultModel(value?: string | null) {
    const normalized = (value || '').trim().toLowerCase();

    switch (normalized) {
        case 'concentrate':
        case 'concentrate-auto':
            return 'concentrate';
        case '':
        case 'auto':
        case 'google':
        case 'gemini':
        case 'gemini-2.5-flash':
        case 'models/gemini-2.5-flash':
        case 'gemini 2.5 flash':
        case 'google gemini':
            return GEMINI_DEFAULT_MODEL;
        case 'groq':
        case 'llama3-8b-8192':
        case 'groq llama3-8b-8192':
            return 'groq';
        case 'openrouter':
        case 'openai/gpt-4o-mini':
        case 'openrouter openai/gpt-4o-mini':
            return 'openrouter';
        case 'doubleword':
        case 'qwen3-235b':
        case 'kimi-k2':
            return 'doubleword';
        default:
            return GEMINI_DEFAULT_MODEL;
    }
}

async function readStore(): Promise<SettingsStore> {
    try {
        const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed as SettingsStore;
        }
    } catch {
        // ignore missing or invalid file
    }

    return {};
}

async function writeStore(store: SettingsStore) {
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function getSettingsStoreClient() {
    return supabaseAdmin ?? supabase;
}

function isMissingRelationError(error: any) {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
}

export function sanitizeSettings(settings: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...settings,
        defaultModel: normalizeDefaultModel(settings.defaultModel),
        elevenlabsKey: typeof settings.elevenlabsKey === 'string' ? settings.elevenlabsKey : DEFAULT_SETTINGS.elevenlabsKey,
    };
}

export async function getWorkspaceSettingsRecord(tenantId: string) {
    try {
        const { data, error } = await getSettingsStoreClient()
            .from(SETTINGS_TABLE)
            .select('settings, ai_keys, updated_at')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (error && !isMissingRelationError(error)) {
            console.error('[WorkspaceSettings] Failed to load DB settings', error);
        }

        if (data) {
            const raw = (data as any).ai_keys;
            const storedKeys: AIConfig = raw && typeof raw === 'object' ? raw : {};
            return {
                settings: sanitizeSettings((data as any).settings || {}),
                aiKeys: {
                    concentrate: typeof storedKeys.concentrate === 'string' ? storedKeys.concentrate : '',
                    gemini: typeof storedKeys.gemini === 'string' ? storedKeys.gemini : '',
                    groq: typeof storedKeys.groq === 'string' ? storedKeys.groq : '',
                    openrouter: typeof storedKeys.openrouter === 'string' ? storedKeys.openrouter : '',
                    doubleword: typeof storedKeys.doubleword === 'string' ? storedKeys.doubleword : '',
                },
                updatedAt: (data as any).updated_at || null,
            };
        }
    } catch (error) {
        console.error('[WorkspaceSettings] Unexpected DB load failure', error);
    }

    const store = await readStore();
    const record = store[tenantId];

    return {
        settings: sanitizeSettings(record?.settings || {}),
            aiKeys: {
                concentrate: record?.aiKeys?.concentrate || '',
                gemini: record?.aiKeys?.gemini || '',
                groq: record?.aiKeys?.groq || '',
                openrouter: record?.aiKeys?.openrouter || '',
                doubleword: record?.aiKeys?.doubleword || '',
            },
        updatedAt: record?.updatedAt || null,
    };
}

export async function saveWorkspaceSettingsRecord(tenantId: string, settings: Partial<WorkspaceSettings>, aiKeys: AIConfig) {
    const sanitizedSettings = sanitizeSettings(settings);
    const store = await readStore();

    store[tenantId] = {
        settings: sanitizedSettings,
        aiKeys: {
            concentrate: typeof aiKeys.concentrate === 'string' ? aiKeys.concentrate : '',
            gemini: typeof aiKeys.gemini === 'string' ? aiKeys.gemini : '',
            groq: typeof aiKeys.groq === 'string' ? aiKeys.groq : '',
            openrouter: typeof aiKeys.openrouter === 'string' ? aiKeys.openrouter : '',
            doubleword: typeof aiKeys.doubleword === 'string' ? aiKeys.doubleword : '',
        },
        updatedAt: new Date().toISOString(),
    };

    let dbError: string | null = null;
    try {
        const { error } = await getSettingsStoreClient()
            .from(SETTINGS_TABLE)
            .upsert({
                tenant_id: tenantId,
                settings: sanitizedSettings,
                ai_keys: store[tenantId].aiKeys,
                updated_at: store[tenantId].updatedAt,
            }, { onConflict: 'tenant_id' });

        if (error && !isMissingRelationError(error)) {
            dbError = error.message;
        }
    } catch (error: any) {
        dbError = error?.message || 'Failed to persist workspace settings in database';
    }

    try {
        await writeStore(store);
    } catch (error: any) {
        if (!dbError) {
            dbError = error?.message || 'Failed to persist workspace settings locally';
        }
    }

    if (dbError) {
        console.error('[WorkspaceSettings] Save warning', dbError);
        throw new Error(dbError);
    }

    return store[tenantId];
}

export async function getWorkspaceDefaultModel(tenantId: string) {
    const record = await getWorkspaceSettingsRecord(tenantId);
    return record.settings.defaultModel;
}

export async function getWorkspaceExplicitDefaultModel(tenantId: string): Promise<string | null> {
    try {
        const { data, error } = await getSettingsStoreClient()
            .from(SETTINGS_TABLE)
            .select('settings')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (!error && data) {
            const rawValue = (data as any)?.settings?.defaultModel;
            return typeof rawValue === 'string' && rawValue.trim()
                ? normalizeDefaultModel(rawValue)
                : null;
        }
    } catch (error) {
        console.error('[WorkspaceSettings] Unexpected DB defaultModel load failure', error);
    }

    const store = await readStore();
    const rawValue = store[tenantId]?.settings?.defaultModel;
    return typeof rawValue === 'string' && rawValue.trim()
        ? normalizeDefaultModel(rawValue)
        : null;
}
