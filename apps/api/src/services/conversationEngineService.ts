import { aiService } from './aiService';
import { agentRouterService } from './agentRouterService';
import { brokerWorkflowService } from './brokerWorkflowService';
import { PULSE_CHAT_SYSTEM_PROMPT } from './pulseChatPrompt';
import {
    buildCapabilityHint,
    buildPersonalizedSystemPrompt,
    executeSharedRoute,
    getBrokerProfile,
} from './unifiedAgentService';
import { buildAttachmentContext, type AttachmentInfo } from './attachmentContextService';
import { extractStructuredToolCall, executeStructuredToolCall } from './structuredToolService';
import { generateIdentityMd } from './identityService';
import {
    getConversationHistory,
    getConversationMessageCount,
    saveToHistory,
} from '../memory/conversationMemory';
import { parseAgentResponse, toAgentResponse, type AgentResponse } from '../types/agent';
import { renderOutput } from '../whatsapp/formatter';
import { supabase, supabaseAdmin } from '../config/supabase';
import type { ConversationEvent } from '../channel-events/conversationEvent';
import {
    executeConfirmedWhatsAppSend,
    parsePendingWhatsAppSendReply,
} from './agentWhatsAppActionService';

const db = supabaseAdmin ?? supabase;

const WHATSAPP_BROKER_FORMATTING_PROMPT = [
    'Channel rules:',
    '- You are replying inside WhatsApp.',
    '- Do not use Markdown tables, code fences, headings, or backticks.',
    '- Prefer plain text and short scannable lines.',
    '- Use WhatsApp-safe emphasis only when useful: *bold* and _italic_.',
    '- Use bullets like •, →, or ✅ when listing options.',
    '- Keep replies compact and readable on a phone screen.',
    '- Never mention AgentResponse or any internal response schema.',
].join('\n');

const WEB_BROKER_FORMATTING_PROMPT = [
    'Channel rules:',
    '- You are replying inside the PropAI web app.',
    '- Sound like a sharp professional operator, not a WhatsApp broker chat.',
    '- Do not say "bro", "kaam aayega", "chalega", or similar casual filler.',
    '- Be proactive and useful. Explain the best matches, gaps, and the next sensible action.',
    '- Use clean markdown-style formatting when it helps readability.',
    '- Prefer short paragraphs or simple bullet lists using "-" for lists.',
    '- Use "**bold**" for the most important values like locality, budget, or contact status.',
    '- Do not use WhatsApp-style emphasis like "*bold*" unless the user explicitly asks for WhatsApp copy.',
    '- Do not use code fences unless the content is actually code or structured data.',
    '- Never invent inventory, availability, contact numbers, or property facts.',
    '- If Stream has no match, say so directly.',
].join('\n');

const WEB_PULSE_CHAT_SYSTEM_PROMPT = [
    'IDENTITY',
    '',
    'You are Pulse, the AI assistant inside the PropAI web app for real estate brokers.',
    'Be precise, grounded in actual workspace data, and commercially helpful.',
    '',
    'LANGUAGE RULES',
    '',
    '- Mirror the user\'s language: English, Hinglish, or Hindi written in Roman script.',
    '- Never use Devanagari script.',
    '- Keep the tone professional, direct, and trustworthy.',
    '- Never use filler like "bro", "kaam aayega", or "chalega".',
    '',
    'BEHAVIOUR',
    '',
    '- Prioritize exact matches before approximate ones.',
    '- Never invent inventory, contacts, pricing, locations, or building names.',
    '- Never answer building location, locality boundary, or geographic questions from your own training data. If asked where a building or landmark is, say you do not have that data rather than guessing.',
    '- When data exists, surface the most useful fields first: building, locality, price, area, broker, and phone.',
    '- If results are weak or partial, say so clearly and explain why.',
    '- Offer the next useful action, such as saving a requirement or refining filters, but do not overpromise background automation.',
].join('\n');

type ConversationEngineInput = {
    event: ConversationEvent;
    profileLookupTenantId: string;
    modelPreference?: string;
    basePrompt?: string;
    greetingName?: string;
    shouldGreetByName?: boolean;
    sessionId?: string;
};

