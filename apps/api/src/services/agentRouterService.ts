import { z } from 'zod';
import { aiService } from './aiService';
import type { ConversationMessage } from '../memory/conversationMemory';

const AgentRoutePlanSchema = z.object({
    intent: z.enum([
        'save_listing',
        'save_requirement',
        'create_channel',
        'schedule_callback',
        'check_callbacks',
        'search_listings',
        'get_my_listings',
        'get_my_requirements',
        'search_my_crm',
        'web_fetch',
        'search_web',
        'verify_rera',
        'fetch_property_listing',
        'igr_last_transaction',
        'igr_locality_stats',
        'identity_question',
        'runtime_status_question',
        'privacy_or_limits_question',
        'support_issue',
        'market_advice',
        'general_chat',
        'general_answer',
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
        '- save_listing: broker wants to add, post, forward, or save a property listing',
        '- save_requirement: broker wants to add a buyer, tenant, or client requirement',
        '- create_channel: broker wants Pulse to create a personal stream channel from localities, keywords, or deal filters',
        '- schedule_callback: broker wants to create a callback or follow-up reminder',
        '- check_callbacks: broker wants to see pending callbacks or the follow-up queue',
        '- search_listings: broker wants to find matching properties or query inventory',
        '- get_my_listings: broker wants to see or retrieve their saved listings',
        '- get_my_requirements: broker wants to see or retrieve their saved buyer or tenant requirements',
        '- search_my_crm: broker wants to search across saved listings and requirements together',
        '- web_fetch: broker wants to fetch/read a web page or listing URL',
        '- search_web: broker wants to search the web for project or market information',
        '- verify_rera: broker wants to verify a RERA registration or project status',
        '- fetch_property_listing: broker wants to extract structured details from a property URL',
        '- igr_last_transaction: broker wants the latest IGR / registration transaction for a building or locality',
        '- igr_locality_stats: broker wants locality-level IGR pricing stats or recent registration averages',
        '- identity_question: broker asks who built PropAI, what Pulse is, or whether Pulse is AI',
        '- runtime_status_question: broker asks about current model, WhatsApp connection, active number, or browser availability',
        '- privacy_or_limits_question: broker asks what Pulse stores, whether it auto-messages, or what it can and cannot do',
        '- support_issue: broker says something is broken or not working',
        '- market_advice: broker asks who to call, what to show, how to position something, or similar advisory questions',
        '- general_chat: broker says hi, thanks, or asks broad help questions',
        '- general_answer: everything else',
        'When the request is general or ambiguous, still return a helpful rationale that briefly teaches the user what kinds of actions PropAI can do.',
        'Arguments should include whatever useful fields you can infer from the user text.',
        'If unsure, prefer general_answer rather than inventing data.',
        'Output shape: {"intent":"...","confidence":0-1,"rationale":"...","args":{...}}',
    ].join(' ');

    async route(tenantId: string, prompt: string, history: ConversationMessage[] = []): Promise<AgentRoutePlan> {
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
