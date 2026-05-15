import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BrokerWorkflowService', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.doMock('../src/config/supabase', () => ({
            supabase: {},
            supabaseAdmin: null,
            serverClientOptions: {},
        }));
        vi.doMock('../src/services/followUpService', () => ({
            followUpService: {
                getPendingCallbacks: vi.fn().mockResolvedValue([]),
            },
        }));
        vi.doMock('../src/services/channelService', () => ({
            channelService: {},
        }));
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.SUPABASE_SERVICE_KEY;
    });

    it('lets general chat fall through when storage credentials are missing', async () => {
        const { brokerWorkflowService } = await import('../src/services/brokerWorkflowService');

        await expect(
            brokerWorkflowService.handlePrompt('tenant-1', 'How does the agent chat work?')
        ).resolves.toEqual({ handled: false });
    });

    it('returns a storage warning for listing-style prompts when storage credentials are missing', async () => {
        const { brokerWorkflowService } = await import('../src/services/brokerWorkflowService');

        await expect(
            brokerWorkflowService.handlePrompt('tenant-1', 'Add listing 2BHK in Bandra West for sale')
        ).resolves.toMatchObject({
            handled: true,
            data: { type: 'storage_unavailable' },
        });
    });
});
