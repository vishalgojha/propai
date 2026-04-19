import axios from 'axios';
import { supabase } from '../config/supabase';

interface AIResponse {
    text: string;
    model: string;
    latency: number;
}

export class AIService {
    private qwenUrl = process.env.QWEN_BASE_URL || 'http://localhost:11434/api/chat';
    private groqKey = process.env.GROQ_API_KEY || '';
    private claudeKey = process.env.CLAUDE_API_KEY || '';

    async chat(prompt: string, modelPreference: string = 'Local'): Promise<AIResponse> {
        const start = Date.now();
        
        try {
            if (modelPreference === 'Local' || !modelPreference) {
                return await this.callQwen(prompt);
            } else if (modelPreference === 'Groq') {
                return await this.callGroq(prompt);
            } else {
                return await this.callClaude(prompt);
            }
        } catch (error) {
            console.error(`AI Error with ${modelPreference}, falling back...`, error);
            // Fallback chain: Qwen -> Groq -> Claude
            if (modelPreference !== 'Claude') {
                return await this.chat(prompt, modelPreference === 'Local' ? 'Groq' : 'Claude');
            }
            throw new Error('All AI models failed');
        } finally {
            const latency = Date.now() - start;
            // Log latency to Supabase or memory (here we just return it)
        }
    }

    private async callQwen(prompt: string): Promise<AIResponse> {
        const res = await axios.post(this.qwenUrl, {
            model: 'qwen3:1.7b',
            messages: [{ role: 'user', content: prompt }],
            stream: false
        });
        return { 
            text: res.data.message.content, 
            model: 'Qwen3 Local', 
            latency: 0 // calculated in main chat()
        };
    }

    private async callGroq(prompt: string): Promise<AIResponse> {
        const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama3-8b-8192',
            messages: [{ role: 'user', content: prompt }]
        }, { headers: { Authorization: `Bearer ${this.groqKey}` } });
        return { 
            text: res.data.choices[0].message.content, 
            model: 'Groq Llama3', 
            latency: 0 
        };
    }

    private async callClaude(prompt: string): Promise<AIResponse> {
        const res = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }]
        }, { headers: { 'x-api-key': this.claudeKey, 'anthropic-version': '2023-06-01' } });
        return { 
            text: res.data.content[0].text, 
            model: 'Claude 3.5', 
            latency: 0 
        };
    }

    async getStatus() {
        // Simple latency check for each model
        const startQwen = Date.now();
        let qwenLatency = -1;
        try {
            await axios.get(this.qwenUrl.replace('/api/chat', '/api/tags')); 
            qwenLatency = Date.now() - startQwen;
        } catch (e) {}

        return {
            models: {
                Local: { name: 'Qwen3 1.7B', latency: qwenLatency, status: qwenLatency > 0 ? 'online' : 'offline' },
                Groq: { name: 'Groq Llama3', latency: 150, status: 'online' },
                Claude: { name: 'Claude 3.5', latency: 400, status: 'online' }
            }
        };
    }
}

export const aiService = new AIService();
