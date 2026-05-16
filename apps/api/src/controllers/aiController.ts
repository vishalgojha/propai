import { Request, Response } from 'express';
import { aiService } from '../services/aiService';
import { modelDiscoveryService } from '../services/modelDiscoveryService';
import { keyService } from '../services/keyService';
import { getConversationHistory, saveToHistory } from '../memory/conversationMemory';
import { buildCapabilityHint, getBrokerProfile } from '../services/unifiedAgentService';
import { searchProperties } from '../services/propertySearchService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import { conversationEngineService } from '../services/conversationEngineService';
import { toAgentResponse } from '../types/agent';
import { supabase, supabaseAdmin } from '../config/supabase';
import '../types/express';

function getDb() {
    return supabaseAdmin ?? supabase;
}

function resolveConversationKey(phone: string | null | undefined, fallbackUserId: string) {
    return String(phone || '').trim() || fallbackUserId;
}

function maybePersonalizeGreeting(reply: string, _fullName?: string, _shouldGreet?: boolean) {
    return reply.trim();
}

export const chat = async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const context = await workspaceAccessService.resolveContext(user);
    const tenantId = context.workspaceOwnerId;
    const rawPrompt = req.body.prompt || req.body.message;
    const modelPreference = req.body.modelPreference || req.body.model;
    const sessionId = req.body.sessionId || null;
    if (!rawPrompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        const profile = await getBrokerProfile(user.id);
        const conversationKey = resolveConversationKey(profile?.phone, user.id);
        const result = await conversationEngineService.process({
            event: {
                schemaVersion: '2026-05-15',
                eventType: 'conversation.message.received',
                channel: 'web',
                tenantId,
                conversation: {
                    key: conversationKey,
                    participantId: user.id,
                    isGroup: false,
                    sessionId,
                },
                actor: {
                    userId: user.id,
                    phone: profile?.phone || null,
                },
                content: {
                    text: rawPrompt,
                    attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
                },
            },
            profileLookupTenantId: user.id,
            modelPreference,
        });

        res.json({
            reply: maybePersonalizeGreeting(result.reply, profile?.full_name, false),
            text: result.text,
            agent_response: result.agentResponse,
            workflow: result.workflowData,
            route: result.route,
            capability_hint: result.capabilityHint,
            data: result.data,
        });
    } catch (error: unknown) {
        const capabilityHint = buildCapabilityHint('general_answer');
        const fallbackError = getErrorMessage(error, 'AI provider unavailable');
        const agentResponse = toAgentResponse(`Pulse could not reach the model chain. ${fallbackError}`);
        res.json({
            reply: agentResponse.message,
            text: agentResponse.message,
            agent_response: agentResponse,
            route: { intent: 'general_answer' },
            capability_hint: capabilityHint,
            fallback_error: fallbackError,
            provider_errors: error instanceof Error && 'providerErrors' in error ? (error as Record<string, unknown>).providerErrors as Array<unknown> : [],
        });
    }
};

export const getHistory = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const profile = await getBrokerProfile(req.user.id);
        const sessionId = req.query.sessionId as string | undefined;
        const rawHistory = await getConversationHistory(
            resolveConversationKey(profile?.phone, req.user.id),
            sessionId || undefined,
        );
        const history = Array.isArray(rawHistory) ? rawHistory : [];
        const messages = history.map((msg) => ({
            role: msg.role === 'assistant' ? 'ai' as const : 'user' as const,
            content: msg.content,
        }));
        res.json({ messages });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to fetch history') });
    }
};

export const listSessions = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const profile = await getBrokerProfile(req.user.id);
        const userId = resolveConversationKey(profile?.phone, req.user.id);
        const { data, error } = await getDb()
            .from('ai_sessions')
            .select('id, title, created_at, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json({ sessions: data || [] });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to list sessions') });
    }
};

