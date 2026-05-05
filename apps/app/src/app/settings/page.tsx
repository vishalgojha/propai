'use client';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, CheckCircle2, XCircle, Loader2, PlugZap, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { apiFetch } from '@/lib/api';

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
    const [mcpToken, setMcpToken] = useState<string | null>(null);
    const [mcpEndpoint, setMcpEndpoint] = useState('https://mcp.propai.live/mcp');
    const [mcpUpdatedAt, setMcpUpdatedAt] = useState<string | null>(null);
    const [mcpRetrievable, setMcpRetrievable] = useState(true);
    const [mcpStatus, setMcpStatus] = useState<'idle' | 'loading' | 'generating' | 'revoking'>('loading');
    const [mcpMessage, setMcpMessage] = useState<string | null>(null);
    const [copyState, setCopyState] = useState<'idle' | 'done'>('idle');

    const handleKeyChange = (provider: string, value: string) => {
        setKeys(prev => ({ ...prev, [provider]: value }));
    };

    const readErrorMessage = async (res: Response, fallback: string) => {
        try {
            const data = await res.json();
            return data?.error || data?.message || fallback;
        } catch {
            return fallback;
        }
    };

    const testConnection = async (provider: string) => {
        setStatus(prev => ({ ...prev, [provider]: 'testing' }));
        try {
            const res = await apiFetch('/api/ai/keys/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider })
            });
            if (!res.ok) throw new Error(await readErrorMessage(res, 'Connection failed'));
            setStatus(prev => ({ ...prev, [provider]: 'success' }));
        } catch {
            setStatus(prev => ({ ...prev, [provider]: 'error' }));
        }
    };

    const saveAllKeys = async () => {
        setSaving(true);
        try {
            const entries = Object.entries(keys).filter(([, key]) => key.trim().length > 0);
            await Promise.all(entries.map(async ([provider, key]) => {
                const res = await apiFetch('/api/ai/keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider, key })
                });
                if (!res.ok) {
                    throw new Error(await readErrorMessage(res, `Failed to save ${provider} key`));
                }
            }));
            alert('All keys saved successfully!');
        } catch (e: any) {
            alert(e?.message || 'Error saving keys');
        } finally {
            setSaving(false);
        }
    };

    const loadMcpToken = async () => {
        setMcpStatus('loading');
        setMcpMessage(null);
        try {
            const res = await apiFetch('/api/auth/mcp-token');
            if (!res.ok) {
                throw new Error(await readErrorMessage(res, 'Failed to load connector token'));
            }

            const data = await res.json();
            setMcpToken(data?.token || null);
            setMcpEndpoint(data?.endpoint || 'https://mcp.propai.live/mcp');
            setMcpUpdatedAt(data?.updated_at || null);
            setMcpRetrievable(data?.retrievable !== false);
        } catch (e: any) {
            setMcpMessage(e?.message || 'Failed to load connector token');
        } finally {
            setMcpStatus('idle');
        }
    };

    useEffect(() => {
        void loadMcpToken();
    }, []);

    const createOrLoadMcpToken = async (regenerate = false) => {
        setMcpStatus('generating');
        setMcpMessage(null);
        try {
            const res = await apiFetch('/api/auth/mcp-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ regenerate })
            });

            if (!res.ok) {
                throw new Error(await readErrorMessage(
                    res,
                    regenerate ? 'Failed to regenerate connector token' : 'Failed to generate connector token'
                ));
            }

            const data = await res.json();
            setMcpToken(data?.token || null);
            setMcpEndpoint(data?.endpoint || 'https://mcp.propai.live/mcp');
            setMcpUpdatedAt(data?.updated_at || new Date().toISOString());
            setMcpRetrievable(data?.retrievable !== false);
            setMcpMessage(regenerate ? 'Connector token regenerated.' : data?.reused ? 'Existing connector token loaded.' : 'Connector token ready.');
        } catch (e: any) {
            setMcpMessage(e?.message || 'Failed to generate connector token');
        } finally {
            setMcpStatus('idle');
        }
    };

    const revokeMcpToken = async () => {
        setMcpStatus('revoking');
        setMcpMessage(null);
        try {
            const res = await apiFetch('/api/auth/mcp-token', { method: 'DELETE' });
            if (!res.ok) {
                throw new Error(await readErrorMessage(res, 'Failed to revoke connector token'));
            }
            setMcpToken(null);
            setMcpUpdatedAt(null);
            setMcpRetrievable(true);
            setMcpMessage('Connector token revoked.');
        } catch (e: any) {
            setMcpMessage(e?.message || 'Failed to revoke connector token');
        } finally {
            setMcpStatus('idle');
        }
    };

    const copyMcpToken = async () => {
        if (!mcpToken) return;
        await navigator.clipboard.writeText(mcpToken);
        setCopyState('done');
        window.setTimeout(() => setCopyState('idle'), 1600);
    };

    const maskedMcpToken = mcpToken ? `${mcpToken.slice(0, 16)}...${mcpToken.slice(-8)}` : '';
    const connectorReady = Boolean(mcpToken);

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

            <motion.div
                className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 shadow-lg shadow-green-500/20">
                            <PlugZap className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <div className="mb-2 flex items-center gap-2">
                                <h2 className="text-lg font-semibold text-white">Connect to AI Assistant</h2>
                                <Badge variant="connected">Connector</Badge>
                            </div>
                            <p className="text-sm text-emerald-50/80">
                                Generate a PropAI MCP bearer token for Claude or ChatGPT custom connectors.
                            </p>
                            <p className="mt-2 text-xs text-emerald-200/80">
                                Endpoint: <span className="font-mono text-emerald-100">{mcpEndpoint}</span>
                            </p>
                            {mcpUpdatedAt && (
                                <p className="mt-1 text-xs text-emerald-200/70">
                                    Last issued: {new Date(mcpUpdatedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {!connectorReady && (
                            <button
                                onClick={() => createOrLoadMcpToken(false)}
                                disabled={mcpStatus !== 'idle'}
                                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-400 disabled:opacity-60"
                            >
                                {mcpStatus === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                                Generate Token
                            </button>
                        )}
                        {connectorReady && (
                            <>
                                <button
                                    onClick={() => createOrLoadMcpToken(true)}
                                    disabled={mcpStatus !== 'idle'}
                                    className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/20 disabled:opacity-60"
                                >
                                    {mcpStatus === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                    Regenerate
                                </button>
                                <button
                                    onClick={revokeMcpToken}
                                    disabled={mcpStatus !== 'idle'}
                                    className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-all hover:bg-red-500/20 disabled:opacity-60"
                                >
                                    {mcpStatus === 'revoking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    Revoke
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    {mcpStatus === 'loading' ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-100/80">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading connector token...
                        </div>
                    ) : connectorReady ? (
                        <div className="space-y-4">
                            <div>
                                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-300">Bearer Token</p>
                                <div className="flex flex-col gap-3 md:flex-row">
                                    <input
                                        type="text"
                                        readOnly
                                        value={mcpToken ?? ''}
                                        className="flex-1 rounded-lg border border-emerald-500/20 bg-black/30 px-3 py-3 font-mono text-sm text-emerald-50 focus:outline-none"
                                    />
                                    <button
                                        onClick={copyMcpToken}
                                        className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-400"
                                    >
                                        <Copy className="h-4 w-4" />
                                        {copyState === 'done' ? 'Copied' : 'Copy Token'}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <p className="mb-1 text-sm font-semibold text-white">Claude</p>
                                    <p className="text-xs text-gray-300">Custom connector URL: <span className="font-mono text-emerald-200">{mcpEndpoint}</span></p>
                                    <p className="mt-1 text-xs text-gray-300">Header: <span className="font-mono text-emerald-200">Authorization: Bearer {maskedMcpToken}</span></p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <p className="mb-1 text-sm font-semibold text-white">ChatGPT</p>
                                    <p className="text-xs text-gray-300">Use the same MCP endpoint and paste the bearer token when the connector asks for auth.</p>
                                    <p className="mt-1 text-xs text-gray-300">Keep this token private. Regenerate it here if it is ever shared.</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 text-sm text-gray-300">
                            <p>No connector token generated yet.</p>
                            {!mcpRetrievable && (
                                <p className="text-amber-300">A legacy token exists but cannot be shown again. Regenerate it to switch to retrievable storage.</p>
                            )}
                        </div>
                    )}
                </div>

                {mcpMessage && (
                    <p className="mt-3 text-sm text-emerald-200">{mcpMessage}</p>
                )}
            </motion.div>

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
