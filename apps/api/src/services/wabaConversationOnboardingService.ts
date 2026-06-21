import type { ConversationMessage } from '../memory/conversationMemory';
import { wabaBrokerProvisioningService } from './wabaBrokerProvisioningService';

function isAffirmative(text: string) {
    return /^(?:yes|y|haan|ha|sure|ok|okay|start|let'?s do it|set(?:\s+it)?\s+up)$/i.test(text.trim());
}

function isNegative(text: string) {
    return /^(?:no|n|nah|not now|later|skip|cancel)$/i.test(text.trim());
}

function isPlausibleName(text: string) {
    return /^[a-z][a-z .'-]{1,79}$/i.test(text.trim());
}

function isWhatsAppPhone(value: string) {
    return String(value || '').replace(/\D/g, '').slice(-10).length === 10;
}

function lastAssistantReply(history: ConversationMessage[]) {
    return [...history].reverse().find((entry) => entry.role === 'assistant')?.content || '';
}

function answerAfterQuestion(history: ConversationMessage[], pattern: RegExp) {
    let questionIndex = -1;
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const entry = history[index];
        if (entry.role === 'assistant' && pattern.test(entry.content)) {
            questionIndex = index;
            break;
        }
    }
    if (questionIndex < 0) return '';
    return history.slice(questionIndex + 1).find((entry) => entry.role === 'user')?.content.trim() || '';
}

// Onboarding is persisted in the existing WABA-scoped conversation history. This
// avoids a second state store and keeps a broker's setup exchange auditable.
export class WabaConversationOnboardingService {
    async maybeHandle(input: {
        text: string;
        remoteJid: string;
        isFirstContact: boolean;
        isKnownBroker: boolean;
        history: ConversationMessage[];
    }): Promise<string | null> {
        if (input.isKnownBroker) return null;
        if (!isWhatsAppPhone(input.remoteJid)) return null;

        const text = input.text.trim();
        if (input.isFirstContact) {
            return 'Hi, I’m Pulse from PropAI — built for brokers. I can set up your WhatsApp workspace here, or you can send a listing, requirement, or search brief. Want to get set up?';
        }

        const previousReply = lastAssistantReply(input.history);
        if (!previousReply) return null;

        if (isNegative(text) && /(?:get set up|What name should I use|agency name|primarily work in)/i.test(previousReply)) {
            return 'No problem. Send a listing, requirement, or search brief whenever you want to try Pulse.';
        }

        if (/Want to get set up\?/i.test(previousReply)) {
            return isAffirmative(text) ? 'Great. What name should I use for your PropAI workspace?' : null;
        }

        if (/What name should I use for your PropAI workspace\?/i.test(previousReply)) {
            return isPlausibleName(text) ? 'What is your brokerage or agency name?' : 'Please send your name only, for example: Rahul Mehta.';
        }

        if (/What is your brokerage or agency name\?/i.test(previousReply)) {
            return text.length >= 2 && text.length <= 100 ? 'Which city do you primarily work in?' : 'Please send your agency name.';
        }

        if (/Which city do you primarily work in\?/i.test(previousReply)) {
            if (text.length < 2 || text.length > 80) return 'Please send your primary city, for example: Mumbai.';

            const fullName = answerAfterQuestion(input.history, /What name should I use for your PropAI workspace\?/i);
            const agencyName = answerAfterQuestion(input.history, /What is your brokerage or agency name\?/i);
            if (!fullName || !agencyName) {
                return 'I lost one setup detail. Please reply with your name and agency name in one message.';
            }

            try {
                await wabaBrokerProvisioningService.provision({
                    phone: input.remoteJid,
                    fullName,
                    agencyName,
                    city: text,
                });
                return `Done, ${fullName.split(/\s+/)[0]} — your ${agencyName} workspace is live. Send listings, requirements, photos, or a search brief here anytime.`;
            } catch (error) {
                console.error('[WabaConversationOnboarding] Workspace provisioning failed', error);
                return 'I could not finish your workspace setup just now. Please send “setup” once more in a minute.';
            }
        }

        return null;
    }
}

export const wabaConversationOnboardingService = new WabaConversationOnboardingService();