export const createSession = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const profile = await getBrokerProfile(req.user.id);
        const userId = resolveConversationKey(profile?.phone, req.user.id);
        const { data, error } = await getDb()
            .from('ai_sessions')
            .insert({ user_id: userId, title: 'New Chat' })
            .select('id, title, created_at, updated_at')
            .single();

        if (error) throw error;
        res.status(201).json({ session: data });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to create session') });
    }
};

export const deleteSession = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const sessionId = req.params.id;
    if (!sessionId) return res.status(400).json({ error: 'Session ID is required' });

    try {
        const profile = await getBrokerProfile(req.user.id);
        const userId = resolveConversationKey(profile?.phone, req.user.id);

        const { data: session } = await getDb()
            .from('ai_sessions')
            .select('user_id')
            .eq('id', sessionId)
            .single();

        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

        await getDb().from('conversations').delete().eq('session_id', sessionId);
        await getDb().from('ai_sessions').delete().eq('id', sessionId);

        res.json({ message: 'Session deleted' });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to delete session') });
    }
};

export const renameSession = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const sessionId = req.params.id;
    const { title } = req.body;
    if (!sessionId || !title?.trim()) return res.status(400).json({ error: 'Session ID and title are required' });

    try {
        const profile = await getBrokerProfile(req.user.id);
        const userId = resolveConversationKey(profile?.phone, req.user.id);

        const { data: session } = await getDb()
            .from('ai_sessions')
            .select('user_id')
            .eq('id', sessionId)
            .single();

        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

        const { data, error } = await getDb()
            .from('ai_sessions')
            .update({ title: title.trim(), updated_at: new Date().toISOString() })
            .eq('id', sessionId)
            .select('id, title, created_at, updated_at')
            .single();

        if (error) throw error;
        res.json({ session: data });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to rename session') });
    }
};

export const clearSessionHistory = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const sessionId = req.params.id;
    if (!sessionId) return res.status(400).json({ error: 'Session ID is required' });

    try {
        const profile = await getBrokerProfile(req.user.id);
        const userId = resolveConversationKey(profile?.phone, req.user.id);

        const { data: session } = await getDb()
            .from('ai_sessions')
            .select('user_id')
            .eq('id', sessionId)
            .single();

        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

        await getDb().from('conversations').delete().eq('session_id', sessionId);
        await getDb()
            .from('ai_sessions')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', sessionId);

        res.json({ message: 'Session history cleared' });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to clear session history') });
    }
};

export const getAIStatus = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const context = await workspaceAccessService.resolveContext(req.user);
    const status = await aiService.getStatus(context.workspaceOwnerId);
    res.json(status);
};

export const getModels = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const context = await workspaceAccessService.resolveContext(req.user);
        const models = await modelDiscoveryService.discoverModels(context.workspaceOwnerId);
        res.json(models);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load models') });
    }
};

export const updateKey = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { provider, key } = req.body;
    if (!provider || !key) return res.status(400).json({ error: 'Provider and key are required' });

    try {
        const context = await workspaceAccessService.resolveContext(req.user);
        const result = await keyService.saveKey(context.workspaceOwnerId, provider, key);
        if (!result.success) return res.status(500).json({ error: result.error });
        res.json({ message: 'Key updated successfully' });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to update key') });
    }
};

export const propertySearch = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        const context = await workspaceAccessService.resolveContext(req.user);
        const result = await searchProperties(context.workspaceOwnerId, message);
        res.json(result);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({
            error: getErrorMessage(error, 'Property search is unavailable right now.'),
            response: 'Property search is unavailable right now.',
            properties: [],
        });
    }
};

export const testKey = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'Provider is required' });

    try {
        const context = await workspaceAccessService.resolveContext(req.user);
        const result = await keyService.testConnection(context.workspaceOwnerId, provider);
        if (!result.success) return res.status(400).json({ error: result.error });
        res.json({ message: 'Connected ✅' });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to test key') });
    }
};
