import { z } from 'zod';
import { aiService } from './aiService';
import type { ConversationMessage } from '../memory/conversationMemory';
import { getPulseRouterIntentLines } from './pulseCapabilities';
import { parseIndianLocation } from '../utils/locationParser';

const AgentRoutePlanSchema = z.object({
    intent: z.enum([
        'save_listing',
        'save_requirement',
        'create_requirement',
        'create_channel',
        'schedule_callback',
        'check_callbacks',
        'search_listings',
        'search_requirements',
        'match_requirement_to_broker',
        'semantic_search',
        'market_insights',
        'get_my_listings',
        'get_my_requirements',
        'search_my_crm',
        'web_fetch',
        'search_web',
        'verify_rera',
        'fetch_property_listing',
        'send_whatsapp_message',
        'whatsapp_groups',
        'identity_question',
        'runtime_status_question',
        'privacy_or_limits_question',
        'support_issue',
        'market_advice',
        'general_chat',
        'general_answer',
        'teach_correction',
        'clarify_locality',
        'igr_last_transaction',
        'igr_locality_stats',
    ]),
    confidence: z.number().min(0).max(1).optional(),
    rationale: z.string().optional(),
    reply: z.string().max(1_500).optional(),
    args: z.record(z.any()).default({}),
});

export type AgentRoutePlan = z.infer<typeof AgentRoutePlanSchema>;

type LocalityResolution =
    | { status: 'resolved'; locality: string }
    | { status: 'ambiguous'; candidates: string[] }
    | { status: 'unresolved' };

const LOCALITY_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
    { canonical: 'Andheri West', aliases: ['andheri west', 'andheri w', 'andheriw', 'andheri'] },
    { canonical: 'Andheri East', aliases: ['andheri east', 'andheri e', 'andherie', 'andheri'] },
    { canonical: 'Bandra West', aliases: ['bandra west', 'bandra w', 'bandra'] },
    { canonical: 'Bandra East', aliases: ['bandra east', 'bandra e', 'bkc'] },
    { canonical: 'Powai', aliases: ['powai', 'pawai'] },
    { canonical: 'Juhu', aliases: ['juhu'] },
    { canonical: 'Worli', aliases: ['worli', 'worldi'] },
    { canonical: 'Lower Parel', aliases: ['lower parel', 'parel'] },
    { canonical: 'Goregaon West', aliases: ['goregaon west', 'goregaon w', 'goregaon'] },
    { canonical: 'Goregaon East', aliases: ['goregaon east', 'goregaon e'] },
    { canonical: 'Malad West', aliases: ['malad west', 'malad w', 'malad'] },
    { canonical: 'Kandivali West', aliases: ['kandivali west', 'kandivali w', 'kandivali', 'kandivli'] },
    { canonical: 'Kandivali East', aliases: ['kandivali east', 'kandivali e'] },
    { canonical: 'Borivali West', aliases: ['borivali west', 'borivali w', 'borivali'] },
    { canonical: 'Thane West', aliases: ['thane west', 'thane w', 'thane'] },
    { canonical: 'Thane East', aliases: ['thane east', 'thane e'] },
    { canonical: 'Vashi', aliases: ['vashi'] },
    { canonical: 'Kharghar', aliases: ['kharghar', 'khar gar'] },
    { canonical: 'Chembur', aliases: ['chembur'] },
    { canonical: 'Kurla', aliases: ['kurla'] },
];

function normalize(value: string) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(left: string, right: string) {
    const a = left.replace(/\s/g, '');
    const b = right.replace(/\s/g, '');
    const rows = Array.from({ length: a.length + 1 }, (_, index) => index);
    for (let column = 1; column <= b.length; column += 1) {
        let previous = rows[0];
        rows[0] = column;
        for (let row = 1; row <= a.length; row += 1) {
            const current = rows[row];
            rows[row] = Math.min(rows[row] + 1, rows[row - 1] + 1, previous + (a[row - 1] === b[column - 1] ? 0 : 1));
            previous = current;
        }
    }
    return rows[a.length];
}

function resolveLocality(prompt: string): LocalityResolution {
    const parsed = parseIndianLocation(prompt);
    if (parsed?.locality) {
        return { status: 'resolved', locality: parsed.locality };
    }

    const text = normalize(prompt);
    if (!text) return { status: 'unresolved' };
    const tokens = text.split(' ');
    const candidates = new Set<string>();

    for (const entry of LOCALITY_ALIASES) {
        for (const alias of entry.aliases) {
            const aliasTokens = normalize(alias).split(' ');
            for (let start = 0; start <= tokens.length - aliasTokens.length; start += 1) {
                const value = tokens.slice(start, start + aliasTokens.length).join(' ');
                const maximumDistance = Math.max(1, Math.floor(alias.replace(/\s/g, '').length * 0.2));
                if (editDistance(value, alias) <= maximumDistance) {
                    candidates.add(entry.canonical);
                }
            }
        }
    }

    const hasWest = /\b(?:west|w)\b/.test(text);
    const hasEast = /\b(?:east|e)\b/.test(text);
    const directionalCandidates = [...candidates].filter((candidate) =>
        (!hasWest || candidate.endsWith(' West')) && (!hasEast || candidate.endsWith(' East')),
    );
    const resolvedCandidates = directionalCandidates.length ? directionalCandidates : [...candidates];

    if (resolvedCandidates.length === 1) return { status: 'resolved', locality: resolvedCandidates[0] };
    if (resolvedCandidates.length > 1) return { status: 'ambiguous', candidates: resolvedCandidates.sort() };
    return { status: 'unresolved' };
}

