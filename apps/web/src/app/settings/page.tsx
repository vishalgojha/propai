'use client';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

const PROVIDERS = [
    { id: 'Local', name: 'Ollama (Local)', description: 'Run models locally on your machine' },
    { id: 'Google', name: 'Google Gemini', description: 'Advanced models from Google' },
    { id: 'Anthropic', name: 'Anthropic Claude', description: 'High-reasoning models from Anthropic' },
    { id: 'OpenAI', name: 'OpenAI GPT', description: 'Industry standard models from OpenAI' },
    { id: 'Groq', name: 'Groq', description: 'Ultra-fast inference' },
    { id: 'OpenRouter', name: 'OpenRouter', description: 'Unified API for all models' },
];

export default function SettingsPage() {
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});
    const [saving, setSaving] = useState(false);

    const handleKeyChange = (provider: string, value: string) => {
        setKeys(prev => ({ ...prev, [provider]: value }));
    };

    const testConnection = async (provider: string) => {
        setStatus(prev => ({ ...prev, [provider]: 'testing' }));
        try {
            const res = await fetch('/api/ai/keys/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider })
            });
            if (!res.ok) throw new Error('Connection failed');
            setStatus(prev => ({ ...prev, [provider]: 'success' }));
        } catch (e) {
            setStatus(prev => ({ ...prev, [provider]: 'error' }));
        }
    };

    const saveAllKeys = async () => {
        setSaving(true);
        try {
            await Promise.all(Object.entries(keys).map(async ([provider, key]) => {
                await fetch('/api/ai/keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider, key })
                });
            }));
            alert('All keys saved successfully!');
        } catch (e) {
            alert('Error saving keys');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">AI Settings</h1>
                    <p className="text-gray-400 text-sm">Manage your API keys and model providers</p>
                </div>
                <button 
                    onClick={saveAllKeys}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save All Keys
                </button>
            </div>

            <div className="grid gap-6">
                {PROVIDERS.map(provider => (
                    <motion.div 
                        key={provider.id}
                        className="p-6 glass rounded-xl border border-white/10 flex flex-col md:flex-row gap-6 items-start md:items-center"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-white">{provider.name}</h3>
                                {provider.id === 'Local' && <Badge variant="local">Local</Badge>}
                            </div>
                            <p className="text-gray-400 text-xs mb-4">{provider.description}</p>
                            <div className="flex gap-2">
                                <input 
                                    type="password" 
                                    placeholder="Enter API Key"
                                    value={keys[provider.id] || ''}
                                    onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                                    className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button 
                                    onClick={() => testConnection(provider.id)}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-all"
                                >
                                    Test
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {status[provider.id] === 'testing' && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                            {status[provider.id] === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                            {status[provider.id] === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
                            {status[provider.id] === 'idle' && <span className="text-xs text-gray-500">Not tested</span>}
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-xs">
                <p><strong>Tip:</strong> Aapke paas Groq ka free API key nahi hai — <a href="https://console.groq.com/keys" target="_blank" className="underline font-bold">yahan se lein</a>, bilkul free hai!</p>
            </div>
        </div>
    );
}
