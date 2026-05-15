import { runtimeStatusService } from './runtimeStatusService';
import { whatsappHealthService } from './whatsappHealthService';

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

    async answer(tenantId: string, prompt: string): Promise<KnowledgeAnswer | null> {
        const intent = this.detectIntent(prompt);
        if (!intent) {
            return null;
        }

        switch (intent) {
            case 'identity_question':
                return {
                    intent,
                    reply: this.answerIdentity(prompt),
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
                    reply: 'Hey, this part of Pulse is still settling in. Please send a screenshot and what you tried to hello@propai.live so we can fix it quickly.',
                };
            default:
                return null;
        }
    }

    private answerIdentity(prompt: string) {
        const text = normalize(prompt);

        if (text.includes('who built') || text.includes('who made') || text.includes('who created')) {
            return 'PropAI was built as an AI workflow layer for real estate brokers, with Pulse as the assistant inside it.';
        }

        if (text.includes('are you ai') || text.includes('are you an ai')) {
            return 'Yes, I’m Pulse, the AI assistant inside PropAI.';
        }

        if (text.includes('are you human')) {
            return 'No, I’m not human. I’m Pulse, the AI assistant inside PropAI.';
        }

        if (text.includes('what is pulse')) {
            return 'Pulse is the AI inside PropAI that helps brokers save listings, capture requirements, track follow-ups, search saved data, and work through WhatsApp.';
        }

        return 'PropAI is built for real estate brokers, and Pulse is the AI assistant inside it.';
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

        return 'I can check live workspace status like WhatsApp connection, active number, model setup, and browser tool availability.';
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
            return 'I can help save listings and requirements, search your saved CRM, summarize stream activity, help create tracking channels, and use web tools when available.';
        }

        if (text.includes('what cant you do') || text.includes('what can\'t you do')) {
            return `I can help with saved CRM, stream, follow-ups, WhatsApp, and research. I should not claim an action is done unless it really completed, and your current ${snapshot.subscription.plan} plan allows ${snapshot.subscription.sessionsLimit} WhatsApp device connections.`;
        }

        return 'I can save and retrieve workspace data, but I should only act inside the limits of your current workspace setup and plan.';
    }
}

export const productKnowledgeService = new ProductKnowledgeService();
