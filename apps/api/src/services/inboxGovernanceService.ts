import {
    type InboxIntelligenceSettings,
    type InboxThreadMemory,
    type InboxThreadOverride,
    type InboxThreadState,
    DEFAULT_SETTINGS,
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

function getSessionKey(sessionLabel?: string | null) {
    return sessionLabel && sessionLabel.trim() ? sessionLabel.trim() : 'workspace';
}

function inferThreadDecision(memory?: InboxThreadMemory | null): Omit<InboxGovernanceDecision, 'override'> {
    if (memory?.analysis) {
        return {
            state: memory.analysis.state,
            reason: memory.analysis.reason,
            confidence: memory.analysis.confidence,
        };
    }

    return {
        state: 'held',
        reason: 'AI review is pending for this thread, so it is being held outside the inbox for now.',
        confidence: 'medium',
    };
}

export class InboxGovernanceService {
    async getConfig(workspaceOwnerId: string) {
        const record = await getWorkspaceSettingsRecord(workspaceOwnerId);
        return record.settings.inboxIntelligence
            ?? (DEFAULT_SETTINGS.inboxIntelligence as InboxIntelligenceSettings);
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
        const config = record.settings.inboxIntelligence
            ?? (DEFAULT_SETTINGS.inboxIntelligence as InboxIntelligenceSettings);
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
                    memories: config.sessions[sessionKey]?.memories || {},
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
        const sessionData = config.sessions[getSessionKey(sessionLabel)] || { threads: {}, memories: {} };
        const sessionOverrides = sessionData.threads || {};
        const sessionMemories = sessionData.memories || {};

        return threads.map((thread) => {
            const inferred = inferThreadDecision(sessionMemories[thread.id] || null);
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
