import { aiService } from './aiService';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase, supabaseAdmin } from '../config/supabase';
import { parseAgentResponse, toAgentResponse } from '../types/agent';
import { renderOutput } from '../whatsapp/formatter';
import { agentRouterService } from './agentRouterService';
import { PULSE_CHAT_SYSTEM_PROMPT } from './pulseChatPrompt';
import {
    buildPersonalizedSystemPrompt,
    executeSharedRoute,
    getBrokerProfile as getUnifiedBrokerProfile,
} from './unifiedAgentService';
import { agentToolService } from './agentToolService';
import {
    getConversationHistory,
    getConversationMessageCount,
    normalizeConversationPhoneNumber,
    saveToHistory,
} from '../memory/conversationMemory';

type ChatTurn = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

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

function normalizeComparablePhone(value?: string | null) {
    const digits = String(value || '').split('').filter(c => c >= '0' && c <= '9').join('');
    return digits.slice(-10);
}

function cleanWhatsAppReply(text: string) {
    let cleaned = String(text || '').trim();
    if (!cleaned) return '';

    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        cleaned = fenced[1].trim();
    }

    const unwrapJsonMessage = (value: string) => {
        try {
            const parsed = JSON.parse(value) as any;
            if (parsed && typeof parsed === 'object') {
                if (typeof parsed.message === 'string' && parsed.message.trim()) {
                    return parsed.message.trim();
                }
                if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
                    return parsed.reply.trim();
                }
                if (typeof parsed.text === 'string' && parsed.text.trim()) {
                    return parsed.text.trim();
                }
                if (parsed.AgentResponse && typeof parsed.AgentResponse === 'object' && typeof parsed.AgentResponse.message === 'string') {
                    return String(parsed.AgentResponse.message).trim();
                }
            }
        } catch {
            return value;
        }
        return value;
    };

    cleaned = unwrapJsonMessage(cleaned);
    cleaned = cleaned.replace(/^\s*AgentResponse:\s*/i, '').trim();
    cleaned = cleaned.replace(/^\s*\{[\s\S]*"message"\s*:\s*"([^"]+)"[\s\S]*\}\s*$/i, '$1').trim();
    cleaned = cleaned.replace(/\\"/g, '"').trim();

    return cleaned;
}

