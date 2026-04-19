import { z } from 'zod';

export const UtilityTools = {
    broadcast_listing: {
        description: 'Send a specific listing to multiple selected groups.',
        schema: z.object({
            listing_id: z.string(),
            group_ids: z.array(z.string()),
        }),
    },
    ask_broker: {
        description: 'Pause autonomous action and request manual approval/input from the broker.',
        schema: z.object({
            question: z.string().describe('The question to ask the broker'),
            context: z.string().optional().describe('Context for the broker to make a decision'),
        }),
    },
    summarize_group: {
        description: 'Provide a concise summary of the most recent activity in a group.',
        schema: z.object({
            group_id: z.string(),
            message_count: z.number().optional().default(50),
        }),
    },
};
