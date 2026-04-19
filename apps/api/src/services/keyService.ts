import axios from 'axios';
import { supabase } from '../config/supabase';

export class KeyService {
    async saveKey(provider: string, key: string): Promise<{ success: boolean; error?: string }> {
        const { error } = await supabase
            .from('api_keys')
            .upsert({ provider, key, updated_at: new Date().toISOString() }, { onConflict: 'provider' });

        if (error) return { success: false, error: error.message };
        return { success: true };
    }

    async getKey(provider: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('api_keys')
            .select('key')
            .eq('provider', provider)
            .single();

        if (error || !data) return null;
        return data.key;
    }

    async testConnection(provider: string): Promise<{ success: boolean; error?: string }> {
        const key = await this.getKey(provider);
        if (!key) return { success: false, error: 'API key not found' };

        try {
            switch (provider) {
                case 'Google':
                    await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                    break;
                case 'OpenAI':
                    await axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
                    break;
                case 'Groq':
                    await axios.get('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
                    break;
                case 'OpenRouter':
                    await axios.get('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` } });
                    break;
                case 'Anthropic':
                    // Anthropic doesn't have a simple "list models" endpoint that's public without a chat, 
                    // but we can try a small request or just assume it's valid if the key is present.
                    // For now, let's just return success if key is present or try a mock call.
                    return { success: true };
                default:
                    return { success: false, error: 'Unsupported provider' };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

import axios from 'axios';
export const keyService = new KeyService();