export class AgentExecutor {
    async processMessage(tenantId: string, remoteJid: string, text: string, sessionLabel?: string): Promise<string> {
        const ASSISTANT_PHONE = '7021045254'; // last 10 digits of +91 70210 45254
        let effectiveTenantId = tenantId;
        let systemPrompt: string;
        let shouldUseUnifiedBrokerFlow = false;
        let brokerProfile: Awaited<ReturnType<typeof getUnifiedBrokerProfile>> = null;
        let brokerFullName: string | undefined;
        let shouldGreetBrokerByName = false;
        const conversationKey = normalizeConversationPhoneNumber(remoteJid);
        const isFirstReply = (await getConversationMessageCount(conversationKey)) === 0;

        const assistantSessionPhone = await this.getSessionPhoneNumber(tenantId, sessionLabel);
        const isAssistantSession = normalizeComparablePhone(assistantSessionPhone) === normalizeComparablePhone(ASSISTANT_PHONE);

        if (isAssistantSession) {
            const brokerResolution = await this.resolveBrokerWorkspaceBySender(remoteJid);

            if (brokerResolution.isBroker && brokerResolution.verified) {
                // Verified broker → CRM mode inside their workspace
                effectiveTenantId = brokerResolution.tenantId!;
                brokerProfile = await getUnifiedBrokerProfile(effectiveTenantId);
                brokerFullName = brokerProfile?.full_name || undefined;
                shouldGreetBrokerByName = Boolean(
                    brokerProfile?.full_name
                    && !remoteJid.endsWith('@g.us')
                    && brokerProfile.phone
                    && brokerProfile.phone === conversationKey
                );
                systemPrompt = this.buildBrokerSystemPrompt(brokerProfile, isFirstReply);
                shouldUseUnifiedBrokerFlow = true;
            } else {
                const looksLikeBroker = await this.detectsBrokerIntent(text);
                if (brokerResolution.isBroker && !brokerResolution.verified) {
                    // Known broker phone but not verified → ask for verification first
                    systemPrompt = await this.getUnregisteredBrokerPrompt();
                    effectiveTenantId = tenantId; // system/assistant tenant
                } else if (looksLikeBroker) {
                    // Unregistered broker → onboarding mode
                    systemPrompt = await this.getUnregisteredBrokerPrompt();
                    effectiveTenantId = tenantId; // system/assistant tenant
                } else {
                    // Client / unknown intent → qualification mode
                    systemPrompt = await this.getClientAssistantPrompt();
                    effectiveTenantId = tenantId; // system/assistant tenant
                }
            }
        } else {
            // Original flow for broker's own sessions
            brokerProfile = await getUnifiedBrokerProfile(tenantId);
            shouldGreetBrokerByName = Boolean(
                brokerProfile?.full_name
                && !remoteJid.endsWith('@g.us')
                && brokerProfile.phone
                && brokerProfile.phone === conversationKey
            );
            brokerFullName = brokerProfile?.full_name;
            systemPrompt = this.buildBrokerSystemPrompt(brokerProfile, isFirstReply);
            shouldUseUnifiedBrokerFlow = true;
        }

        const history = await getConversationHistory(conversationKey);
        const currentMessages: ChatTurn[] = [...history];
        let currentPrompt = text;

        let iterations = 0;
        const MAX_ITERATIONS = 5;

        try {
            if (shouldUseUnifiedBrokerFlow) {
                const route = await agentRouterService.route(effectiveTenantId, text, history);
                const sharedRouteResult = await executeSharedRoute(effectiveTenantId, route, text);
                if (sharedRouteResult.handled) {
                    const renderedReply = cleanWhatsAppReply(
                        renderOutput(sharedRouteResult.agentResponse)
                    ).replace(/\*\*/g, '*');
                    const personalizedReply = this.maybePersonalizeGreeting(renderedReply, brokerFullName, shouldGreetBrokerByName);
                    await saveToHistory(conversationKey, text, personalizedReply);
                    return personalizedReply;
                }

                const response = await aiService.chat(
                    text,
                    'Auto',
                    undefined,
                    effectiveTenantId,
                    systemPrompt,
                    history
                );
                const agentResponse = parseAgentResponse(response.text);
                const renderedReply = cleanWhatsAppReply(renderOutput(agentResponse)).replace(/\*\*/g, '*');
                const personalizedReply = this.maybePersonalizeGreeting(renderedReply, brokerFullName, shouldGreetBrokerByName);
                await saveToHistory(conversationKey, text, personalizedReply);
                return personalizedReply;
            }

            while (iterations < MAX_ITERATIONS) {
                this.logAgentInvocation('request', {
                    source: 'AgentExecutor',
                    tenantId: effectiveTenantId,
                    toolsPresent: false,
                    toolsCount: 0,
                    taskType: 'agent_router',
                });
                const response = await aiService.chat(
                    currentPrompt,
                    'Auto',
                    'agent_router',
                    effectiveTenantId,
                    systemPrompt,
                    currentMessages
                );
                const agentResponse = parseAgentResponse(response.text);

                const toolCall = this.parseToolCall(agentResponse.message);
                this.logAgentInvocation('response', {
                    source: 'AgentExecutor',
                    tenantId: effectiveTenantId,
                    toolsPresent: false,
                    toolsCount: 0,
                    responseBlockType: toolCall ? 'tool' : 'text',
                    toolName: toolCall?.name || null,
                });

                if (!toolCall) {
                    const renderedReply = cleanWhatsAppReply(renderOutput(agentResponse));
                    await saveToHistory(conversationKey, text, renderedReply);
                    return renderedReply;
                }

                const toolResult = await this.executeTool(toolCall.name, toolCall.args, effectiveTenantId, remoteJid, text);
                if (this.isToolFailure(toolResult) || this.isToolEmpty(toolResult)) {
                    return cleanWhatsAppReply(renderOutput(toAgentResponse("Hey, this part of Pulse is still settling in. Please send a screenshot and what you tried to hello@propai.live so we can fix it quickly.")));
                }

                currentMessages.push({ role: 'assistant', content: agentResponse.message });
                currentMessages.push({ role: 'user', content: `Tool Result: ${JSON.stringify(toolResult)}` });
                currentPrompt = 'Continue based on the tool result above.';

                iterations++;
            }
            return cleanWhatsAppReply(renderOutput(toAgentResponse("I'm having a bit of trouble with this one. Could you try saying it differently?")));
        } catch (error) {
            console.error('Agent Loop Error:', error);
            return cleanWhatsAppReply(renderOutput(toAgentResponse("Something went wrong on my end, but I'm trying to fix it. One moment!")));
        }
    }