type ConversationEngineResult = {
    reply: string;
    text: string;
    agentResponse: AgentResponse;
    route: Awaited<ReturnType<typeof agentRouterService.route>>;
    capabilityHint: string;
    workflowData?: unknown;
    data?: Record<string, unknown>;
};

const ATTACHMENT_REFERENCE_PATTERN = /\b(attach(?:ed|ment)?|file|image|pdf|screenshot|document|txt|csv|photo|pic)\b/i;
const EXPLICIT_ACTION_PATTERN = /\b(add|save|post|create|schedule|show|search|find|fetch|verify|check|pull|import|extract|parse|summari[sz]e|analy[sz]e|read)\b/i;

function cleanWhatsAppReply(text: string) {
    let cleaned = String(text || '').trim();
    if (!cleaned) return '';

    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        cleaned = fenced[1].trim();
    }

    try {
        const parsed = JSON.parse(cleaned) as Record<string, unknown>;
        if (typeof parsed.message === 'string' && parsed.message.trim()) {
            cleaned = parsed.message.trim();
        } else if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
            cleaned = parsed.reply.trim();
        } else if (typeof parsed.text === 'string' && parsed.text.trim()) {
            cleaned = parsed.text.trim();
        }
    } catch {
        // plain text response
    }

    cleaned = cleaned.replace(/^\s*AgentResponse:\s*/i, '').trim();
    cleaned = cleaned.replace(/\\"/g, '"').trim();
    return cleaned;
}

function maybePersonalizeWhatsAppGreeting(reply: string, fullName?: string, shouldGreet?: boolean) {
    if (!shouldGreet || !fullName?.trim()) {
        return reply.trim();
    }

    const trimmedReply = reply.trim();
    const firstName = fullName.trim().split(/\s+/)[0];
    const lowerReply = trimmedReply.toLowerCase();
    if (lowerReply.includes(firstName.toLowerCase()) || /^(hi|hello|hey)\b/i.test(trimmedReply)) {
        return trimmedReply;
    }

    return `Hi ${firstName}, ${trimmedReply}`;
}

function renderChannelReply(channel: ConversationEvent['channel'], agentResponse: AgentResponse) {
    if (channel === 'whatsapp') {
        return cleanWhatsAppReply(renderOutput(agentResponse)).replace(/\*\*/g, '*');
    }

    return agentResponse.message.trim();
}

async function recordInboundEvent(input: ConversationEngineInput) {
    await db.from('agent_events').insert({
        tenant_id: input.event.tenantId,
        event_type: 'conversation_ingested',
        description: `Inbound ${input.event.channel} conversation event received`,
        metadata: {
            schemaVersion: input.event.schemaVersion,
            eventType: input.event.eventType,
            channel: input.event.channel,
            conversation: input.event.conversation,
            actor: input.event.actor || null,
            metadata: input.event.metadata || null,
        },
    });
}

function shouldUseAttachmentContextForRouting(rawText: string, hasAttachments: boolean) {
    if (!hasAttachments) {
        return false;
    }

    const normalized = String(rawText || '').trim();
    if (!normalized) {
        return false;
    }

    if (!ATTACHMENT_REFERENCE_PATTERN.test(normalized)) {
        return false;
    }

    return EXPLICIT_ACTION_PATTERN.test(normalized);
}

