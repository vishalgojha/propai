import { agentToolService } from './agentToolService';

export type PendingWhatsAppSend = {
    contactNumber: string;
    remoteJid: string;
    messageContent: string;
};

type ResolveResult =
    | { ok: true; action: PendingWhatsAppSend }
    | { ok: false; missing: Array<'contact_number' | 'message_content'> };

function stringArg(args: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = args[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function normalizePhone(value: string) {
    const digits = String(value || '').split('').filter((char) => char >= '0' && char <= '9').join('');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    return digits;
}

function toWhatsAppJid(value: string) {
    const trimmed = String(value || '').trim();
    if (trimmed.includes('@')) return trimmed;
    const normalized = normalizePhone(trimmed);
    return normalized ? `${normalized}@s.whatsapp.net` : '';
}

function extractPhone(prompt: string) {
    const match = String(prompt || '').match(/(?:\+?91[\s-]?)?([6-9]\d{9})/);
    return match ? `91${match[1]}` : '';
}

function cleanMessageCandidate(value: string, contactNumber: string) {
    let text = String(value || '').trim();
    if (!text) return '';

    const escapedPhone = contactNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escapedPhone) {
        text = text.replace(new RegExp(`\\b(?:\\+?${escapedPhone}|${escapedPhone.slice(-10)})\\b`, 'g'), '').trim();
    }

    text = text
        .replace(/^\s*(?:send|whatsapp|wa|message|text)\b\s*[:,-]?\s*/i, '')
        .replace(/\s+\b(?:to|on)\b\s*$/i, '')
        .trim();

    return text;
}

function extractMessage(prompt: string, contactNumber: string) {
    const text = String(prompt || '').trim();
    const quoted = text.match(/["“]([^"”]{2,1000})["”]/);
    if (quoted?.[1]?.trim()) {
        return quoted[1].trim();
    }

    const afterMessage = text.match(/\b(?:message|text|saying|body)\s*[:\-]\s*([\s\S]+)/i);
    if (afterMessage?.[1]?.trim()) {
        return cleanMessageCandidate(afterMessage[1], contactNumber);
    }

    const beforeTo = text.match(/\bsend(?:\s+(?:whatsapp|wa))?\s+([\s\S]+?)\s+(?:to|on)\s+(?:\+?91[\s-]?)?[6-9]\d{9}\b/i);
    if (beforeTo?.[1]?.trim()) {
        return cleanMessageCandidate(beforeTo[1], contactNumber);
    }

    return '';
}

export function resolveWhatsAppSendRequest(args: Record<string, unknown>, prompt: string): ResolveResult {
    const rawContact = stringArg(args, [
        'contact_number',
        'contactNumber',
        'phone',
        'phone_number',
        'recipient_phone',
        'recipient',
        'to',
    ]) || extractPhone(prompt);
    const contactNumber = normalizePhone(rawContact);

    const rawMessage = stringArg(args, [
        'message_content',
        'messageContent',
        'message',
        'text',
        'body',
        'content',
    ]) || extractMessage(prompt, contactNumber);
    const messageContent = String(rawMessage || '').trim();

    const missing: Array<'contact_number' | 'message_content'> = [];
    if (!contactNumber) missing.push('contact_number');
    if (!messageContent) missing.push('message_content');
    if (missing.length) {
        return { ok: false, missing };
    }

    return {
        ok: true,
        action: {
            contactNumber,
            remoteJid: toWhatsAppJid(contactNumber),
            messageContent,
        },
    };
}

export function buildWhatsAppSendConfirmationReply(action: PendingWhatsAppSend) {
    return [
        'I can send this WhatsApp message through your connected PropAI session.',
        '',
        'Pending WhatsApp send',
        `To: +${action.contactNumber}`,
        'Message:',
        action.messageContent,
        '',
        'Reply Y to send or N to cancel.',
    ].join('\n');
}

export function parsePendingWhatsAppSendReply(reply: string): PendingWhatsAppSend | null {
    const text = String(reply || '');
    if (!text.includes('Pending WhatsApp send')) {
        return null;
    }

    const toMatch = text.match(/^\s*To:\s*\+?([0-9]{10,15})\s*$/im);
    const messageMatch = text.match(/^\s*Message:\s*\n([\s\S]*?)\n\s*Reply Y to send or N to cancel\./im);
    const contactNumber = normalizePhone(toMatch?.[1] || '');
    const messageContent = String(messageMatch?.[1] || '').trim();

    if (!contactNumber || !messageContent) {
        return null;
    }

    return {
        contactNumber,
        remoteJid: toWhatsAppJid(contactNumber),
        messageContent,
    };
}

export async function executeConfirmedWhatsAppSend(tenantId: string, action: PendingWhatsAppSend) {
    const result = await agentToolService.executeTool('send_whatsapp_message', {
        remote_jid: action.remoteJid,
        text: action.messageContent,
    }, {
        tenantId,
        remoteJid: action.remoteJid,
        promptText: action.messageContent,
    });

    if (result?.success === false || result?.error) {
        return {
            success: false,
            reply: `WhatsApp is not connected or the send failed: ${result?.error || 'unknown error'}`,
        };
    }

    return {
        success: true,
        reply: `Sent. I sent the message to +${action.contactNumber}.`,
    };
}
