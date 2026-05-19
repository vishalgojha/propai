import {
    type InboxIntelligenceSettings,
    type InboxThreadOverride,
    type InboxThreadState,
    getWorkspaceSettingsRecord,
    saveWorkspaceSettingsRecord,
} from './workspaceSettingsService';

type ThreadLike = {
    id: string;
    remoteJid?: string | null;
    title?: string | null;
    preview?: string | null;
    type?: 'direct' | 'group' | string | null;
};

type InboxGovernanceDecision = {
    state: InboxThreadState;
    reason: string;
    confidence: 'high' | 'medium';
    override: boolean;
};

const REAL_ESTATE_KEYWORDS = [
    'buyer',
    'seller',
    'tenant',
    'landlord',
    'owner',
    'broker',
    'realtor',
    'agent',
    'property',
    'listing',
    'inventory',
    'rent',
    'rental',
    'lease',
    'sale',
    'resale',
    'bhk',
    'flat',
    'apartment',
    'villa',
    'plot',
    'commercial',
    'office',
    'warehouse',
    'shop',
    'sqft',
    'budget',
    'cr',
    'lac',
    'lakh',
    'crore',
    'locality',
    'site visit',
];

const LOW_SIGNAL_PATTERNS = [
    'good morning',
    'good night',
    'happy birthday',
    'happy anniversary',
    'festival wishes',
    'okay',
    'thanks',
    'thank you',
];

function getSessionKey(sessionLabel?: string | null) {
    return sessionLabel && sessionLabel.trim() ? sessionLabel.trim() : 'workspace';
}

function isEmojiHeavy(text?: string | null) {
    const value = String(text || '').trim();
    if (!value) {
        return false;
    }

    const emojiMatches = value.match(/[\u{1F300}-\u{1FAFF}]/gu) || [];
    const alphaNumeric = value.replace(/[^a-z0-9]/gi, '');
    return emojiMatches.length >= 2 && alphaNumeric.length <= Math.max(4, Math.floor(value.length * 0.25));
}

function inferThreadDecision(thread: ThreadLike, config: InboxIntelligenceSettings): Omit<InboxGovernanceDecision, 'override'> {
    const haystack = `${thread.title || ''} ${thread.preview || ''}`.toLowerCase();
    const hasBlockedLink = config.blockedDomains.some((pattern) => haystack.includes(pattern));
    const hasLowSignalPhrase = config.filterLowSignal && LOW_SIGNAL_PATTERNS.some((pattern) => haystack.includes(pattern));
    const hasRealEstateKeyword = REAL_ESTATE_KEYWORDS.some((pattern) => haystack.includes(pattern))
        || /\b\d+\s*bhk\b/.test(haystack)
        || /\b\d+(\.\d+)?\s*(cr|crore|lac|lakh)\b/.test(haystack);

    if (hasBlockedLink && !hasRealEstateKeyword) {
        return {
            state: 'held',
            reason: 'AI held this thread because the latest message looks like a social link, not a real-estate lead for the inbox.',
            confidence: 'high',
        };
    }

    if ((hasLowSignalPhrase || (config.filterEmojiHeavy && isEmojiHeavy(thread.preview))) && !hasRealEstateKeyword) {
        return {
            state: 'held',
            reason: 'AI held this thread because it looks like low-signal chatter instead of business context for the inbox.',
            confidence: 'medium',
        };
    }

    if (!hasRealEstateKeyword) {
        return {
            state: 'held',
            reason: 'AI held this thread until it sees a real-estate signal or you explicitly allow it into the inbox.',
            confidence: 'medium',
        };
    }

    return {
        state: 'allowed',
        reason: 'AI marked this thread as real-estate relevant and safe to keep in your private inbox.',
        confidence: 'high',
    };
}

export class InboxGovernanceService {
    async getConfig(workspaceOwnerId: string) {
        const record = await getWorkspaceSettingsRecord(workspaceOwnerId);
        return record.settings.inboxIntelligence as InboxIntelligenceSettings;
    }

    async getThreadOverride(workspaceOwnerId: string, chatId: string, sessionLabel?: string | null): Promise<InboxThreadOverride | null> {
        const config = await this.getConfig(workspaceOwnerId);
        const session = config.sessions[getSessionKey(sessionLabel)];
        return session?.threads?.[chatId] || null;
    }

    async setThreadState(input: {
        workspaceOwnerId: string;
        chatId: string;
        state: InboxThreadState;
        sessionLabel?: string | null;
        reason?: string | null;
    }) {
        const record = await getWorkspaceSettingsRecord(input.workspaceOwnerId);
        const config = record.settings.inboxIntelligence as InboxIntelligenceSettings;
        const sessionKey = getSessionKey(input.sessionLabel);
        const nextConfig: InboxIntelligenceSettings = {
            ...config,
            sessions: {
                ...config.sessions,
                [sessionKey]: {
                    threads: {
                        ...(config.sessions[sessionKey]?.threads || {}),
                        [input.chatId]: {
                            state: input.state,
                            updatedAt: new Date().toISOString(),
                            reason: typeof input.reason === 'string' ? input.reason : null,
                        },
                    },
                },
            },
        };

        await saveWorkspaceSettingsRecord(input.workspaceOwnerId, {
            inboxIntelligence: nextConfig,
        }, record.aiKeys);

        return nextConfig.sessions[sessionKey].threads[input.chatId];
    }

    async getWorkspaceGovernanceSummary(workspaceOwnerId: string, sessionLabel?: string | null) {
        const config = await this.getConfig(workspaceOwnerId);
        const sessionKey = getSessionKey(sessionLabel);
        return {
            sessionKey,
            mode: config.mode,
            blockedDomains: config.blockedDomains,
            filterEmojiHeavy: config.filterEmojiHeavy,
            filterLowSignal: config.filterLowSignal,
            overrides: config.sessions[sessionKey]?.threads || {},
        };
    }

    async decorateThreads(workspaceOwnerId: string, threads: ThreadLike[], sessionLabel?: string | null) {
        const config = await this.getConfig(workspaceOwnerId);
        const sessionOverrides = config.sessions[getSessionKey(sessionLabel)]?.threads || {};

        return threads.map((thread) => {
            const inferred = inferThreadDecision(thread, config);
            const override = sessionOverrides[thread.id] || null;
            const decision: InboxGovernanceDecision = override
                ? {
                    state: override.state,
                    reason: override.reason || inferred.reason,
                    confidence: inferred.confidence,
                    override: true,
                }
                : {
                    ...inferred,
                    override: false,
                };

            return {
                ...thread,
                governance: decision,
            };
        });
    }
}

export const inboxGovernanceService = new InboxGovernanceService();
