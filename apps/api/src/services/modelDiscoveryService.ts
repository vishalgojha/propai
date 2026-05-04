import axios from 'axios';
import { supabase } from '../config/supabase';
import { keyService } from './keyService';

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    speed: 'fast' | 'medium' | 'slow';
    cost: 'free' | 'cheap' | 'expensive';
    contextWindow: number;
    isLocal?: boolean;
}

const STATIC_FALLBACKS: Record<string, ModelInfo[]> = {
    'Anthropic': [
        { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'Anthropic', speed: 'slow', cost: 'expensive', contextWindow: 200000 },
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'Anthropic', speed: 'medium', cost: 'cheap', contextWindow: 200000 },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic', speed: 'fast', cost: 'free', contextWindow: 200000 },
        { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', speed: 'medium', cost: 'cheap', contextWindow: 200000 },
    ],
    'Google': [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', speed: 'fast', cost: 'free', contextWindow: 1000000 },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', speed: 'medium', cost: 'cheap', contextWindow: 2000000 },
        { id: 'gemma-4-31b', name: 'Gemma 4 31B', provider: 'Google', speed: 'medium', cost: 'free', contextWindow: 128000 },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', speed: 'fast', cost: 'free', contextWindow: 1000000 },
    ],
    'OpenAI': [
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', speed: 'medium', cost: 'expensive', contextWindow: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', speed: 'fast', cost: 'cheap', contextWindow: 128000 },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI', speed: 'medium', cost: 'expensive', contextWindow: 128000 },
        { id: 'o3-mini', name: 'o3-mini', provider: 'OpenAI', speed: 'fast', cost: 'cheap', contextWindow: 128000 },
    ],
    'Groq': [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'Groq', speed: 'fast', cost: 'free', contextWindow: 128000 },
        { id: 'mixtral-8x7b', name: 'Mixtral 8x7B', provider: 'Groq', speed: 'fast', cost: 'free', contextWindow: 32000 },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B', provider: 'Groq', speed: 'fast', cost: 'free', contextWindow: 8192 },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', provider: 'Groq', speed: 'fast', cost: 'free', contextWindow: 128000 },
    ],
    'Local': [
        { id: 'ollama-local', name: 'Ollama Local', provider: 'Local', speed: 'fast', cost: 'free', contextWindow: 32000, isLocal: true },
    ]
};

export class ModelDiscoveryService {
    private async getApiKey(tenantId: string, provider: string): Promise<string | null> {
        return await keyService.getKey(tenantId, provider);
    }

    async discoverModels(tenantId: string): Promise<ModelInfo[]> {
        const cacheKey = 'all_models_cache';
        const { data: cached } = await supabase
            .from('model_cache')
            .select('models, updated_at')
            .eq('cache_key', cacheKey)
            .single();

        if (cached && this.isCacheValid(cached.updated_at)) {
            return cached.models;
        }

        const providers = ['Google', 'OpenAI', 'Groq', 'OpenRouter', 'Local', 'Anthropic'];
        let allModels: ModelInfo[] = [];

        for (const provider of providers) {
            const key = await this.getApiKey(tenantId, provider);
            
            if (!key && provider !== 'Local' && provider !== 'Anthropic') {
                allModels.push(...STATIC_FALLBACKS[provider] || []);
                continue;
            }

            try {
                const models = await this.fetchModelsFromProvider(provider, key);
                allModels.push(...models);
            } catch (error) {
                console.error(`Error fetching models from ${provider}:`, error);
                allModels.push(...STATIC_FALLBACKS[provider] || []);
            }
        }

        await supabase.from('model_cache').upsert({ 
            cache_key: cacheKey, 
            models: allModels, 
            updated_at: new Date().toISOString() 
        });

        return allModels;
    }

    private isCacheValid(updatedAt: string): boolean {
        const cacheTime = new Date(updatedAt).getTime();
        const now = Date.now();
        return (now - cacheTime) < 24 * 60 * 60 * 1000;
    }

    private async fetchModelsFromProvider(provider: string, key: string | null): Promise<ModelInfo[]> {
        switch (provider) {
            case 'Google': {
                const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                return res.data.models.map((m: any) => ({
                    id: m.name.replace('models/', ''),
                    name: m.displayName,
                    provider: 'Google',
                    speed: 'medium',
                    cost: 'free',
                    contextWindow: m.inputTokenLimit || 128000
                }));
            }
            case 'OpenAI': {
                const res = await axios.get('https://api.openai.com/v1/models', {
                    headers: { Authorization: `Bearer ${key}` }
                });
                return res.data.data.map((m: any) => ({
                    id: m.id,
                    name: m.id,
                    provider: 'OpenAI',
                    speed: 'medium',
                    cost: 'cheap',
                    contextWindow: 128000
                }));
            }
            case 'Groq': {
                const res = await axios.get('https://api.groq.com/openai/v1/models', {
                    headers: { Authorization: `Bearer ${key}` }
                });
                return res.data.data.map((m: any) => ({
                    id: m.id,
                    name: m.id,
                    provider: 'Groq',
                    speed: 'fast',
                    cost: 'free',
                    contextWindow: m.context_length || 128000
                }));
            }
            case 'OpenRouter': {
                const res = await axios.get('https://openrouter.ai/api/v1/models');
                return res.data.data.slice(0, 10).map((m: any) => ({
                    id: m.id,
                    name: m.name,
                    provider: 'OpenRouter',
                    speed: m.architecture === 'gpt-4' ? 'slow' : 'medium',
                    cost: 'cheap',
                    contextWindow: m.context_length || 128000
                }));
            }
            case 'Local': {
                try {
                    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
                    const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/tags`);
                    return res.data.models.map((m: any) => ({
                        id: m.name,
                        name: m.name,
                        provider: 'Local',
                        speed: 'fast',
                        cost: 'free',
                        contextWindow: 32000,
                        isLocal: true
                    }));
                } catch (e) {
                    return STATIC_FALLBACKS['Local'];
                }
            }
            case 'Anthropic': {
                return STATIC_FALLBACKS['Anthropic'];
            }
            default:
                return [];
        }
    }
}

export const modelDiscoveryService = new ModelDiscoveryService();
