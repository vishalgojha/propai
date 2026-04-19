import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from '../src/services/aiService';
import axios from 'axios';

vi.mock('axios');

describe('AIService', () => {
    let aiService: AIService;

    beforeEach(() => {
        vi.clearAllMocks();
        aiService = new AIService();
    });

    it('should call Qwen when modelPreference is Local', async () => {
        const mockResponse = { data: { message: { content: 'Hello from Qwen' } } };
        (axios.post as any).mockResolvedValueOnce(mockResponse);

        const response = await aiService.chat('Hi', 'Local');

        expect(axios.post).toHaveBeenCalledWith(
            'http://localhost:11434/api/chat',
            expect.objectContaining({
                model: 'qwen3:1.7b',
                messages: [{ role: 'user', content: 'Hi' }]
            })
        );
        expect(response.text).toBe('Hello from Qwen');
        expect(response.model).toBe('Qwen3 Local');
    });

    it('should call Groq when modelPreference is Groq', async () => {
        const mockResponse = { data: { choices: [{ message: { content: 'Hello from Groq' } }] } };
        (axios.post as any).mockResolvedValueOnce(mockResponse);

        const response = await aiService.chat('Hi', 'Groq');

        expect(axios.post).toHaveBeenCalledWith(
            'https://api.groq.com/openai/v1/chat/completions',
            expect.objectContaining({
                model: 'llama3-8b-8192'
            }),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: expect.any(String) })
            })
        );
        expect(response.text).toBe('Hello from Groq');
        expect(response.model).toBe('Groq Llama3');
    });

    it('should call Claude when modelPreference is Claude', async () => {
        const mockResponse = { data: { content: [{ text: 'Hello from Claude' }] } };
        (axios.post as any).mockResolvedValueOnce(mockResponse);

        const response = await aiService.chat('Hi', 'Claude');

        expect(axios.post).toHaveBeenCalledWith(
            'https://api.anthropic.com/v1/messages',
            expect.objectContaining({
                model: 'claude-3-5-sonnet-20240620'
            }),
            expect.objectContaining({
                headers: expect.objectContaining({ 'x-api-key': expect.any(String) })
            })
        );
        expect(response.text).toBe('Hello from Claude');
        expect(response.model).toBe('Claude 3.5');
    });

    it('should fallback from Local to Groq if Local fails', async () => {
        // First call (Local) fails, second call (Groq) succeeds
        (axios.post as any)
            .mockRejectedValueOnce(new Error('Qwen Failed'))
            .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Fallback to Groq' } }] } });

        const response = await aiService.chat('Hi', 'Local');

        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(response.text).toBe('Fallback to Groq');
        expect(response.model).toBe('Groq Llama3');
    });

    it('should throw error if all models fail', async () => {
        (axios.post as any).mockRejectedValue(new Error('API Failure'));

        await expect(aiService.chat('Hi', 'Claude')).rejects.toThrow('All AI models failed');
    });

    it('should check status for models', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-19T12:00:00Z'));
        
        (axios.get as any).mockImplementation(async () => {
            vi.advanceTimersByTime(100);
            return { status: 200 };
        });

        const status = await aiService.getStatus();

        expect(status.models.Local.status).toBe('online');
        expect(status.models.Groq.status).toBe('online');
        expect(status.models.Claude.status).toBe('online');
        
        vi.useRealTimers();
    });
});
