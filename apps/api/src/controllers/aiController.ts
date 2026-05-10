import { Request, Response } from 'express';
import { aiService } from '../services/aiService';
import { modelDiscoveryService } from '../services/modelDiscoveryService';
import { keyService } from '../services/keyService';
import { agentRouterService } from '../services/agentRouterService';
import { PULSE_CHAT_SYSTEM_PROMPT } from '../services/pulseChatPrompt';
import { parseAgentResponse, toAgentResponse } from '../types/agent';
import { agentToolService } from '../services/agentToolService';
import {
    getConversationHistory,
    getConversationMessageCount,
    saveToHistory,
} from '../memory/conversationMemory';
import { supabase, supabaseAdmin } from '../config/supabase';
import {
    buildCapabilityHint,
    buildPersonalizedSystemPrompt,
    executeSharedRoute,
    getBrokerProfile,
} from '../services/unifiedAgentService';

type StructuredToolCall = {
    toolCode: string;
    toolParams: Record<string, unknown>;
};

export const chat = async (req: Request, res: Response) => {
    const user = (req as any).user;
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
    } catch (error: any) {
        const capabilityHint = buildCapabilityHint('general_answer');
        const fallbackError = error?.message || 'AI provider unavailable';
        const agentResponse = toAgentResponse(`Pulse could not reach the model chain. ${fallbackError}`);
        res.json({
            reply: agentResponse.message,
            text: agentResponse.message,
            agent_response: agentResponse,
            route: { intent: 'general_answer' },
            capability_hint: capabilityHint,
            fallback_error: fallbackError,
            provider_errors: error?.providerErrors || [],
        });
    }
};

async function buildAttachmentContext(tenantId: string, attachments: any[]) {
    const ids = attachments
        .map((item) => (typeof item === 'string' ? item : item?.fileId))
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .slice(0, 6);

    if (ids.length === 0) return '';

    const client = supabaseAdmin ?? supabase;
    const { data, error } = await client
        .from('workspace_files')
        .select('id, file_name, mime_type, extracted_text, extraction_status, extraction_error')
        .eq('workspace_id', tenantId)
        .in('id', ids);

    if (error || !Array.isArray(data) || data.length === 0) {
        return '';
    }

    const parts: string[] = [];
    for (const row of data) {
        const name = String((row as any).file_name || 'attachment');
        const mime = String((row as any).mime_type || '');
        const text = String((row as any).extracted_text || '').trim();
        const status = String((row as any).extraction_status || '');
        const extractionError = String((row as any).extraction_error || '').trim();
        if (!text) {
            if (status === 'failed') {
                parts.push(`[${name}${mime ? ` (${mime})` : ''}] OCR/text extraction failed${extractionError ? `: ${extractionError}` : '.'} If this is a scanned PDF/image, try a clearer file or paste the key text.`);
            } else {
                parts.push(`[${name}${mime ? ` (${mime})` : ''}] No text extracted. If this is a scanned PDF/image and OCR is not enabled on this deployment, the model cannot read it. Please paste the key text or upload a text-based PDF/TXT.`);
            }
            continue;
        }
        const clipped = text.length > 30_000 ? `${text.slice(0, 30_000)}\n\n[Truncated]` : text;
        parts.push(`[${name}${mime ? ` (${mime})` : ''}]\n${clipped}`);
    }

    return parts.join('\n\n');
}

function maybePersonalizeGreeting(reply: string, _fullName?: string, _shouldGreet?: boolean) {
    return reply.trim();
}

function logAgentInvocation(stage: 'request' | 'response', metadata: Record<string, unknown>) {
    console.info('[agent-invocation]', JSON.stringify({ stage, ...metadata }));
}

function extractStructuredToolCall(rawText: string): StructuredToolCall | null {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || rawText.trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start < 0 || end <= start) {
        return null;
    }

    try {
        const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
        if (typeof parsed.tool_code !== 'string') {
            return null;
        }

        return {
            toolCode: parsed.tool_code,
            toolParams: parsed.tool_params && typeof parsed.tool_params === 'object'
                ? parsed.tool_params as Record<string, unknown>
                : {},
        };
    } catch {
        return null;
    }
}

function normalizeWhatsAppJid(value: string) {
    const digits = value.split('').filter(c => c >= '0' && c <= '9').join('');
    return digits ? `${digits}@s.whatsapp.net` : '';
}

async function executeStructuredToolCall(tenantId: string, call: StructuredToolCall) {
    switch (call.toolCode) {
        case 'send_message_to_whatsapp_contact': {
            const contactNumber = String(call.toolParams.contact_number || '').trim();
            const messageContent = String(call.toolParams.message_content || '').trim();

            if (!contactNumber || !messageContent) {
                return 'I could not send that because the contact number or message was missing.';
            }

            const remoteJid = normalizeWhatsAppJid(contactNumber);
            if (!remoteJid) {
                return 'I could not send that because the WhatsApp number was invalid.';
            }

            const toolResult = await agentToolService.executeTool('send_whatsapp_message', {
                remote_jid: remoteJid,
                text: messageContent,
            }, {
                tenantId,
                remoteJid,
                promptText: messageContent,
            });

            if (toolResult?.success === false || toolResult?.error) {
                return 'WhatsApp is not connected right now, so I could not send that message.';
            }

            return `Sent. I sent "${messageContent}" to ${contactNumber}.`;
        }
        default:
            return 'I recognized the requested action, but that tool is not wired in this workspace yet.';
    }
}


export const getAIStatus = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const status = await aiService.getStatus(user?.id);
    res.json(status);
};

export const getModels = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;

    try {
        const models = await modelDiscoveryService.discoverModels(tenantId);
        res.json(models);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateKey = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { provider, key } = req.body;
    if (!provider || !key) return res.status(400).json({ error: 'Provider and key are required' });

    try {
        const result = await keyService.saveKey(tenantId, provider, key);
        if (!result.success) return res.status(500).json({ error: result.error });
        res.json({ message: 'Key updated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const propertySearch = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user?.id;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        const { supabase } = await import('../config/supabase');
        const normalizedTokens = String(message)
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 3);

        const { data: listings, error } = await supabase
            .from('listings')
            .select('id, raw_text, structured_data')
            .eq('status', 'Active')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        const ranked = (listings || [])
            .map((listing: any) => {
                const haystack = JSON.stringify(listing.structured_data || {}).toLowerCase();
                const score = normalizedTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
                return { listing, score };
            })
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        const properties = ranked.map(({ listing, score }) => ({
            id: listing.id,
            title: listing.structured_data?.title || listing.structured_data?.building_name || 'Property listing',
            location: listing.structured_data?.location || listing.structured_data?.locality || 'Location unavailable',
            price: listing.structured_data?.price || listing.structured_data?.budget || 'Price unavailable',
            details: listing.raw_text || '',
            match: Math.max(50, Math.min(99, score * 20)),
        }));

        const aiResponse = properties.length
            ? `I found ${properties.length} matching ${properties.length === 1 ? 'listing' : 'listings'} from your workspace data.`
            : 'I could not find any trustworthy listing match for that query in your workspace right now.';

        res.json({
            response: aiResponse,
            properties,
        });
    } catch (error: any) {
        res.status(500).json({
            error: error.message || 'Property search is unavailable right now.',
            response: 'Property search is unavailable right now.',
            properties: [],
        });
    }
};

export const testKey = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'Provider is required' });

    try {
        const result = await keyService.testConnection(tenantId, provider);
        if (!result.success) return res.status(400).json({ error: result.error });
        res.json({ message: 'Connected ✅' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