    private parseToolCall(text: string) {
        const regex = /TOOL: (\w+)\s*({.*})/g;
        const match = regex.exec(text);
        if (!match) return null;
        try {
            return { name: match[1], args: JSON.parse(match[2]) };
        } catch (e) {
            return null;
        }
    }

    private logAgentInvocation(stage: 'request' | 'response', metadata: Record<string, unknown>) {
        console.info('[agent-invocation]', JSON.stringify({ stage, ...metadata }));
    }

    private async logEvent(tenantId: string, eventType: string, description: string, metadata: any = {}) {
        await supabase.from('agent_events').insert({
            tenant_id: tenantId,
            event_type: eventType,
            description,
            metadata
        });
    }

    private async executeTool(name: string, args: any, tenantId: string, remoteJid: string, promptText: string): Promise<any> {
        return await agentToolService.executeTool(name, args, {
            tenantId,
            remoteJid,
            promptText,
        });
    }

    private buildBrokerSystemPrompt(
        profile: { full_name?: string; email?: string | null; app_role?: string | null } | null,
        isFirstReply: boolean,
    ) {
        return [
            buildPersonalizedSystemPrompt(profile, PULSE_CHAT_SYSTEM_PROMPT, isFirstReply),
            WHATSAPP_BROKER_FORMATTING_PROMPT,
        ].join('\n\n');
    }

    private isToolFailure(toolResult: any) {
        if (!toolResult) {
            return true;
        }

        if (toolResult.error) {
            return true;
        }

        if (toolResult.status === 'failure') {
            return true;
        }

        if (toolResult.success === false) {
            return true;
        }

        return false;
    }

    private isToolEmpty(toolResult: any) {
        if (Array.isArray(toolResult)) {
            return toolResult.length === 0;
        }

        if (typeof toolResult?.count === 'number' && toolResult.count === 0) {
            return true;
        }

        if (Array.isArray(toolResult?.groups) && toolResult.groups.length === 0) {
            return true;
        }

        if (Array.isArray(toolResult?.callbacks) && toolResult.callbacks.length === 0) {
            return true;
        }

        return false;
    }

    private maybePersonalizeGreeting(reply: string, fullName?: string, shouldGreet?: boolean) {
        if (!shouldGreet || !fullName?.trim()) {
            return reply;
        }

        const trimmedReply = reply.trim();
        const firstName = fullName.trim().split(/\s+/)[0];
        const lowerReply = trimmedReply.toLowerCase();
        if (
            lowerReply.includes(firstName.toLowerCase())
            || /^(hi|hello|hey)\b/i.test(trimmedReply)
        ) {
            return trimmedReply;
        }

        return `Hi ${firstName}, ${trimmedReply}`;
    }

    private async getClientAssistantPrompt(): Promise<string> {
        return `You are the PropAI Assistant — helping property buyers and tenants find the right home.

Your job:
1. Understand intent: buy / rent / sell
2. Capture: location → budget → BHK → timeline → name → phone
3. Search available listings via get_my_listings
4. Save as lead via store_leads
5. Tell them a broker will follow up

When you have location + budget + BHK, always call get_my_listings first.
If listings match, show up to 3 options clearly.
If no match: "I'll have our team reach out with the best options shortly."

Reply format for listings:
*Available Options:*
🏠 3BHK Bandra West | 4.2Cr | Ready
🏠 3BHK Khar | 3.8Cr | 6 months
"Want details on any of these?"

Lead save: call store_leads once you have name + phone + requirement.

Language: match the user — English, Hindi, Hinglish.
Keep every reply under 3 lines.
Never reveal broker names or internal data.
Do not send generic greetings or capability dumps.
If the user message is incomplete, ask exactly one pointed follow-up question based on what they already said.
If they pasted a listing or requirement, acknowledge that specific content first before asking anything else.

If someone asks who you are:
"I'm the PropAI Assistant 🏠 I help you find the right property and connect you with experts."

Always wrap responses in the AgentResponse JSON schema.`;
    }

