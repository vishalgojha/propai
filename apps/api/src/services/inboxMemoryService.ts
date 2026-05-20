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

type ContactRole = 'broker' | 'buyer' | 'seller' | 'tenant' | 'owner' | 'unknown';

export type InboxThreadIntel = Omit<InboxThreadMemory, 'updatedAt'>;

const PROPERTY_KEYWORDS = [
    '1 bhk',
    '2 bhk',
    '3 bhk',
    '4 bhk',
    'bhk',
    'flat',
    'apartment',
    'villa',
    'plot',
    'office',
    'shop',
    'warehouse',
    'commercial',
    'rental',
    'rent',
];

const LOCALITY_STOP_WORDS = new Set([
    'a', 'an', 'and', 'for', 'from', 'is', 'looking', 'need', 'needs', 'of', 'on',
    'please', 'property', 'requirement', 'required', 'the', 'this', 'urgent', 'want',
]);

const NON_LOCALITY_PATTERNS = /\b(?:ai|mba|internship|certificate|certifications?|course|college|university|subject|newsletter|learning|portfolio|skills|ctc|salary|job|career)\b/i;

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasKeywordMatch(haystack: string, keyword: string) {
    const pattern = keyword.includes(' ')
        ? `(^|[^a-z0-9])${escapeRegex(keyword)}($|[^a-z0-9])`
        : `\\b${escapeRegex(keyword)}\\b`;
    return new RegExp(pattern, 'i').test(haystack);
}

function getSessionKey(sessionLabel?: string | null) {
    return sessionLabel && sessionLabel.trim() ? sessionLabel.trim() : 'workspace';
}

function normalizePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits : null;
}

