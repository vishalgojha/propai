import type { ConversationMessage } from '../memory/conversationMemory';

function isAffirmative(text: string) {
    return /^(?:yes|y|haan|ha|sure|ok|okay|start|let'?s do it|set(?:\s+it)?\s+up)$/i.test(text.trim());
}

function isNegative(text: string) {
    return /^(?:no|n|nah|not now|later|skip|cancel)$/i.test(text.trim());
}

function isPlausibleName(text: string) {
    return /^[a-z][a-z .'-]{1,79}$/i.test(text.trim());
}

function isEmail(text: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

function isWhatsAppPhone(value: string) {
    return String(value || '').replace(/\D/g, '').slice(-10).length === 10;
}

function lastAssistantReply(history: ConversationMessage[]) {
    return [...history].reverse().find((entry) => entry.role === 'assistant')?.content || '';
}

// Onboarding is persisted in the existing WABA-scoped conversation history. This
// avoids a second state store and keeps a broker's setup exchange auditable.
export class WabaConversationOnboardingService {
    maybeHandle(input: {
        text: string;
        remoteJid: string;
        isFirstContact: boolean;
        isKnownBroker: boolean;
        history: ConversationMessage[];
    }): string | null {
        if (input.isKnownBroker) return null;
        if (!isWhatsAppPhone(input.remoteJid)) return null;

        const text = input.text.trim();
        if (input.isFirstContact) {
            return 'Hi, I’m Pulse from PropAI. I can set up your broker workspace here on WhatsApp, or you can send a listing or requirement to try me first. Want to set up your workspace?';
        }

        const previousReply = lastAssistantReply(input.history);
        if (!previousReply) return null;

        if (isNegative(text) && /(?:set up your workspace|What name should I use|agency name|primarily work in|work email)/i.test(previousReply)) {
            return 'No problem. Send a listing, requirement, or search brief whenever you want to try Pulse.';
        }

        if (/Want to set up your workspace\?/i.test(previousReply)) {
            return isAffirmative(text) ? 'Great. What name should I use for your PropAI workspace?' : null;
        }

        if (/What name should I use for your PropAI workspace\?/i.test(previousReply)) {
            return isPlausibleName(text) ? 'What is your brokerage or agency name?' : 'Please send your name only, for example: Rahul Mehta.';
        }

        if (/What is your brokerage or agency name\?/i.test(previousReply)) {
            return text.length >= 2 && text.length <= 100 ? 'Which city do you primarily work in?' : 'Please send your agency name.';
        }

        if (/Which city do you primarily work in\?/i.test(previousReply)) {
            return text.length >= 2 && text.length <= 80 ? 'Finally, send your work email. I’ll use it only to securely claim the workspace.' : 'Please send your primary city, for example: Mumbai.';
        }

        if (/Finally, send your work email/i.test(previousReply)) {
            return isEmail(text)
                ? 'Your workspace details are ready. Open propai.live to verify this email and claim the workspace; then send me PROP-XXXXXXXX from the app to link this WhatsApp number.'
                : 'Please send a valid work email address.';
        }

        if (/Your workspace details are ready/i.test(previousReply)) {
            return 'Your setup is ready to claim. Verify the email you shared at propai.live, then send the PROP-XXXXXXXX activation code here to link WhatsApp.';
        }

        return null;
    }
}

export const wabaConversationOnboardingService = new WabaConversationOnboardingService();
