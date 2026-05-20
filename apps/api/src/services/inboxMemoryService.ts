import crypto from 'crypto';
import { aiService } from './aiService';
import {
    type InboxIntelligenceSettings,
    type InboxThreadMemory,
    DEFAULT_SETTINGS,
    getWorkspaceSettingsRecord,
    saveWorkspaceSettingsRecord,
} from './workspaceSettingsService';

type ThreadMessageSnippet = {
    text?: string | null;
    sender?: string | null;
    direction?: 'inbound' | 'outbound' | null;
    timestamp?: string | null;
};

type ThreadLike = {
    id: string;
    remoteJid?: string | null;
    title?: string | null;
    preview?: string | null;
};

type ThreadWithRecentMessages = ThreadLike & {
    recentMessages?: ThreadMessageSnippet[] | null;
};

export type InboxThreadIntel = Omit<InboxThreadMemory, 'updatedAt' | 'sourceHash' | 'analysis'>;

type AIThreadAnalysis = {
    state: 'allowed' | 'held' | 'ignored';
    category: 'real_estate_lead' | 'inventory_blast' | 'newsletter' | 'junk' | 'personal' | 'unclear';
    reason: string;
    confidence: 'high' | 'medium';
    summary: string;
    contact: {
        phone: string | null;
        role: 'broker' | 'buyer' | 'seller' | 'tenant' | 'owner' | 'unknown';
        confidence: 'high' | 'medium';
        localities: string[];
        propertyTypes: string[];
        budgets: string[];
    };
    thread: {
        requirementSignals: string[];
    };
};

function getSessionKey(sessionLabel?: string | null) {
    return sessionLabel && sessionLabel.trim() ? sessionLabel.trim() : 'workspace';
}

function normalizePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits : null;
}

function getDirectPhoneFromJid(value?: string | null) {
    const jid = String(value || '').trim().toLowerCase();
    if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@c.us')) {
        return null;
    }

    return normalizePhone(jid.split('@')[0]);
}

function compactText(value?: string | null, maxLength = 220) {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    if (!compact) {
        return '';
    }

    return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}...` : compact;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 6) {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!normalized) {
            continue;
        }
        if (result.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
            continue;
        }
        result.push(normalized);
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}

function buildSourceHash(thread: ThreadWithRecentMessages) {
    const payload = JSON.stringify({
        id: thread.id,
        remoteJid: thread.remoteJid || null,
        title: compactText(thread.title, 120),
        preview: compactText(thread.preview, 160),
        recentMessages: Array.isArray(thread.recentMessages)
            ? thread.recentMessages.slice(0, 10).map((message) => ({
                text: compactText(message.text, 220),
                sender: compactText(message.sender, 80),
                direction: message.direction || null,
                timestamp: message.timestamp || null,
            }))
            : [],
    });

    return crypto.createHash('sha1').update(payload).digest('hex');
}

function buildPrompt(thread: ThreadWithRecentMessages) {
    const messages = (Array.isArray(thread.recentMessages) ? thread.recentMessages : [])
        .slice(0, 10)
        .map((message, index) => [
            `Message ${index + 1}`,
            `direction: ${message.direction || 'unknown'}`,
            `sender: ${compactText(message.sender, 80) || 'unknown'}`,
            `timestamp: ${message.timestamp || 'unknown'}`,
            `text: ${compactText(message.text, 280) || '(empty)'}`,
        ].join('\n'))
        .join('\n\n');

    return `Analyze this private WhatsApp direct-message thread for a broker workspace.

Return only valid JSON with this exact shape:
{
  "state": "allowed" | "held" | "ignored",
  "category": "real_estate_lead" | "inventory_blast" | "newsletter" | "junk" | "personal" | "unclear",
  "reason": "short explanation",
  "confidence": "high" | "medium",
  "summary": "1-2 sentence factual summary, or 'Unclear thread context.'",
  "contact": {
    "phone": "digits only or null",
    "role": "broker" | "buyer" | "seller" | "tenant" | "owner" | "unknown",
    "confidence": "high" | "medium",
    "localities": ["string"],
    "propertyTypes": ["string"],
    "budgets": ["string"]
  },
  "thread": {
    "requirementSignals": ["string"]
  }
}

