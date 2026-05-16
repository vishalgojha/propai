import { aiService } from './aiService';
import { agentRouterService } from './agentRouterService';
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

        let prompt = event.content.text;
        if (event.channel === 'web' && Array.isArray(event.content.attachments) && event.content.attachments.length > 0) {
            const attachmentContext = await buildAttachmentContext(event.tenantId, event.content.attachments as AttachmentInfo[]);
            if (attachmentContext) {
                prompt = `${prompt}\n\n---\nAttached context:\n${attachmentContext}\n---`;
            }
        }

        const route = await agentRouterService.route(event.tenantId, prompt, history);
        const capabilityHint = buildCapabilityHint(route.intent);

        const sharedRouteResult = await executeSharedRoute(event.tenantId, route, prompt);
        if (sharedRouteResult.handled) {
            const renderedReply = renderChannelReply(event.channel, sharedRouteResult.agentResponse);
            const personalizedReply = event.channel === 'whatsapp'
                ? maybePersonalizeWhatsAppGreeting(renderedReply, input.greetingName, input.shouldGreetByName)
                : renderedReply;
            await saveToHistory(event.conversation.key, prompt, personalizedReply, input.sessionId);

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

        const systemPrompt = buildPersonalizedSystemPrompt(
            profile,
            input.basePrompt || PULSE_CHAT_SYSTEM_PROMPT,
            isFirstReply,
            identityMd,
        );

        const finalSystemPrompt = event.channel === 'whatsapp'
            ? `${systemPrompt}\n\n${WHATSAPP_BROKER_FORMATTING_PROMPT}`
            : systemPrompt;

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
                await saveToHistory(event.conversation.key, prompt, toolReply, input.sessionId);
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
        await saveToHistory(event.conversation.key, prompt, personalizedReply, input.sessionId);

        return {
            reply: personalizedReply,
            text: personalizedReply,
            agentResponse,
            route,
            capabilityHint,
        };
    }
}

export const conversationEngineService = new ConversationEngineService();
