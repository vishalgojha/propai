import { z } from 'zod';

export const BehaviorTools = {
    set_group_config: {
        description: 'Configure the agent\'s behavior for a specific group.',
        schema: z.object({
            group_id: z.string(),
            behavior: z.enum(['Listen', 'AutoReply', 'Broadcast']),
            reply_timing: z.enum(['Immediate', '30s', 'Approval']),
        }),
    },
    set_agent_tone: {
        description: 'Set the AI agent\'s tone for interactions.',
        schema: z.object({
            tone: z.enum(['Professional', 'Friendly', 'Hinglish']),
        }),
    },
    set_reply_timing: {
        description: 'Global setting for how quickly the agent responds.',
        schema: z.object({
            timing: z.enum(['Immediate', '30s', 'Approval']),
        }),
    },
    switch_model: {
        description: 'Switch the primary LLM model for the agent.',
        schema: z.object({
            model: z.enum(['Local', 'Groq', 'Claude']),
        }),
    },
};
