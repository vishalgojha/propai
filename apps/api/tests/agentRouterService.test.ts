import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/aiService', () => ({
    aiService: {
        chat: vi.fn(),
    },
}));

import { aiService } from '../src/services/aiService';
import { AgentRouterService } from '../src/services/agentRouterService';

describe('AgentRouterService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('passes router rules as a system prompt instead of merging them into user text', async () => {
        (aiService.chat as any).mockResolvedValue({
            text: '{"intent":"general_answer","confidence":0.4,"args":{}}',
        });

        const service = new AgentRouterService();
        await service.route('tenant-1', 'Can you help me understand the app?');

        expect(aiService.chat).toHaveBeenCalledWith(
            'Can you help me understand the app?',
            'Auto',
            'agent_router',
            'tenant-1',
            expect.stringContaining('You are the PropAI agent router.'),
            []
        );
    });

    it('routes explicit CRM searches without falling through to the model', async () => {
        const service = new AgentRouterService();
        const route = await service.route('tenant-1', 'Search my CRM for 2BHK buyer requirements in Powai under 70k.');

        expect(route).toMatchObject({
            intent: 'search_my_crm',
            confidence: 1,
        });
        expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('routes a typo-tolerant, directional locality search without calling the model', async () => {
        const service = new AgentRouterService();
        const route = await service.route('tenant-1', 'find 2 bhk for rent in andhri west');

        expect(route).toMatchObject({
            intent: 'search_listings',
            confidence: 1,
            args: {
                locality: 'Andheri West',
                configuration: '2 BHK',
                type: 'Rent',
            },
        });
        expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('asks for direction instead of guessing when a typo matches both sides of Andheri', async () => {
        const service = new AgentRouterService();
        const route = await service.route('tenant-1', 'find listings in andhri');

        expect(route).toMatchObject({
            intent: 'clarify_locality',
            confidence: 1,
            args: { candidates: ['Andheri East', 'Andheri West'] },
        });
        expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('keeps the router reply for general chat so the caller can avoid a second model request', async () => {
        (aiService.chat as any).mockResolvedValue({
            text: '{"intent":"general_answer","confidence":0.9,"reply":"I can search listings, save requirements, and schedule callbacks.","args":{}}',
        });

        const service = new AgentRouterService();
        const route = await service.route('tenant-1', 'What can you do?');

        expect(route).toMatchObject({
            intent: 'general_answer',
            reply: 'I can search listings, save requirements, and schedule callbacks.',
        });
        expect(aiService.chat).toHaveBeenCalledTimes(1);
    });
});
