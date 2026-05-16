import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from '../src/services/aiService';
import { keyService } from '../src/services/keyService';

vi.mock('../src/services/keyService', () => ({
    keyService: {
        getKey: vi.fn().mockResolvedValue(null),
        getKeys: vi.fn().mockResolvedValue([]),
    },
    parseApiKeys: vi.fn((value?: string | null) => String(value || '').split(/[\n,;]+/).map((entry) => entry.trim()).filter(Boolean)),
}));
vi.mock('../src/services/workspaceSettingsService', () => ({
    getWorkspaceDefaultModel: vi.fn().mockResolvedValue(null),
    getWorkspaceExplicitDefaultModel: vi.fn().mockResolvedValue(null),
}));

describe('AIService', () => {
    let aiService: AIService;

    beforeEach(() => {
        vi.clearAllMocks();
        aiService = new AIService();
    });

    it('uses the provider order returned by the runtime selector', async () => {
        vi.spyOn(aiService as any, 'buildProviderOrder').mockResolvedValue(['Google']);
        vi.spyOn(aiService as any, 'callModel').mockResolvedValue({ text: 'Hello from Google', model: 'Gemini 2.5 Flash' });

        const response = await aiService.chat('Hi', 'Auto');

        expect((aiService as any).buildProviderOrder).toHaveBeenCalledWith('Auto', undefined, undefined);
        expect(response.text).toBe('Hello from Google');
        expect(response.model).toBe('Gemini 2.5 Flash');
    });

    it('falls back to the next provider when the first one fails', async () => {
        vi.spyOn(aiService as any, 'buildProviderOrder').mockResolvedValue(['Google', 'Groq']);
        vi.spyOn(aiService as any, 'callModel')
            .mockRejectedValueOnce(new Error('Gemini failed'))
            .mockResolvedValueOnce({ text: 'Fallback to Groq', model: 'Groq llama3-8b-8192' });

        const response = await aiService.chat('Hi', 'Auto');

        expect((aiService as any).callModel).toHaveBeenCalledTimes(2);
        expect(response.text).toBe('Fallback to Groq');
    });

    it('should throw error if all models fail', async () => {
        vi.spyOn(aiService as any, 'buildProviderOrder').mockResolvedValue(['Google', 'Groq']);
        vi.spyOn(aiService as any, 'callModel')
            .mockRejectedValueOnce(new Error('Gemini failed'))
            .mockRejectedValueOnce(new Error('Groq failed'));

        await expect(aiService.chat('Hi', 'Auto')).rejects.toThrow('All AI providers failed');
    });

    it('returns provider status for the current provider set', async () => {
        (keyService.getKey as any)
            .mockResolvedValueOnce('groq-key')
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);

        const status = await aiService.getStatus('tenant-1');

        expect(status.preferredProvider).toBe('Google');
        expect(status.providerOrder[0]).toBe('Google');
        expect(status.models.Groq.status).toBe('online');
        expect(status.models.Google.status).toBe('offline');
    });
});
