import { agentToolService } from './agentToolService';

export type StructuredToolCall = {
    toolCode: string;
    toolParams: Record<string, unknown>;
};

function normalizeWhatsAppJid(value: string) {
    const digits = value.split('').filter(c => c >= '0' && c <= '9').join('');
    return digits ? `${digits}@s.whatsapp.net` : '';
}

export function extractStructuredToolCall(rawText: string): StructuredToolCall | null {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || rawText.trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start < 0 || end <= start) {
        return null;
    }

    try {
        const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
        if (typeof parsed.tool_code !== 'string') {
            return null;
        }

        return {
            toolCode: parsed.tool_code,
            toolParams: parsed.tool_params && typeof parsed.tool_params === 'object'
                ? parsed.tool_params as Record<string, unknown>
                : {},
        };
    } catch {
        return null;
    }
}

export async function executeStructuredToolCall(tenantId: string, call: StructuredToolCall) {
    switch (call.toolCode) {
        case 'send_message_to_whatsapp_contact': {
            const contactNumber = String(call.toolParams.contact_number || '').trim();
            const messageContent = String(call.toolParams.message_content || '').trim();

            if (!contactNumber || !messageContent) {
                return 'I could not send that because the contact number or message was missing.';
            }

            const remoteJid = normalizeWhatsAppJid(contactNumber);
            if (!remoteJid) {
                return 'I could not send that because the WhatsApp number was invalid.';
            }

            const toolResult = await agentToolService.executeTool('send_whatsapp_message', {
                remote_jid: remoteJid,
                text: messageContent,
            }, {
                tenantId,
                remoteJid,
                promptText: messageContent,
            });

            if (toolResult?.success === false || toolResult?.error) {
                return 'WhatsApp is not connected right now, so I could not send that message.';
            }

            return `Sent. I sent "${messageContent}" to ${contactNumber}.`;
        }
        default:
            return 'I recognized the requested action, but that tool is not wired in this workspace yet.';
    }
}
