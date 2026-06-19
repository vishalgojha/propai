import { z } from 'zod';
import { aiService } from './aiService';
import type { ConversationMessage } from '../memory/conversationMemory';
import { getPulseRouterIntentLines } from './pulseCapabilities';

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
        'igr_last_transaction',
        'igr_locality_stats',
        'identity_question',
        'runtime_status_question',
        'privacy_or_limits_question',
        'support_issue',
        'market_advice',
        'general_chat',
        'general_answer',
        'teach_correction',
    ]),
    confidence: z.number().min(0).max(1).optional(),
    rationale: z.string().optional(),
    args: z.record(z.any()).default({}),
});

export type AgentRoutePlan = z.infer<typeof AgentRoutePlanSchema>;

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
        'When the request is general or ambiguous, still return a helpful rationale that briefly teaches the user what kinds of actions PropAI can do.',
        'Do not choose create_channel unless the broker has provided at least one concrete channel filter such as locality, keyword, deal type, BHK, asset class, or record type.',
        'If the broker only says something like "create a channel for me" without the filter, prefer general_answer and ask exactly one short follow-up question for the missing area or filter.',
        'Arguments should include whatever useful fields you can infer from the user text.',
        'If unsure, prefer general_answer rather than inventing data.',
        'Output shape: {"intent":"...","confidence":0-1,"rationale":"...","args":{...}}',
    ].join(' ');

    async route(tenantId: string, prompt: string, history: ConversationMessage[] = []): Promise<AgentRoutePlan> {
        const deterministicRoute = this.detectDeterministicRoute(prompt);
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

    private detectDeterministicRoute(prompt: string): AgentRoutePlan | null {
        const normalized = String(prompt || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) {
            return null;
        }

        if (/^(?:hi|hello|hey|hii+|namaste|good\s+(?:morning|afternoon|evening)|thanks?|thank\s+you)[!.\s]*$/i.test(normalized)) {
            return {
                intent: 'general_chat',
                confidence: 1,
                rationale: 'Deterministic greeting guard',
                args: {},
            };
        }

        const asksToSearch = /\b(search|find|show|pull|get|lookup|look up)\b/.test(normalized);
        const mentionsCrm = /\b(my\s+)?crm\b/.test(normalized)
            || /\bsaved\s+(records|data|listings|requirements|leads)\b/.test(normalized);
        const mentionsRequirementRecords = /\b(requirement|requirements|buyer|buyers|tenant|tenants|lead|leads)\b/.test(normalized);

        if (asksToSearch && mentionsRequirementRecords && !mentionsCrm) {
            return {
                intent: 'search_requirements',
                confidence: 1,
                rationale: 'Deterministic requirement search guard',
                args: {},
            };
        }

        if (/\b(match|matches|matching|broker)\b/.test(normalized) && mentionsRequirementRecords) {
            return {
                intent: 'match_requirement_to_broker',
                confidence: 1,
                rationale: 'Deterministic requirement-to-broker match guard',
                args: {},
            };
        }

        if (asksToSearch && mentionsCrm) {
            return {
                intent: 'search_my_crm',
                confidence: 1,
                rationale: 'Deterministic CRM search guard',
                args: {},
            };
        }

        const inventorySearchIntent = (
            /\b(any|find|show|search|looking|available|mil\s*gaya|mila|hai kya|kya hai)\b/.test(normalized)
            || normalized.includes('?')
        ) && (
            /\b(1bhk|2bhk|3bhk|4bhk|bhk|flat|apartment|listing|listings|inventory|property|properties|rent|rental|lease|sale|buy)\b/.test(normalized)
        );

        if (inventorySearchIntent) {
            return {
                intent: 'search_listings',
                confidence: 1,
                rationale: 'Deterministic inventory search guard',
                args: {},
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
