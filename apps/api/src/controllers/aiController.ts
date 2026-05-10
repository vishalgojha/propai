import { Request, Response } from 'express';
import { aiService } from '../services/aiService';
import { modelDiscoveryService } from '../services/modelDiscoveryService';
import { keyService } from '../services/keyService';
import { agentRouterService } from '../services/agentRouterService';
import { PULSE_CHAT_SYSTEM_PROMPT } from '../services/pulseChatPrompt';
import { parseAgentResponse, toAgentResponse } from '../types/agent';
import {
    getConversationHistory,
    getConversationMessageCount,
    saveToHistory,
} from '../memory/conversationMemory';
import {
    buildCapabilityHint,
    buildPersonalizedSystemPrompt,
    executeSharedRoute,
    getBrokerProfile,
} from '../services/unifiedAgentService';
import { searchProperties } from '../services/propertySearchService';
import { buildAttachmentContext } from '../services/attachmentContextService';
import { extractStructuredToolCall, executeStructuredToolCall } from '../services/structuredToolService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import '../types/express';

export const chat = async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const tenantId = user.id;
    const rawPrompt = req.body.prompt || req.body.message;
    const modelPreference = req.body.modelPreference || req.body.model;
    if (!rawPrompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        const profile = await getBrokerProfile(tenantId);
        const conversationKey = profile?.phone || tenantId;
        const history = await getConversationHistory(conversationKey);
        const isFirstReply = (await getConversationMessageCount(conversationKey)) === 0;

        const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
        const attachmentContext = await buildAttachmentContext(tenantId, attachments);
        const prompt = attachmentContext
            ? `${rawPrompt}\n\n---\nAttached context:\n${attachmentContext}\n---`
            : rawPrompt;

        const route = await agentRouterService.route(tenantId, prompt, history);
        const capabilityHint = buildCapabilityHint(route.intent);

        const sharedRouteResult = await executeSharedRoute(tenantId, route, prompt);
        if (sharedRouteResult.handled) {
            const renderedReply = maybePersonalizeGreeting(sharedRouteResult.reply, profile?.full_name, isFirstReply);
            await saveToHistory(conversationKey, prompt, renderedReply);
            return res.json({
                reply: renderedReply,
                text: renderedReply,
                agent_response: sharedRouteResult.agentResponse,
                workflow: sharedRouteResult.workflowData,
                route,
                capability_hint: sharedRouteResult.capabilityHint || capabilityHint,
                data: sharedRouteResult.data,
            });
        }

        logAgentInvocation('request', {
            source: 'aiController',
            tenantId,
            toolsPresent: false,
            toolsCount: 0,
            route: route.intent,
        });

        const response = await aiService.chat(
            prompt,
            modelPreference,
            undefined,
            tenantId,
            buildPersonalizedSystemPrompt(profile, PULSE_CHAT_SYSTEM_PROMPT, isFirstReply),
            history
        );
        const structuredToolCall = extractStructuredToolCall(response.text);
        logAgentInvocation('response', {
            source: 'aiController',
            tenantId,
            toolsPresent: false,
            toolsCount: 0,
            responseBlockType: structuredToolCall ? 'tool' : 'text',
            toolName: structuredToolCall?.toolCode || null,
        });
        if (structuredToolCall) {
            const toolReply = await executeStructuredToolCall(tenantId, structuredToolCall);
            const renderedReply = maybePersonalizeGreeting(toolReply, profile?.full_name, isFirstReply);
            await saveToHistory(conversationKey, prompt, renderedReply);
            return res.json({
                ...response,
                reply: renderedReply,
                text: renderedReply,
                agent_response: toAgentResponse(renderedReply),
                route,
                capability_hint: capabilityHint,
            });
        }
        const agentResponse = parseAgentResponse(response.text);
        const renderedReply = maybePersonalizeGreeting(agentResponse.message, profile?.full_name, isFirstReply);
        await saveToHistory(conversationKey, prompt, renderedReply);
        res.json({ ...response, reply: renderedReply, text: renderedReply, agent_response: agentResponse, route, capability_hint: capabilityHint });
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

function maybePersonalizeGreeting(reply: string, _fullName?: string, _shouldGreet?: boolean) {
    return reply.trim();
}

function logAgentInvocation(stage: 'request' | 'response', metadata: Record<string, unknown>) {
    console.info('[agent-invocation]', JSON.stringify({ stage, ...metadata }));
}


export const getAIStatus = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const status = await aiService.getStatus(req.user.id);
    res.json(status);
};

export const getModels = async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const models = await modelDiscoveryService.discoverModels(req.user.id);
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
        const result = await keyService.saveKey(req.user.id, provider, key);
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
        const result = await searchProperties(req.user.id, message);
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
        const result = await keyService.testConnection(req.user.id, provider);
        if (!result.success) return res.status(400).json({ error: result.error });
        res.json({ message: 'Connected ✅' });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to test key') });
    }
};
