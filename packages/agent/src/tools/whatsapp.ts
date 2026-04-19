import { z } from 'zod';

export const WhatsAppTools = {
    get_groups: {
        description: 'Fetch all WhatsApp groups the broker is currently a member of.',
        schema: z.object({}),
    },
    get_messages: {
        description: 'Fetch recent messages from a specific WhatsApp group or direct message.',
        schema: z.object({
            remote_jid: z.string().describe('The JID of the chat (group or user)'),
            limit: z.number().optional().default(50).describe('Number of messages to fetch'),
        }),
    },
    send_message: {
        description: 'Send a text message to a specific WhatsApp group or direct message.',
        schema: z.object({
            remote_jid: z.string().describe('The JID of the chat to send to'),
            text: z.string().describe('The message content to send'),
        }),
    },
    monitor_group: {
        description: 'Start listening to a specific WhatsApp group for property listings and leads.',
        schema: z.object({
            remote_jid: z.string().describe('The JID of the group to monitor'),
        }),
    },
    stop_monitoring: {
        description: 'Stop listening to a specific WhatsApp group.',
        schema: z.object({
            remote_jid: z.string().describe('The JID of the group to stop monitoring'),
        }),
    },
    get_contacts: {
        description: 'Fetch the broker\'s WhatsApp contact list.',
        schema: z.object({}),
    },
};
