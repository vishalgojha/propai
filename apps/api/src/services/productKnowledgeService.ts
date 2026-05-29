import crypto from 'node:crypto';
import { runtimeStatusService } from './runtimeStatusService';
import { whatsappHealthService } from './whatsappHealthService';
import { getPulseCapabilityAnswerText } from './pulseCapabilities';
import { brokerWorkflowService } from './brokerWorkflowService';
import { supabase, supabaseAdmin } from '../config/supabase';

export type KnowledgeIntent =
    | 'identity_question'
    | 'runtime_status_question'
    | 'privacy_or_limits_question'
    | 'support_issue'
    | 'market_advice';

type KnowledgeAnswer = {
    intent: KnowledgeIntent;
    reply: string;
};

const db = supabaseAdmin ?? supabase;

function normalize(value: string) {
    return value.toLowerCase().trim();
}

export class ProductKnowledgeService {
    detectIntent(prompt: string): KnowledgeIntent | null {
        const text = normalize(prompt);

        if (
            text.includes('who built propai')
            || text.includes('who made propai')
            || text.includes('who created propai')
            || text.includes('are you ai')
            || text.includes('are you an ai')
            || text.includes('are you human')
            || text.includes('what is pulse')
            || text.includes('what is propai')
        ) {
            return 'identity_question';
        }

        if (
            text.includes('which model')
            || text.includes('what model')
            || text.includes('what provider')
            || text.includes('are you connected to whatsapp')
            || text.includes('is whatsapp connected')
            || text.includes('which number is connected')
            || text.includes('which number is active')
            || text.includes('how many groups')
            || text.includes('which groups')
            || text.includes('what groups')
            || text.includes('list my groups')
            || text.includes('groups am i on')
            || text.includes('whatsapp groups')
            || text.includes('can you browse')
            || text.includes('can you search the web')
            || text.includes('are web tools available')
        ) {
            return 'runtime_status_question';
        }

        if (
            text.includes('do you save')
            || text.includes('do you store')
            || text.includes('save my data')
            || text.includes('store my data')
            || text.includes('auto message')
            || text.includes('message clients by yourself')
            || text.includes('can you send messages by yourself')
            || text.includes('what can you actually do')
            || text.includes('what cant you do')
            || text.includes('what can\'t you do')
        ) {
            return 'privacy_or_limits_question';
        }

        if (
            text.includes('not working')
            || text.includes('broken')
            || text.includes('failing')
            || text.includes('login issue')
            || text.includes('qr')
            || text.includes('channel count')
            || text.includes('disconnected')
            || text.includes('error')
        ) {
            return 'support_issue';
        }

        if (
            text.includes('what should i show')
            || text.includes('who should i call')
            || text.includes('how should i position')
            || text.includes('pitch this')
            || text.includes('better pitched')
        ) {
            return 'market_advice';
        }

        return null;
    }

    async answer(tenantId: string, prompt: string, forcedIntent?: KnowledgeIntent): Promise<KnowledgeAnswer | null> {
        const intent = forcedIntent || this.detectIntent(prompt);
        if (!intent) {
            return null;
        }

        switch (intent) {
            case 'identity_question':
                return {
                    intent,
                    reply: await this.answerIdentity(tenantId, prompt),
                };
            case 'runtime_status_question':
                return {
                    intent,
                    reply: await this.answerRuntime(tenantId, prompt),
                };
            case 'privacy_or_limits_question':
                return {
                    intent,
                    reply: await this.answerPrivacyOrLimits(tenantId, prompt),
                };
            case 'support_issue':
                return {
                    intent,
                    reply: await this.answerSupportIssue(tenantId, prompt),
                };
            case 'market_advice':
                return {
                    intent,
                    reply: await this.answerMarketAdvice(tenantId, prompt),
                };
            default:
                return null;
        }
    }

