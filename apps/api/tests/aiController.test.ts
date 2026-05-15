import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chat, getAIStatus, getHistory, testKey } from '../src/controllers/aiController';
import { aiService } from '../src/services/aiService';
import { keyService } from '../src/services/keyService';
import { workspaceAccessService } from '../src/services/workspaceAccessService';
import { conversationEngineService } from '../src/services/conversationEngineService';

vi.mock('../src/services/aiService', () => ({
    aiService: {
        chat: vi.fn(),
        getStatus: vi.fn(),
    },
}));

vi.mock('../src/services/modelDiscoveryService', () => ({
    modelDiscoveryService: {
        discoverModels: vi.fn(),
    },
}));

vi.mock('../src/services/conversationEngineService', () => ({
    conversationEngineService: {
        process: vi.fn(),
    },
}));

vi.mock('../src/services/workspaceAccessService', () => ({
    workspaceAccessService: {
        resolveContext: vi.fn(),
    },
}));

vi.mock('../src/services/keyService', () => ({
    keyService: {
        saveKey: vi.fn(),
        testConnection: vi.fn(),
    },
    parseApiKeys: (value?: string | null) => String(value || '').split(/[\n,;]+/).map((entry) => entry.trim()).filter(Boolean),
}));

vi.mock('../src/services/unifiedAgentService', () => ({
    getBrokerProfile: vi.fn().mockResolvedValue(null),
    buildCapabilityHint: vi.fn().mockReturnValue(''),
}));

vi.mock('../src/memory/conversationMemory', () => ({
    getConversationHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/services/propertySearchService', () => ({
    searchProperties: vi.fn(),
}));

vi.mock('../src/utils/controllerHelpers', () => ({
    getErrorMessage: vi.fn((error: unknown, fallback: string) => error instanceof Error ? error.message : fallback),
    getErrorStatus: vi.fn(() => 500),
}));

describe('aiController.chat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (workspaceAccessService.resolveContext as any).mockResolvedValue({
            workspaceOwnerId: 'workspace-owner-1',
            currentUserId: 'member-1',
        });
    });

    it('uses the workspace owner id for AI provider resolution', async () => {
        const req = {
            user: { id: 'member-1', email: 'member@example.com' },
            body: { prompt: 'What can you do?', modelPreference: 'Auto' },
        } as any;
        const res = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis(),
        } as any;

        (conversationEngineService.process as any).mockResolvedValue({
            reply: 'I can save listings, save requirements, schedule follow-ups, show your queue, and search inventory.',
            text: 'I can save listings, save requirements, schedule follow-ups, show your queue, and search inventory.',
            agentResponse: {
                message: 'I can save listings, save requirements, schedule follow-ups, show your queue, and search inventory.',
                output_format: 'text',
            },
            route: {
                intent: 'general_answer',
                confidence: 0.8,
                rationale: 'Fallback response',
                args: {},
            },
            capabilityHint: '',
        });

        await chat(req, res);

        expect(conversationEngineService.process).toHaveBeenCalledWith(expect.objectContaining({
            event: expect.objectContaining({
                channel: 'web',
                tenantId: 'workspace-owner-1',
                content: expect.objectContaining({ text: 'What can you do?' }),
            }),
            profileLookupTenantId: 'member-1',
            modelPreference: 'Auto',
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            reply: expect.stringContaining('save listings'),
            route: expect.objectContaining({ intent: 'general_answer' }),
        }));
    });

    it('reads AI status from the workspace owner context', async () => {
        const req = {
            user: { id: 'member-1', email: 'member@example.com' },
        } as any;
        const res = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis(),
        } as any;

        (aiService.getStatus as any).mockResolvedValue({ preferredProvider: 'Google' });

        await getAIStatus(req, res);

        expect(aiService.getStatus).toHaveBeenCalledWith('workspace-owner-1');
        expect(res.json).toHaveBeenCalledWith({ preferredProvider: 'Google' });
    });

    it('tests provider keys against the workspace owner context', async () => {
        const req = {
            user: { id: 'member-1', email: 'member@example.com' },
            body: { provider: 'Google' },
        } as any;
        const res = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis(),
        } as any;

        (keyService.testConnection as any).mockResolvedValue({ success: true });

        await testKey(req, res);

        expect(keyService.testConnection).toHaveBeenCalledWith('workspace-owner-1', 'Google');
        expect(res.json).toHaveBeenCalledWith({ message: 'Connected ✅' });
    });

    it('returns history for members even when no broker profile exists', async () => {
        const req = {
            user: { id: 'member-1', email: 'member@example.com' },
        } as any;
        const res = {
            json: vi.fn(),
            status: vi.fn().mockReturnThis(),
        } as any;

        const { getBrokerProfile } = await import('../src/services/unifiedAgentService');
        const { getConversationHistory } = await import('../src/memory/conversationMemory');

        (getBrokerProfile as any).mockResolvedValue(null);
        (getConversationHistory as any).mockResolvedValue([
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello' },
        ]);

        await getHistory(req, res);

        expect(getConversationHistory).toHaveBeenCalledWith('member-1');
        expect(res.json).toHaveBeenCalledWith({
            messages: [
                { role: 'user', content: 'Hi' },
                { role: 'ai', content: 'Hello' },
            ],
        });
    });
});