function compactText(value?: string | null, maxLength = 160) {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    if (!compact) {
        return '';
    }
    return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}...` : compact;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 4) {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (!normalized) {
            continue;
        }
        if (result.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
            continue;
        }
        result.push(normalized);
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}

function extractBudgets(texts: string[]) {
    const matches: string[] = [];
    for (const text of texts) {
        const found = text.match(/\b\d+(?:\.\d+)?\s*(?:cr|crore|lac|lakh|k)\b/gi) || [];
        for (const budget of found) {
            matches.push(budget.replace(/\s+/g, ' ').trim());
        }
    }
    return uniqueStrings(matches, 3);
}

function extractPropertyTypes(texts: string[]) {
    const matches: string[] = [];
    for (const text of texts) {
        const haystack = text.toLowerCase();
        for (const keyword of PROPERTY_KEYWORDS) {
            if (hasKeywordMatch(haystack, keyword)) {
                matches.push(keyword.toUpperCase().includes('BHK')
                    ? keyword.toUpperCase()
                    : keyword.replace(/\b\w/g, (char) => char.toUpperCase()));
            }
        }
    }
    return uniqueStrings(matches, 4);
}

function extractLocalities(texts: string[]) {
    const matches: string[] = [];
    for (const text of texts) {
        const found = text.match(/\b(?:in|at|near|around)\s+([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){0,3})/gi) || [];
        for (const entry of found) {
            const normalized = entry.replace(/\b(?:in|at|near|around)\b/i, '').trim();
            if (!normalized) {
                continue;
            }
            const lower = normalized.toLowerCase();
            if (LOCALITY_STOP_WORDS.has(lower)) {
                continue;
            }
            if (NON_LOCALITY_PATTERNS.test(normalized)) {
                continue;
            }
            if (/\b(?:bhk|cr|crore|lac|lakh|budget|buyer|seller|tenant|owner|broker|agent)\b/i.test(normalized)) {
                continue;
            }
            matches.push(normalized.replace(/\b\w/g, (char) => char.toUpperCase()));
        }
    }
    return uniqueStrings(matches, 4);
}

function detectRole(texts: string[]): { role: ContactRole; confidence: 'high' | 'medium' } {
    const haystack = texts.join(' ').toLowerCase();
    const counts = {
        broker: (haystack.match(/\b(?:broker|realtor|agent|channel partner)\b/g) || []).length,
        buyer: (haystack.match(/\bbuyer\b/g) || []).length,
        seller: (haystack.match(/\bseller\b/g) || []).length,
        tenant: (haystack.match(/\btenant\b/g) || []).length,
        owner: (haystack.match(/\bowner\b/g) || []).length,
    };

    const ordered = (Object.entries(counts) as Array<[ContactRole, number]>)
        .sort((left, right) => right[1] - left[1]);
    const [topRole, topCount] = ordered[0] || ['unknown', 0];

    if (!topCount) {
        return { role: 'unknown', confidence: 'medium' };
    }

    return {
        role: topRole,
        confidence: topCount >= 2 ? 'high' : 'medium',
    };
}

function buildRequirementSignals(localities: string[], propertyTypes: string[], budgets: string[]) {
    return uniqueStrings([
        ...propertyTypes,
        ...localities.map((locality) => `Locality: ${locality}`),
        ...budgets.map((budget) => `Budget: ${budget}`),
    ], 6);
}

function buildSummary(input: {
    role: ContactRole;
    propertyTypes: string[];
    localities: string[];
    budgets: string[];
    latestInboundText: string;
}) {
    const parts: string[] = [];

    if (input.role !== 'unknown') {
        parts.push(`${input.role[0].toUpperCase()}${input.role.slice(1)} contact`);
    } else {
        parts.push('Direct contact');
    }

    if (input.propertyTypes.length > 0) {
        parts.push(`asking about ${input.propertyTypes.join(', ')}`);
    }

    if (input.localities.length > 0) {
        parts.push(`around ${input.localities.join(', ')}`);
    }

    if (input.budgets.length > 0) {
        parts.push(`with ${input.budgets.join(', ')} budget`);
    }

    const prefix = parts.join(' ');
    const latestInboundText = compactText(input.latestInboundText, 140);
    return latestInboundText ? `${prefix}. Latest inbound: "${latestInboundText}"` : `${prefix}.`;
}

function buildIntel(thread: ThreadWithRecentMessages): InboxThreadIntel {
    const recentMessages = Array.isArray(thread.recentMessages) ? thread.recentMessages : [];
    const snippets = recentMessages
        .map((message) => compactText(message.text, 220))
        .filter(Boolean);
    const inboundMessages = recentMessages.filter((message) => message.direction !== 'outbound');
    const outboundMessages = recentMessages.filter((message) => message.direction === 'outbound');
    const latestInboundText = inboundMessages[0]?.text || thread.preview || '';
    const phone = normalizePhone(String(thread.remoteJid || thread.id || '').split('@')[0]);
    const { role, confidence } = detectRole([String(thread.title || ''), ...snippets]);
    const localities = extractLocalities(snippets);
    const propertyTypes = extractPropertyTypes(snippets);
    const budgets = extractBudgets(snippets);
    const requirementSignals = buildRequirementSignals(localities, propertyTypes, budgets);

    return {
        summary: buildSummary({
            role,
            propertyTypes,
            localities,
            budgets,
            latestInboundText: String(latestInboundText || ''),
        }),
        contact: {
            phone,
            role,
            confidence,
            localities,
            propertyTypes,
            budgets,
        },
        thread: {
            inboundCount: inboundMessages.length,
            outboundCount: outboundMessages.length,
            lastInboundAt: inboundMessages[0]?.timestamp || null,
            lastOutboundAt: outboundMessages[0]?.timestamp || null,
            requirementSignals,
        },
    };
}

function sameIntel(left: InboxThreadIntel, right?: InboxThreadMemory | null) {
    if (!right) {
        return false;
    }
    return JSON.stringify(left) === JSON.stringify({
        summary: right.summary,
        contact: right.contact,
        thread: right.thread,
    });
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

        const decoratedThreads = threads.map((thread) => {
            const derived = buildIntel(thread);
            const stored = storedMemories[thread.id] || null;
            if (!sameIntel(derived, stored)) {
                hasChanges = true;
                nextMemories[thread.id] = {
                    ...derived,
                    updatedAt: new Date().toISOString(),
                };
            }

            const effective = nextMemories[thread.id] || stored;
            const { recentMessages, ...rest } = thread;
            return {
                ...(rest as Omit<T, 'recentMessages'>),
                intel: effective
                    ? {
                        summary: effective.summary,
                        contact: effective.contact,
                        thread: effective.thread,
                    }
                    : derived,
            };
        });

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
