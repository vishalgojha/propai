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
        await service.route('tenant-1', 'show me some rentals');

        expect(aiService.chat).toHaveBeenCalledWith(
            'show me some rentals',
            'Auto',
            'agent_router',
            'tenant-1',
            expect.stringContaining('You are the PropAI agent router.')
        );
    });
});