    private async getUnregisteredBrokerPrompt(): Promise<string> {
        return `You are the PropAI Assistant — a WhatsApp-native CRM for real estate brokers in India.

The person messaging you appears to be a broker but is NOT yet registered on PropAI.

Your goal: convert them into a PropAI signup.

Flow:
1. Acknowledge what they sent ("That looks like a listing/requirement!")
2. Explain PropAI in 2 lines — WhatsApp-native CRM, auto-match listings to requirements, no app needed
3. Ask: "Are you a broker? I can save this and start matching for you — takes 30 seconds to get started."
4. If yes → collect name + number → call store_leads with record_type: 'broker_signup_lead'
5. Send them the signup link: https://propai.live

Tone: peer-to-peer, broker-to-broker. Not salesy. Like a colleague who found a better tool.

Example opener:
"Looks like a listing 👀 PropAI can auto-save this and match it to buyer requirements in your network instantly.
Are you a broker? Takes 30 seconds to set up — propai.live"

Once you have their name + number, call store_leads with:
- record_type: 'broker_signup_lead'
- source: 'assistant_wa_7021045254'
- raw_text: the original message they sent

Always wrap responses in the AgentResponse JSON schema.`;
    }

    private async isBrokerSender(remoteJid: string): Promise<{
        isBroker: boolean;
        tenantId?: string;
    }> {
        const strippedPhone = remoteJid.replace('@s.whatsapp.net', '');
        const phone = strippedPhone.startsWith('+') ? strippedPhone.slice(1) : strippedPhone;
        const client = supabaseAdmin ?? supabase;

        const { data } = await client
            .from('profiles')
            .select('id')
            .or(`phone.eq.${phone},phone.eq.+${phone}`)
            .maybeSingle();

        return data
            ? { isBroker: true, tenantId: data.id }
            : { isBroker: false };
    }

    private async getSessionPhoneNumber(tenantId: string, sessionLabel?: string) {
        const client = supabaseAdmin ?? supabase;
        let query = client
            .from('whatsapp_sessions')
            .select('session_data')
            .eq('tenant_id', tenantId);

        if (sessionLabel?.trim()) {
            query = query.eq('label', sessionLabel.trim());
        }

        const { data } = await query
            .order('last_sync', { ascending: false })
            .limit(1)
            .maybeSingle();

        const sessionData = (data?.session_data && typeof data.session_data === 'object')
            ? data.session_data as Record<string, any>
            : {};

        return String(sessionData.phoneNumber || '').trim();
    }

    private async resolveBrokerWorkspaceBySender(remoteJid: string): Promise<{
        isBroker: boolean;
        verified: boolean;
        tenantId?: string;
        role?: string | null;
    }> {
        const strippedPhone = remoteJid.replace('@s.whatsapp.net', '');
        const phone = strippedPhone.startsWith('+') ? strippedPhone.slice(1) : strippedPhone;
        const client = supabaseAdmin ?? supabase;

        // 1) Direct profile match (owner)
        const { data: ownerProfile } = await client
            .from('profiles')
            .select('id, phone_verified')
            .or(`phone.eq.${phone},phone.eq.+${phone}`)
            .maybeSingle();

        if (ownerProfile?.id) {
            return {
                isBroker: true,
                verified: true,
                tenantId: ownerProfile.id,
                role: 'owner',
            };
        }

        // 2) Workspace member match (team)
        const { data: member } = await client
            .from('workspace_members')
            .select('workspace_owner_id, role, status')
            .or(`member_phone.eq.${phone},member_phone.eq.+${phone}`)
            .maybeSingle();

        if (member?.workspace_owner_id && String(member.status || '').toLowerCase() === 'active') {
            return {
                isBroker: true,
                verified: true,
                tenantId: member.workspace_owner_id,
                role: member.role || null,
            };
        }

        return { isBroker: false, verified: false };
    }

    private async detectsBrokerIntent(text: string): Promise<boolean> {
        const brokerPatterns = [
            /\d+\s*bhk/i,
            /\b(listing|inventory|requirement|req|client needs|looking for client)\b/i,
            /\b(cr|crore|lac|lakh|sqft|sq\.ft)\b/i,
            /\b(ready\s*possession|under\s*construction|rera)\b/i,
            /\b(rent out|for sale|available for)\b/i,
        ];
        return brokerPatterns.some((p) => p.test(text));
    }
}

export const agentExecutor = new AgentExecutor();