export class ConversationEngineService {
    async process(input: ConversationEngineInput): Promise<ConversationEngineResult> {
        const { event } = input;
        const profile = await getBrokerProfile(input.profileLookupTenantId);
        const identityMd = await generateIdentityMd(event.tenantId);
        const history = await getConversationHistory(event.conversation.key, input.sessionId);
        const isFirstReply = (await getConversationMessageCount(event.conversation.key, input.sessionId)) === 0;

        await recordInboundEvent(input).catch((error) => {
            console.warn('[conversationEngineService] Failed to record inbound event', error);
        });

        const rawPrompt = String(event.content.text || '').trim();
        const hasWebAttachments = event.channel === 'web' && Array.isArray(event.content.attachments) && event.content.attachments.length > 0;
        let prompt = rawPrompt;
        if (hasWebAttachments) {
            const attachmentContext = await buildAttachmentContext(event.tenantId, event.content.attachments as AttachmentInfo[]);
            if (attachmentContext) {
                prompt = `${rawPrompt}\n\n---\nAttached context:\n${attachmentContext}\n---`;
            }
        }

        const confirmedWhatsAppSend = await this.tryHandlePendingWhatsAppSendConfirmation(input, history, rawPrompt);
        if (confirmedWhatsAppSend) {
            return confirmedWhatsAppSend;
        }

        const confirmedWorkflowResult = await this.tryHandlePendingWorkflowConfirmation(input, history, rawPrompt);
        if (confirmedWorkflowResult) {
            return confirmedWorkflowResult;
        }

        const routePrompt = shouldUseAttachmentContextForRouting(rawPrompt, hasWebAttachments) ? prompt : rawPrompt;
        const route = await agentRouterService.route(event.tenantId, routePrompt, history);
        const capabilityHint = buildCapabilityHint(route.intent);

        const sharedRouteResult = await executeSharedRoute(event.tenantId, route, routePrompt);
        if (sharedRouteResult.handled) {
            const renderedReply = renderChannelReply(event.channel, sharedRouteResult.agentResponse);
            const personalizedReply = event.channel === 'whatsapp'
                ? maybePersonalizeWhatsAppGreeting(renderedReply, input.greetingName, input.shouldGreetByName)
                : renderedReply;
            await saveToHistory(event.conversation.key, rawPrompt, personalizedReply, input.sessionId);

            return {
                reply: personalizedReply,
                text: personalizedReply,
                agentResponse: sharedRouteResult.agentResponse,
                route,
                capabilityHint: sharedRouteResult.capabilityHint || capabilityHint,
                workflowData: sharedRouteResult.workflowData,
                data: sharedRouteResult.data,
            };
        }

        const basePrompt = event.channel === 'web'
            ? WEB_PULSE_CHAT_SYSTEM_PROMPT
            : (input.basePrompt || PULSE_CHAT_SYSTEM_PROMPT);

        const systemPrompt = buildPersonalizedSystemPrompt(
            profile,
            basePrompt,
            isFirstReply,
            identityMd,
        );

        const finalSystemPrompt = event.channel === 'whatsapp'
            ? `${systemPrompt}\n\n${WHATSAPP_BROKER_FORMATTING_PROMPT}`
            : `${systemPrompt}\n\n${WEB_BROKER_FORMATTING_PROMPT}`;

        const response = await aiService.chat(
            prompt,
            input.modelPreference || 'Auto',
            undefined,
            event.tenantId,
            finalSystemPrompt,
            history,
        );

        if (event.channel === 'web') {
            const structuredToolCall = extractStructuredToolCall(response.text);
            if (structuredToolCall) {
                const toolReply = await executeStructuredToolCall(event.tenantId, structuredToolCall);
                const agentResponse = toAgentResponse(toolReply);
                await saveToHistory(event.conversation.key, rawPrompt, toolReply, input.sessionId);
                return {
                    reply: toolReply,
                    text: toolReply,
                    agentResponse,
                    route,
                    capabilityHint,
                };
            }
        }

        const agentResponse = parseAgentResponse(response.text);
        const renderedReply = renderChannelReply(event.channel, agentResponse);
        const personalizedReply = event.channel === 'whatsapp'
            ? maybePersonalizeWhatsAppGreeting(renderedReply, input.greetingName, input.shouldGreetByName)
            : renderedReply;
        await saveToHistory(event.conversation.key, rawPrompt, personalizedReply, input.sessionId);

        return {
            reply: personalizedReply,
            text: personalizedReply,
            agentResponse,
            route,
            capabilityHint,
        };
    }