Rules:
- Use only evidence from the provided thread.
- If the thread is not clearly real estate, set state to "held".
- Do not invent locality, budget, or property data.
- If uncertain, prefer empty arrays and "unknown".
- For newsletter, marketing, training, hiring, inspirational, or generic promo content, classify as "newsletter" or "junk" and state "held".
- Phone must be null unless a real direct-contact phone is evident.

Thread metadata:
- title: ${compactText(thread.title, 120) || 'unknown'}
- preview: ${compactText(thread.preview, 160) || 'unknown'}
- remoteJid: ${thread.remoteJid || thread.id}

Recent messages:
${messages || 'No recent messages available.'}`;
}

function parseJson<T>(value: string): T {
    const trimmed = value.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    return JSON.parse(candidate) as T;
}

function sanitizeAIAnalysis(raw: AIThreadAnalysis, thread: ThreadWithRecentMessages): AIThreadAnalysis {
    const phone = normalizePhone(raw?.contact?.phone) || getDirectPhoneFromJid(thread.remoteJid || thread.id);
    return {
        state: raw?.state === 'allowed' || raw?.state === 'held' || raw?.state === 'ignored' ? raw.state : 'held',
        category: raw?.category === 'real_estate_lead'
            || raw?.category === 'inventory_blast'
            || raw?.category === 'newsletter'
            || raw?.category === 'junk'
            || raw?.category === 'personal'
            ? raw.category
            : 'unclear',
        reason: compactText(raw?.reason, 220) || 'AI review pending.',
        confidence: raw?.confidence === 'high' ? 'high' : 'medium',
        summary: compactText(raw?.summary, 260) || 'Unclear thread context.',
        contact: {
            phone,
            role: raw?.contact?.role === 'broker'
                || raw?.contact?.role === 'buyer'
                || raw?.contact?.role === 'seller'
                || raw?.contact?.role === 'tenant'
                || raw?.contact?.role === 'owner'
                ? raw.contact.role
                : 'unknown',
            confidence: raw?.contact?.confidence === 'high' ? 'high' : 'medium',
            localities: uniqueStrings(raw?.contact?.localities || [], 4),
            propertyTypes: uniqueStrings(raw?.contact?.propertyTypes || [], 4),
            budgets: uniqueStrings(raw?.contact?.budgets || [], 3),
        },
        thread: {
            requirementSignals: uniqueStrings(raw?.thread?.requirementSignals || [], 6),
        },
    };
}

async function analyzeThreadWithAI(workspaceOwnerId: string, thread: ThreadWithRecentMessages): Promise<AIThreadAnalysis> {
    const systemPrompt = 'You classify chaotic WhatsApp inbox threads for a real-estate broker workspace. You must be conservative, factual, and never invent fields.';
    const response = await aiService.chat(
        buildPrompt(thread),
        'doubleword',
        'inbox_intelligence',
        workspaceOwnerId,
        systemPrompt,
    );

    return sanitizeAIAnalysis(parseJson<AIThreadAnalysis>(response.text), thread);
}

function buildMemoryFromAI(thread: ThreadWithRecentMessages, sourceHash: string, analysis: AIThreadAnalysis): InboxThreadMemory {
    const recentMessages = Array.isArray(thread.recentMessages) ? thread.recentMessages : [];
    const inboundMessages = recentMessages.filter((message) => message.direction !== 'outbound');
    const outboundMessages = recentMessages.filter((message) => message.direction === 'outbound');

    return {
        sourceHash,
        analysis: {
            state: analysis.state,
            category: analysis.category,
            reason: analysis.reason,
            confidence: analysis.confidence,
        },
        summary: analysis.summary,
        contact: analysis.contact,
        thread: {
            inboundCount: inboundMessages.length,
            outboundCount: outboundMessages.length,
            lastInboundAt: inboundMessages[0]?.timestamp || null,
            lastOutboundAt: outboundMessages[0]?.timestamp || null,
            requirementSignals: analysis.thread.requirementSignals,
        },
        updatedAt: new Date().toISOString(),
    };
}

function toIntel(memory: InboxThreadMemory): InboxThreadIntel {
    return {
        summary: memory.summary,
        contact: memory.contact,
        thread: memory.thread,
    };
}

export class InboxMemoryService {
    async decorateThreads<T extends ThreadWithRecentMessages>(
        workspaceOwnerId: string,
        threads: T[],
        sessionLabel?: string | null,
    ): Promise<Array<Omit<T, 'recentMessages'> & { intel: InboxThreadIntel }>> {
        const record = await getWorkspaceSettingsRecord(workspaceOwnerId);
        const config: InboxIntelligenceSettings = record.settings.inboxIntelligence
            ?? (DEFAULT_SETTINGS.inboxIntelligence as InboxIntelligenceSettings);
        const sessionKey = getSessionKey(sessionLabel);
        const existingSession = config.sessions[sessionKey] || { threads: {}, memories: {} };
        const storedMemories = existingSession.memories || {};
        const nextMemories: Record<string, InboxThreadMemory> = { ...storedMemories };
        let hasChanges = false;

        const decoratedThreads = await Promise.all(threads.map(async (thread) => {
            const sourceHash = buildSourceHash(thread);
            const stored = storedMemories[thread.id] || null;

            if (!stored || stored.sourceHash !== sourceHash || !stored.analysis) {
                try {
                    nextMemories[thread.id] = buildMemoryFromAI(
                        thread,
                        sourceHash,
                        await analyzeThreadWithAI(workspaceOwnerId, thread),
                    );
                    hasChanges = true;
                } catch (error) {
                    console.error('[InboxMemory] AI analysis failed', { threadId: thread.id, error });
                    if (!stored) {
                        nextMemories[thread.id] = {
                            sourceHash,
                            analysis: {
                                state: 'held',
                                category: 'unclear',
                                reason: 'AI analysis is temporarily unavailable, so this thread is being held until it can be reviewed again.',
                                confidence: 'medium',
                            },
                            summary: 'AI analysis pending.',
                            contact: {
                                phone: getDirectPhoneFromJid(thread.remoteJid || thread.id),
                                role: 'unknown',
                                confidence: 'medium',
                                localities: [],
                                propertyTypes: [],
                                budgets: [],
                            },
                            thread: {
                                inboundCount: 0,
                                outboundCount: 0,
                                lastInboundAt: null,
                                lastOutboundAt: null,
                                requirementSignals: [],
                            },
                            updatedAt: new Date().toISOString(),
                        };
                        hasChanges = true;
                    }
                }
            }

            const effective = nextMemories[thread.id] || stored;
            const { recentMessages, ...rest } = thread;
            return {
                ...(rest as Omit<T, 'recentMessages'>),
                intel: effective ? toIntel(effective) : {
                    summary: 'AI analysis pending.',
                    contact: {
                        phone: getDirectPhoneFromJid(thread.remoteJid || thread.id),
                        role: 'unknown',
                        confidence: 'medium',
                        localities: [],
                        propertyTypes: [],
                        budgets: [],
                    },
                    thread: {
                        inboundCount: 0,
                        outboundCount: 0,
                        lastInboundAt: null,
                        lastOutboundAt: null,
                        requirementSignals: [],
                    },
                },
            };
        }));

        if (hasChanges) {
            await saveWorkspaceSettingsRecord(workspaceOwnerId, {
                inboxIntelligence: {
                    ...config,
                    sessions: {
                        ...config.sessions,
                        [sessionKey]: {
                            threads: existingSession.threads || {},
                            memories: nextMemories,
                        },
                    },
                },
            }, record.aiKeys);
        }

        return decoratedThreads;
    }
}

export const inboxMemoryService = new InboxMemoryService();
