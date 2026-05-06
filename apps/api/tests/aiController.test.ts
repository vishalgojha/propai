import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chat } from '../src/controllers/aiController';
import { aiService } from '../src/services/aiService';
import { brokerWorkflowService } from '../src/services/brokerWorkflowService';
import { agentRouterService } from '../src/services/agentRouterService';
import { PULSE_CHAT_SYSTEM_PROMPT } from '../src/services/pulseChatPrompt';

vi.mock('../src/services/aiService', () => ({
    aiService: {
        chat: vi.fn(),
    },
}));

vi.mock('../src/services/brokerWorkflowService', () => ({
    brokerWorkflowService: {
        handlePrompt: vi.fn(),
        executePlan: vi.fn(),
    },
}));

vi.mock('../src/services/agentRouterService', () => ({
    agentRouterService: {
        route: vi.fn(),
    },
}));

describe('aiController.chat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses the Pulse system prompt for fallback chat replies', async () => {
        const req = {
            user: { id: 'tenant-1' },
            body: { prompt: 'What can you do?', modelPreference: 'Auto' },
        } as any;
        const res = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis(),
        } as any;

        (brokerWorkflowService.handlePrompt as any).mockResolvedValue({ handled: false });
        (agentRouterService.route as any).mockResolvedValue({
            intent: 'general_answer',
            confidence: 0.8,
            rationale: 'Fallback response',
            args: {},
        });
        (aiService.chat as any).mockResolvedValue({
            text: 'I can save listings, save requirements, schedule follow-ups, show your queue, and search inventory.',
            model: 'Gemini 2.5 Flash',
            latency: 12,
        });

        await chat(req, res);

        expect(aiService.chat).toHaveBeenCalledWith(
            'What can you do?',
            'Auto',
            undefined,
            'tenant-1',
            PULSE_CHAT_SYSTEM_PROMPT
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            reply: expect.stringContaining('save listings'),
            route: expect.objectContaining({ intent: 'general_answer' }),
        }));
    });
});