    private async answerIdentity(tenantId: string, prompt: string) {
        const text = normalize(prompt);
        const [profile, workspace, snapshot] = await Promise.all([
            (async () => {
                const { data } = await db
                    .from('profiles')
                    .select('full_name, email, phone, app_role')
                    .eq('id', tenantId)
                    .maybeSingle();
                return data;
            })().catch(() => null),
            (async () => {
                const { data } = await db
                    .from('workspaces')
                    .select('agency_name')
                    .eq('owner_id', tenantId)
                    .maybeSingle();
                return data;
            })().catch(() => null),
            runtimeStatusService.getSnapshot(tenantId).catch(() => null),
        ]);

        const brokerName = profile?.full_name ? ` for ${profile.full_name}` : '';
        const agency = workspace?.agency_name ? ` at ${workspace.agency_name}` : '';
        const plan = snapshot?.subscription?.plan ? ` Current plan: ${snapshot.subscription.plan}.` : '';

        if (text.includes('who built') || text.includes('who made') || text.includes('who created')) {
            return 'PropAI was built by the PropAI team as a WhatsApp-native CRM and market intelligence layer for real estate brokers. Pulse is the assistant inside that workspace, wired to listings, requirements, follow-ups, Stream, WhatsApp status, research tools, and locality intelligence. Broker pricing is first month ₹1,999 including ₹500 worth of API keys, then ₹1,499/mo.';
        }

        if (text.includes('are you ai') || text.includes('are you an ai')) {
            return `Yes. I am Pulse, the AI assistant inside PropAI${brokerName}${agency}.${plan}`;
        }

        if (text.includes('are you human')) {
            return `No. I am not human. I am Pulse, the AI assistant inside PropAI${brokerName}${agency}.`;
        }

        if (text.includes('what is pulse')) {
            return `Pulse is the AI inside PropAI that helps brokers save listings, capture requirements, track follow-ups, search saved data, and work through WhatsApp workspace context. PropAI is positioned as a WhatsApp-native broker CRM and market intelligence layer, with broker pricing at ₹1,999 for the first month including ₹500 of API keys, then ₹1,499/mo.${plan}`;
        }

        return `PropAI is built for real estate brokers as a WhatsApp-native CRM and market intelligence layer, and Pulse is the AI assistant inside it${brokerName}${agency}. Broker pricing is ₹1,999 for the first month including ₹500 of API keys, then ₹1,499/mo.${plan}`;
    }

    private async answerRuntime(tenantId: string, prompt: string) {
        const text = normalize(prompt);
        const snapshot = await runtimeStatusService.getSnapshot(tenantId);

        if (
            text.includes('how many groups')
            || text.includes('which groups')
            || text.includes('what groups')
            || text.includes('list my groups')
            || text.includes('groups am i on')
            || text.includes('whatsapp groups')
        ) {
            if (snapshot.whatsapp.status !== 'connected') {
                return 'WhatsApp is not connected right now, so I cannot read your group list yet.';
            }

            const health = await whatsappHealthService.getHealth(tenantId).catch(() => null);
            const groups = await whatsappHealthService.getGroupHealth(tenantId).catch(() => []);
            const groupCount = health?.summary?.groupCount || groups.length;

            if (!groupCount) {
                return 'WhatsApp is connected, but I have not synced your group inventory yet. Give it a moment or open the WhatsApp Logs tab to confirm sync health.';
            }

            if (
                text.includes('which groups')
                || text.includes('what groups')
                || text.includes('list my groups')
            ) {
                const names = groups
                    .map((group) => group.groupName)
                    .filter(Boolean)
                    .slice(0, 8);

                if (!names.length) {
                    return `I can see ${groupCount} WhatsApp groups connected to this workspace, but I do not have the names loaded yet in the latest sync.`;
                }

                const suffix = groupCount > names.length
                    ? ` and ${groupCount - names.length} more`
                    : '';

                return `I can see ${groupCount} WhatsApp groups for this workspace. Some of them are ${names.join(', ')}${suffix}.`;
            }

            return `You are currently connected to ${groupCount} WhatsApp groups in this workspace.`;
        }

        if (text.includes('which model') || text.includes('what model') || text.includes('what provider')) {
            if (!snapshot.ai.configured) {
                return `I’m set to use ${snapshot.ai.provider} ${snapshot.ai.model}, but that provider key is not configured in this workspace yet.`;
            }

            return `I’m currently using the workspace AI setup on ${snapshot.ai.provider} ${snapshot.ai.model}.`;
        }

        if (text.includes('connected to whatsapp') || text.includes('whatsapp connected') || text.includes('which number is connected') || text.includes('which number is active')) {
            if (snapshot.whatsapp.status === 'connected') {
                return `Yes, WhatsApp is connected right now on ${snapshot.whatsapp.connectedPhoneNumber}.`;
            }

            if (snapshot.whatsapp.status === 'connecting') {
                return 'WhatsApp is still connecting right now. Once the session opens, I’ll use that number.';
            }

            return 'WhatsApp is not connected right now.';
        }

        if (text.includes('browse') || text.includes('search the web') || text.includes('web tools')) {
            if (snapshot.browser.liveBrowser) {
                return 'Yes, I can use live web search and web fetch right now.';
            }

            if (snapshot.browser.available) {
                return 'Yes, I can still use web search and fetch right now, though live browser automation is on fallback mode.';
            }

            return 'Web tools are not available right now, but I can still help with your saved CRM and workspace data.';
        }

        const whatsappLine = snapshot.whatsapp.status === 'connected'
            ? `WhatsApp connected on ${snapshot.whatsapp.connectedPhoneNumber || 'the active workspace number'} (${snapshot.whatsapp.activeCount} active session${snapshot.whatsapp.activeCount === 1 ? '' : 's'}).`
            : `WhatsApp status: ${snapshot.whatsapp.status}.`;
        const browserLine = snapshot.browser.liveBrowser
            ? 'Live browser tools are available.'
            : snapshot.browser.available
                ? 'Web tools are available in fallback mode.'
                : 'Web tools are not available right now.';
        const aiLine = snapshot.ai.configured
            ? `AI is configured for ${snapshot.ai.provider} ${snapshot.ai.model}.`
            : `AI is set to ${snapshot.ai.provider} ${snapshot.ai.model}, but the key is not configured.`;

        return [aiLine, whatsappLine, browserLine, `Plan: ${snapshot.subscription.plan}, ${snapshot.subscription.sessionsLimit} WhatsApp session limit.`].join('\n');
    }

