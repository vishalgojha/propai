import axios from 'axios';
import { supabase } from '../config/supabase';
import { keyService } from './keyService';

interface AIResponse {
    text: string;
    model: string;
    latency: number;
}

export class AIService {
    private qwenUrl = process.env.QWEN_BASE_URL || 'http://localhost:11434/api/chat';

    async chat(prompt: string, modelPreference: string = 'Local', taskType?: string): Promise<AIResponse> {
        const start = Date.now();
        
        // Resolve model based on preference or task type routing
        let modelId = modelPreference;
        if (!modelId || modelId === 'Auto') {
            modelId = this.routeByTask(taskType);
        }

        try {
            const response = await this.callModel(prompt, modelId);
            return {
                ...response,
                latency: Date.now() - start
            };
        } catch (error) {
            console.error(`AI Error with ${modelId}, falling back...`, error);
            // Fallback chain: Local -> Groq -> Claude
            if (modelId !== 'Claude') {
                return await this.chat(prompt, modelId === 'Local' ? 'Groq' : 'Claude', taskType);
            }
            throw new Error('All AI models failed');
        }
    }

    private routeByTask(taskType?: string): string {
        switch (taskType) {
            case 'quick_reply':
            case 'listing_parsing':
                return 'Local';
            case 'lead_qualification':
                return 'Google'; // Gemma 4
            case 'rera_summary':
                return 'Claude'; // Claude Haiku
            case 'complex_reasoning':
                return 'Claude'; // Claude Sonnet or GPT-4o
            default:
                return 'Local';
        }
    }

    private async callModel(prompt: string, modelId: string): Promise<AIResponse> {
        if (modelId === 'Local') {
            return await this.callQwen(prompt);
        } else if (modelId === 'Groq') {
            return await this.callGroq(prompt);
        } else if (modelId === 'Google') {
            return await this.callGemini(prompt);
        } else {
            return await this.callClaude(prompt);
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
            latency: 0 
        };
    }

    private async callGroq(prompt: string): Promise<AIResponse> {
        const key = await keyService.getKey('Groq') || process.env.GROQ_API_KEY || '';
        const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama3-8b-8192',
            messages: [{ role: 'user', content: prompt }]
        }, { headers: { Authorization: `Bearer ${key}` } });
        return { 
            text: res.data.choices[0].message.content, 
            model: 'Groq Llama3', 
            latency: 0 
        };
    }

    private async callGemini(prompt: string): Promise<AIResponse> {
        const key = await keyService.getKey('Google') || process.env.GOOGLE_API_KEY || '';
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        return { 
            text: res.data.candidates[0].content.parts[0].text, 
            model: 'Gemini Pro', 
            latency: 0 
        };
    }

    private async callClaude(prompt: string): Promise<AIResponse> {
        const key = await keyService.getKey('Anthropic') || process.env.CLAUDE_API_KEY || '';
        const res = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }]
        }, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
        return { 
            text: res.data.content[0].text, 
            model: 'Claude 3.5', 
            latency: 0 
        };
    }

    async getStatus() {
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
                Claude: { name: 'Claude 3.5', latency: 400, status: 'online' },
                Google: { name: 'Gemini Pro', latency: 300, status: 'online' }
            }
        };
    }
}

export const aiService = new AIService();