function buildSearchArgs(prompt: string, locality?: string) {
    const configuration = prompt.match(/\b([1-5](?:\.5)?\s*(?:bhk|bed))\b/i)?.[1]?.replace(/\s+/g, ' ').toUpperCase();
    const dealType = /\b(rent|rental|lease)\b/i.test(prompt) ? 'Rent' : /\b(sale|buy|purchase)\b/i.test(prompt) ? 'Sale' : undefined;
    return Object.fromEntries(Object.entries({ locality, configuration, type: dealType }).filter(([, value]) => Boolean(value)));
}

export class AgentRouterService {
    private readonly systemPrompt = [
        'You are the PropAI agent router.',
        'Your job is to choose exactly one tool for the broker request.',
        'Return strict JSON only. No markdown, no code fences, no extra text.',
        'Available intents:',
        ...getPulseRouterIntentLines(),
        '- market_insights: broker asks about price trends, average prices in a locality, or market statistics',
        '- general_chat: broker says hi, thanks, or asks broad help questions',
        '- general_answer: everything else',
        'When the request is general or ambiguous, set intent to general_answer and provide a concise, helpful reply for the broker. Do not include a reply for actionable intents.',
        'Do not choose create_channel unless the broker has provided at least one concrete channel filter such as locality, keyword, deal type, BHK, asset class, or record type.',
        'If the broker only says something like "create a channel for me" without the filter, prefer general_answer and ask exactly one short follow-up question for the missing area or filter.',
        'Arguments should include whatever useful fields you can infer from the user text.',
        'If unsure, prefer general_answer rather than inventing data.',
        'Output shape: {"intent":"...","confidence":0-1,"rationale":"...","reply":"optional direct reply","args":{...}}',
    ].join(' ');

    async route(tenantId: string, prompt: string, history: ConversationMessage[] = []): Promise<AgentRoutePlan> {
        const deterministicRoute = this.routeDeterministically(prompt);
        if (deterministicRoute) {
            return deterministicRoute;
        }

        try {
            const response = await aiService.chat(
                prompt,
                'Auto',
                'agent_router',
                tenantId,
                this.systemPrompt,
                history.slice(-6).map((entry) => ({
                    role: entry.role === 'assistant' ? 'assistant' : 'user',
                    content: entry.content,
                })),
            );
            const parsed = this.parsePlan(response.text);
            const plan = AgentRoutePlanSchema.parse(parsed);
            if (plan.intent === 'general_answer' && !plan.rationale) {
                plan.rationale = 'Teach the user that they can add listings, add requirements, schedule callbacks, check queues, or search inventory in plain language.';
            }
            return plan;
        } catch (error) {
            return {
                intent: 'general_answer',
                confidence: 0,
                rationale: 'Router fallback',
                args: {},
            };
        }
    }

    private routeDeterministically(prompt: string): AgentRoutePlan | null {
        const text = normalize(prompt);
        if (!text) return null;

        if (/\b(search|find|show|check)\s+(?:my )?(?:crm|contacts|records)\b/.test(text)) {
            return { intent: 'search_my_crm', confidence: 1, rationale: 'Explicit CRM search.', args: {} };
        }

        if (/\b(?:show|check|view)\b.*\b(?:callback|follow up|followup)s?\b/.test(text)) {
            return { intent: 'check_callbacks', confidence: 1, rationale: 'Explicit callback queue request.', args: {} };
        }

        if (/\b(?:schedule|set|remind)\b.*\b(?:callback|follow up|followup|call)\b/.test(text)) {
            return { intent: 'schedule_callback', confidence: 1, rationale: 'Explicit callback scheduling request.', args: {} };
        }

        const locality = resolveLocality(prompt);
        const isMarketRequest = /\b(?:market rate|market insight|market trend|average price|price trend|rate in)\b/.test(text);
        const isRequirementSearch = /\b(?:search|find|show|match)\b.*\b(?:requirement|buyer|tenant)\b/.test(text);
        const isListingSearch = /\b(?:search|find|show|available|inventory|listing|flat|apartment|office|shop)\b/.test(text);

        if ((isMarketRequest || isRequirementSearch || isListingSearch) && locality.status === 'ambiguous') {
            return {
                intent: 'clarify_locality',
                confidence: 1,
                rationale: 'The requested locality has multiple directional matches.',
                args: { candidates: locality.candidates },
            };
        }

        if (isMarketRequest && locality.status === 'resolved') {
            return {
                intent: 'market_insights',
                confidence: 1,
                rationale: 'Explicit market request with a resolved locality.',
                args: { locality: locality.locality },
            };
        }

        if (isRequirementSearch) {
            return {
                intent: 'search_requirements',
                confidence: 1,
                rationale: 'Explicit requirement search.',
                args: locality.status === 'resolved' ? { locality: locality.locality } : {},
            };
        }

        if (isListingSearch) {
            return {
                intent: 'search_listings',
                confidence: 1,
                rationale: 'Explicit listing search.',
                args: buildSearchArgs(prompt, locality.status === 'resolved' ? locality.locality : undefined),
            };
        }

        return null;
    }

    private parsePlan(text: string) {
        const jsonText = this.extractJson(text);
        if (!jsonText) {
            return {
                intent: 'general_answer',
                confidence: 0,
                rationale: 'No valid JSON returned by router',
                args: {},
            };
        }

        try {
            return JSON.parse(jsonText);
        } catch {
            return {
                intent: 'general_answer',
                confidence: 0,
                rationale: 'Failed to parse router JSON',
                args: {},
            };
        }
    }

    private extractJson(text: string) {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced?.[1]) return fenced[1].trim();

        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return text.slice(start, end + 1).trim();
        }

        return '';
    }
}

export const agentRouterService = new AgentRouterService();