    private async answerPrivacyOrLimits(tenantId: string, prompt: string) {
        const text = normalize(prompt);
        const snapshot = await runtimeStatusService.getSnapshot(tenantId);

        if (text.includes('auto message') || text.includes('message clients by yourself') || text.includes('send messages by yourself')) {
            return 'No, I should only send messages when you ask me to or when a workflow in your workspace is explicitly set up to do that.';
        }

        if (text.includes('do you save') || text.includes('do you store') || text.includes('save my data') || text.includes('store my data')) {
            return 'PropAI can store workspace data like saved listings, requirements, follow-ups, and related message history so you can query it back later.';
        }

        if (text.includes('what can you actually do') || text.includes('what can you do')) {
            return getPulseCapabilityAnswerText();
        }

        if (text.includes('what cant you do') || text.includes('what can\'t you do')) {
            return `I can help with saved CRM, stream, follow-ups, WhatsApp, and research. I should not claim an action is done unless it really completed, and your current ${snapshot.subscription.plan} plan allows ${snapshot.subscription.sessionsLimit} WhatsApp device connections.`;
        }

        return 'I can save and retrieve workspace data, but I should only act inside the limits of your current workspace setup and plan.';
    }

    private async answerSupportIssue(tenantId: string, prompt: string) {
        const traceId = crypto.randomUUID();
        try {
            await db.from('agent_events').insert({
                tenant_id: tenantId,
                event_type: 'support_issue',
                description: 'Broker reported a support issue in Pulse chat',
                metadata: {
                    traceId,
                    prompt: String(prompt || '').slice(0, 1000),
                },
            });
        } catch {
            // The trace ID is still useful to the user even if support logging is temporarily unavailable.
        }

        return [
            'I logged this as a support issue instead of pretending it worked.',
            `Trace ID: ${traceId}`,
            'Send a screenshot and what you tried to hello@propai.live, or paste the error here and I will narrow it down from workspace status.',
        ].join('\n');
    }

    private async answerMarketAdvice(tenantId: string, prompt: string) {
        const [crm, market] = await Promise.all([
            brokerWorkflowService.executePlan(tenantId, { intent: 'search_my_crm', args: { query: prompt } }, prompt).catch(() => null),
            brokerWorkflowService.executePlan(tenantId, { intent: 'market_insights', args: { query: prompt } }, prompt).catch(() => null),
        ]);

        const lines = ['Here is the grounded broker read from your workspace data:'];
        const crmItems = crm?.handled && Array.isArray(crm.data?.items) ? crm.data.items : [];
        const marketItems = market?.handled && Array.isArray(market.data?.items) ? market.data.items : [];

        if (crmItems.length) {
            lines.push('', `CRM signal: I found ${crmItems.length} related saved record${crmItems.length === 1 ? '' : 's'}. Start with the freshest, highest-fit lead before broad outreach.`);
        } else {
            lines.push('', 'CRM signal: I did not find a strong saved-record match, so treat this as directional advice unless you share a specific listing or buyer brief.');
        }

        if (marketItems.length) {
            lines.push(`Market signal: ${marketItems.length} locality/stat row${marketItems.length === 1 ? '' : 's'} are available from recent Stream data.`);
        } else {
            lines.push('Market signal: I do not have enough recent Stream pricing data for a confident market-stat read.');
        }

        lines.push('', 'Suggested move: qualify urgency first, then send 2-3 tightly matched options rather than a broad dump. Ask for budget flexibility, possession timing, and decision-maker availability before pushing site visits.');
        return lines.join('\n');
    }
}

export const productKnowledgeService = new ProductKnowledgeService();