    private async tryHandlePendingWorkflowConfirmation(
        input: ConversationEngineInput,
        history: Awaited<ReturnType<typeof getConversationHistory>>,
        rawPrompt: string,
    ): Promise<ConversationEngineResult | null> {
        if (!brokerWorkflowService.isAffirmativeReply(rawPrompt) && !brokerWorkflowService.isNegativeReply(rawPrompt)) {
            return null;
        }

        const lastAssistant = [...history].reverse().find((entry) => entry.role === 'assistant');
        const confirmationIntent = brokerWorkflowService.extractConfirmationIntent(lastAssistant?.content || '');
        if (!lastAssistant || !confirmationIntent) {
            return null;
        }

        const assistantIndex = history.lastIndexOf(lastAssistant);
        const priorUser = assistantIndex > 0 ? history.slice(0, assistantIndex).reverse().find((entry) => entry.role === 'user') : null;
        if (!priorUser?.content?.trim()) {
            return null;
        }

        if (brokerWorkflowService.isNegativeReply(rawPrompt)) {
            const reply = 'Okay. I did not save it. Send the corrected brief whenever you want me to retry.';
            const agentResponse = toAgentResponse(reply);
            await saveToHistory(input.event.conversation.key, rawPrompt, reply, input.sessionId);
            return {
                reply,
                text: reply,
                agentResponse,
                route: {
                    intent: confirmationIntent,
                    confidence: 1,
                    rationale: 'Broker declined the pending confirmation.',
                    args: {},
                },
                capabilityHint: '',
                workflowData: {
                    type: `${confirmationIntent}_cancelled`,
                },
            };
        }

        const route = {
            intent: confirmationIntent,
            confidence: 1,
            rationale: 'Broker confirmed the previously inferred workflow.',
            args: { confirmed: true },
        } as Awaited<ReturnType<typeof agentRouterService.route>>;
        const sharedRouteResult = await executeSharedRoute(input.event.tenantId, route, priorUser.content);
        if (!sharedRouteResult.handled) {
            return null;
        }

        const renderedReply = renderChannelReply(input.event.channel, sharedRouteResult.agentResponse);
        const personalizedReply = input.event.channel === 'whatsapp'
            ? maybePersonalizeWhatsAppGreeting(renderedReply, input.greetingName, input.shouldGreetByName)
            : renderedReply;
        await saveToHistory(input.event.conversation.key, rawPrompt, personalizedReply, input.sessionId);

        return {
            reply: personalizedReply,
            text: personalizedReply,
            agentResponse: sharedRouteResult.agentResponse,
            route,
            capabilityHint: '',
            workflowData: sharedRouteResult.workflowData,
            data: sharedRouteResult.data,
        };
    }

    private async tryHandlePendingWhatsAppSendConfirmation(
        input: ConversationEngineInput,
        history: Awaited<ReturnType<typeof getConversationHistory>>,
        rawPrompt: string,
    ): Promise<ConversationEngineResult | null> {
        if (!brokerWorkflowService.isAffirmativeReply(rawPrompt) && !brokerWorkflowService.isNegativeReply(rawPrompt)) {
            return null;
        }

        const lastAssistant = [...history].reverse().find((entry) => entry.role === 'assistant');
        const pendingSend = parsePendingWhatsAppSendReply(lastAssistant?.content || '');
        if (!pendingSend) {
            return null;
        }

        if (brokerWorkflowService.isNegativeReply(rawPrompt)) {
            const reply = 'Okay. I did not send the WhatsApp message.';
            const agentResponse = toAgentResponse(reply);
            await saveToHistory(input.event.conversation.key, rawPrompt, reply, input.sessionId);
            return {
                reply,
                text: reply,
                agentResponse,
                route: {
                    intent: 'send_whatsapp_message',
                    confidence: 1,
                    rationale: 'Broker declined the pending WhatsApp send confirmation.',
                    args: {},
                },
                capabilityHint: '',
                workflowData: {
                    type: 'send_whatsapp_message_cancelled',
                },
            };
        }

        const result = await executeConfirmedWhatsAppSend(input.event.tenantId, pendingSend);
        const reply = result.reply;
        const agentResponse = toAgentResponse(reply);
        await saveToHistory(input.event.conversation.key, rawPrompt, reply, input.sessionId);

        return {
            reply,
            text: reply,
            agentResponse,
            route: {
                intent: 'send_whatsapp_message',
                confidence: 1,
                rationale: 'Broker confirmed the pending WhatsApp send.',
                args: {},
            },
            capabilityHint: '',
            workflowData: {
                type: result.success ? 'send_whatsapp_message_sent' : 'send_whatsapp_message_failed',
                contact_number: pendingSend.contactNumber,
            },
        };
    }
}

export const conversationEngineService = new ConversationEngineService();
