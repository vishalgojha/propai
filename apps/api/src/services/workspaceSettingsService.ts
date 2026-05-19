import fs from 'fs/promises';
import path from 'path';
import { supabase, supabaseAdmin } from '../config/supabase';

export type AIConfig = {
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
    inboxIntelligence?: InboxIntelligenceSettings;
};

export type InboxThreadState = 'allowed' | 'held' | 'ignored';

export type InboxThreadOverride = {
    state: InboxThreadState;
    updatedAt: string;
    reason?: string | null;
};

export type InboxSessionGovernance = {
    threads: Record<string, InboxThreadOverride>;
};

export type InboxIntelligenceSettings = {
    mode: 'allow_relevant_only';
    blockedDomains: string[];
    filterEmojiHeavy: boolean;
    filterLowSignal: boolean;
    sessions: Record<string, InboxSessionGovernance>;
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
    inboxIntelligence: {
        mode: 'allow_relevant_only',
        blockedDomains: ['youtube.com', 'youtu.be', 'instagram.com', 'instagr.am', 'facebook.com', 'fb.watch', 'x.com', 'twitter.com'],
        filterEmojiHeavy: true,
        filterLowSignal: true,
        sessions: {},
    },
};

export function normalizeDefaultModel(value?: string | null) {
    const normalized = (value || '').trim().toLowerCase();

    switch (normalized) {
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
        case 'qwen/qwen3.6-35b-a3b-fp8':
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

function sanitizeInboxIntelligenceSettings(value: unknown): InboxIntelligenceSettings {
    const fallback = DEFAULT_SETTINGS.inboxIntelligence as InboxIntelligenceSettings;
    const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const rawSessions = input.sessions && typeof input.sessions === 'object'
        ? input.sessions as Record<string, unknown>
        : {};

    const sessions = Object.entries(rawSessions).reduce<Record<string, InboxSessionGovernance>>((acc, [sessionKey, sessionValue]) => {
        if (!sessionValue || typeof sessionValue !== 'object') {
            return acc;
        }

        const rawThreads = (sessionValue as Record<string, unknown>).threads;
        const threads = rawThreads && typeof rawThreads === 'object'
            ? Object.entries(rawThreads as Record<string, unknown>).reduce<Record<string, InboxThreadOverride>>((threadAcc, [threadId, threadValue]) => {
                if (!threadValue || typeof threadValue !== 'object') {
                    return threadAcc;
                }

                const candidate = threadValue as Record<string, unknown>;
                const state = candidate.state;
                if (state !== 'allowed' && state !== 'held' && state !== 'ignored') {
                    return threadAcc;
                }

                threadAcc[threadId] = {
                    state,
                    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
                        ? candidate.updatedAt
                        : new Date(0).toISOString(),
                    reason: typeof candidate.reason === 'string' ? candidate.reason : null,
                };
                return threadAcc;
            }, {})
            : {};

        acc[sessionKey] = { threads };
        return acc;
    }, {});

    return {
        mode: input.mode === 'allow_relevant_only' ? 'allow_relevant_only' : fallback.mode,
        blockedDomains: Array.isArray(input.blockedDomains)
            ? input.blockedDomains.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
            : fallback.blockedDomains,
        filterEmojiHeavy: typeof input.filterEmojiHeavy === 'boolean' ? input.filterEmojiHeavy : fallback.filterEmojiHeavy,
        filterLowSignal: typeof input.filterLowSignal === 'boolean' ? input.filterLowSignal : fallback.filterLowSignal,
        sessions,
    };
}

export function sanitizeSettings(settings: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...settings,
        defaultModel: normalizeDefaultModel(settings.defaultModel),
        elevenlabsKey: typeof settings.elevenlabsKey === 'string' ? settings.elevenlabsKey : DEFAULT_SETTINGS.elevenlabsKey,
        inboxIntelligence: sanitizeInboxIntelligenceSettings(settings.inboxIntelligence),
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
                gemini: record?.aiKeys?.gemini || '',
                groq: record?.aiKeys?.groq || '',
                openrouter: record?.aiKeys?.openrouter || '',
                doubleword: record?.aiKeys?.doubleword || '',
            },
        updatedAt: record?.updatedAt || null,
    };
}

export async function saveWorkspaceSettingsRecord(tenantId: string, settings: Partial<WorkspaceSettings>, aiKeys: AIConfig) {
    const existingRecord = await getWorkspaceSettingsRecord(tenantId);
    const sanitizedSettings = sanitizeSettings({
        ...existingRecord.settings,
        ...settings,
        inboxIntelligence: settings.inboxIntelligence ?? existingRecord.settings.inboxIntelligence,
    });
    const store = await readStore();

    store[tenantId] = {
        settings: sanitizedSettings,
        aiKeys: {
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
