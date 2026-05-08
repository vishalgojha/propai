import { Request, Response } from 'express';
import { aiService } from '../services/aiService';
import { modelDiscoveryService } from '../services/modelDiscoveryService';
import { keyService } from '../services/keyService';
import { brokerWorkflowService } from '../services/brokerWorkflowService';
import type { BrokerToolIntent, BrokerToolPlan } from '../services/brokerWorkflowService';
import { agentRouterService } from '../services/agentRouterService';
import { PULSE_CHAT_SYSTEM_PROMPT } from '../services/pulseChatPrompt';
import { parseAgentResponse, toAgentResponse } from '../types/agent';
import { browserToolService } from '../services/browserToolService';
import { productKnowledgeService } from '../services/productKnowledgeService';
import { sessionManager } from '../whatsapp/SessionManager';
import { igrQueryService } from '../services/igrQueryService';
import {
    getConversationHistory,
    getConversationMessageCount,
    normalizeConversationPhoneNumber,
    saveToHistory,
} from '../memory/conversationMemory';
import { supabase, supabaseAdmin } from '../config/supabase';
import type { AgentRoutePlan } from '../services/agentRouterService';
import { buildIstSystemContext } from '../utils/istTime';

type StructuredToolCall = {
    toolCode: string;
    toolParams: Record<string, unknown>;
};

const WORKFLOW_INTENTS = new Set<BrokerToolIntent>([
    'save_listing',
    'save_requirement',
    'create_channel',
    'schedule_callback',
    'check_callbacks',
    'search_listings',
    'get_my_listings',
    'get_my_requirements',
    'search_my_crm',
]);

function isWorkflowIntent(intent: AgentRoutePlan['intent']): intent is BrokerToolIntent {
    return WORKFLOW_INTENTS.has(intent as BrokerToolIntent);
}

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

        const knowledgeAnswer = await productKnowledgeService.answer(tenantId, prompt);
        if (knowledgeAnswer) {
            const renderedReply = maybePersonalizeGreeting(knowledgeAnswer.reply, profile?.full_name, isFirstReply);
            await saveToHistory(conversationKey, prompt, renderedReply);
            return res.json({
                reply: renderedReply,
                text: renderedReply,
                agent_response: toAgentResponse(renderedReply),
                route: { intent: knowledgeAnswer.intent },
                capability_hint: buildCapabilityHint(knowledgeAnswer.intent),
            });
        }

        const browserToolPlan = browserToolService.detectPrompt(prompt);
        if (browserToolPlan) {
            const toolResult = await browserToolService.execute(browserToolPlan.tool, browserToolPlan.args);
            const agentResponse = toAgentResponse(
                toolResult.message,
                'text',
                toolResult.data,
            );
            const renderedReply = maybePersonalizeGreeting(agentResponse.message, profile?.full_name, isFirstReply);
            await saveToHistory(conversationKey, prompt, renderedReply);
            return res.json({
                reply: renderedReply,
                text: renderedReply,
                agent_response: agentResponse,
                route: { intent: browserToolPlan.tool },
                capability_hint: 'You can keep using web fetch, web search, listing extract, or RERA verify in plain language.',
            });
        }

        const igrIntent = detectIgrIntent(prompt);
        if (igrIntent) {
            const { buildingName, locality } = igrIntent;
            const transaction = buildingName
                ? await igrQueryService.getLastTransactionForBuilding(buildingName)
                : null;

            if (transaction) {
                const stats = transaction.locality
                    ? await igrQueryService.getLocalityStats(transaction.locality, 6)
                    : (locality ? await igrQueryService.getLocalityStats(locality, 6) : null);

                const marketRate = stats?.avg_price_per_sqft ?? null;
                const dealRate = transaction.price_per_sqft ?? null;
                const comparison = marketRate != null && dealRate != null
                    ? dealRate > marketRate ? 'above' : dealRate < marketRate ? 'below' : 'at'
                    : null;

                const rendered = [
                    `Last registered transaction for **${transaction.building_name || buildingName}** (${transaction.locality || locality || 'Unknown locality'})`,
                    '',
                    `- Date: ${formatIgrDate(transaction.reg_date)}`,
                    `- Consideration: ${formatInr(transaction.consideration)}`,
                    `- Area: ${formatSqft(transaction.area_sqft)}`,
                    `- Rate: ${formatRate(dealRate)}`,
                    stats?.transaction_count
                        ? `- Locality average (last 6 months): ${formatRate(marketRate)} across ${stats.transaction_count} transactions${comparison ? ` (this deal was ${comparison} market)` : ''}`
                        : null,
                ].filter(Boolean).join('\n');

                await saveToHistory(conversationKey, prompt, rendered);
                return res.json({
                    reply: rendered,
                    text: rendered,
                    agent_response: toAgentResponse(rendered),
                    route: { intent: 'igr_last_transaction' },
                    capability_hint: 'You can ask: “Give me the latest IGR transaction for <building/locality>” or “Compare <building> vs locality market rate”.',
                    data: { transaction, locality_stats: stats },
                });
            }

            if (locality) {
                const stats = await igrQueryService.getLocalityStats(locality, 6);
                if (stats.transaction_count > 0) {
                    const rendered = `No exact building match found. Locality average in **${stats.locality}** (last 6 months): ${formatRate(stats.avg_price_per_sqft)} across ${stats.transaction_count} transactions.`;
                    await saveToHistory(conversationKey, prompt, rendered);
                    return res.json({
                        reply: rendered,
                        text: rendered,
                        agent_response: toAgentResponse(rendered),
                        route: { intent: 'igr_locality_stats' },
                        capability_hint: 'If you share the exact building name (as per registration), I can try a closer match.',
                        data: { locality_stats: stats },
                    });
                }
            }

            const rendered = 'I could not find IGR transaction data for that building/locality in this workspace yet.';
            await saveToHistory(conversationKey, prompt, rendered);
            return res.json({
                reply: rendered,
                text: rendered,
                agent_response: toAgentResponse(rendered),
                route: { intent: 'igr_last_transaction' },
                capability_hint: 'If this is a new building, we might not have ingested its IGR feed yet. Share locality + building name and I’ll try again.',
            });
        }

        const directWorkflow = await brokerWorkflowService.handlePrompt(tenantId, prompt);
        if (directWorkflow.handled) {
            const capabilityHint = buildCapabilityHintFromReply(directWorkflow.reply);
            const agentResponse = toWorkflowAgentResponse(directWorkflow.reply, directWorkflow.data);
            const renderedReply = maybePersonalizeGreeting(agentResponse.message, profile?.full_name, isFirstReply);
            await saveToHistory(conversationKey, prompt, renderedReply);
            return res.json({
                reply: renderedReply,
                text: renderedReply,
                agent_response: agentResponse,
                workflow: directWorkflow.data,
                route: { intent: directWorkflow.data?.type || 'general_answer' },
                capability_hint: capabilityHint,
            });
        }

        const route = await agentRouterService.route(tenantId, prompt, history);
        const capabilityHint = buildCapabilityHint(route.intent);

        if (isWorkflowIntent(route.intent)) {
            const workflowPlan: BrokerToolPlan = { ...route, intent: route.intent };
            const workflow = await brokerWorkflowService.executePlan(tenantId, workflowPlan, prompt);
            if (workflow.handled) {
                const agentResponse = toWorkflowAgentResponse(workflow.reply, workflow.data);
                const renderedReply = maybePersonalizeGreeting(agentResponse.message, profile?.full_name, isFirstReply);
                await saveToHistory(conversationKey, prompt, renderedReply);
                return res.json({
                    reply: renderedReply,
                    text: renderedReply,
                    agent_response: agentResponse,
                    workflow: workflow.data,
                    route,
                    capability_hint: capabilityHint,
                });
            }
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
            buildPersonalizedSystemPrompt(profile?.full_name, PULSE_CHAT_SYSTEM_PROMPT, isFirstReply),
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

function detectIgrIntent(prompt: string): { buildingName: string | null; locality: string | null } | null {
    const lowered = String(prompt || '').toLowerCase();
    const looksLikeIgr = (
        lowered.includes('igr') ||
        lowered.includes('registration') ||
        lowered.includes('registered') ||
        lowered.includes('transaction') ||
        lowered.includes('sale deed') ||
        lowered.includes('stamp duty')
    );

    if (!looksLikeIgr) return null;

    const compact = lowered
        .replace(/[^\p{L}\p{N}\s,.-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const localityMatch = compact.match(/\b(in|at|near)\s+([a-z][a-z0-9 .-]{2,40})$/i);
    const locality = localityMatch?.[2]?.trim() || null;

    const cleanedBuilding = compact
        .replace(/\b(latest|last|recent|transaction|transactions|data|details|igr|registration|registered|record|records|sale deed|stamp duty|of|for|please|plz|chahiye|chaiye|chahiyeh)\b/g, ' ')
        .replace(/\b(in|at|near)\b\s+[a-z][a-z0-9 .-]{2,40}$/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const buildingName = cleanedBuilding.length >= 3 ? cleanedBuilding : null;
    if (!buildingName && !locality) return null;
    return { buildingName, locality };
}

function formatInr(value: number | null) {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatSqft(value: number | null) {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    return `${Math.round(value).toLocaleString('en-IN')} sqft`;
}

function formatRate(value: number | null) {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    return `₹${Math.round(value).toLocaleString('en-IN')}/sqft`;
}

function formatIgrDate(value: string | null) {
    if (!value) return 'Unknown';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

async function getBrokerProfile(tenantId: string) {
    const client = supabaseAdmin ?? supabase;
    const { data } = await client
        .from('profiles')
        .select('full_name, phone')
        .eq('id', tenantId)
        .maybeSingle();

    return data
        ? {
            full_name: data.full_name || '',
            phone: normalizeConversationPhoneNumber(data.phone || tenantId),
        }
        : null;
}

function buildPersonalizedSystemPrompt(fullName: string | undefined, basePrompt: string, isFirstReply = false) {
    const promptParts = [
        basePrompt,
        buildIstSystemContext(),
    ];

    if (!fullName?.trim()) {
        return promptParts.join('\n\n');
    }

    promptParts.push([
        `Broker profile name: ${fullName.trim()}.`,
        `Conversation state: this ${isFirstReply ? 'is' : 'is not'} the first assistant reply in this conversation.`,
        'If this is the first reply, greet the broker naturally by name.',
    ].join('\n'));
    return promptParts.join('\n\n');
}

function maybePersonalizeGreeting(reply: string, _fullName?: string, _shouldGreet?: boolean) {
    return reply.trim();
}

function buildCapabilityHint(intent: string) {
    switch (intent) {
        case 'save_listing':
            return 'You can say: "Add this listing ..." and I will save it for you.';
        case 'save_requirement':
            return 'You can say: "Add this requirement ..." and I will save the buyer brief.';
        case 'create_channel':
            return 'You can say: "Create a Powai rentals channel" and I will turn that into a personal stream channel.';
        case 'get_my_listings':
            return 'You can say: "Show my saved listings in Andheri" and I will pull them from your CRM.';
        case 'get_my_requirements':
            return 'You can say: "Show my buyer requirements for Powai" and I will pull them from your CRM.';
        case 'search_my_crm':
            return 'You can say: "Search my CRM for Bandra 3BHK" and I will search across saved listings and requirements.';
        case 'schedule_callback':
            return 'You can say: "Schedule a follow-up for Raj tomorrow" and I will set the reminder.';
        case 'check_callbacks':
            return 'You can say: "Show my follow-up queue" to review pending reminders.';
        case 'search_listings':
            return 'You can ask me to find matching inventory in plain language.';
        case 'identity_question':
            return 'You can ask who built PropAI, what Pulse is, or whether I’m AI, and I’ll answer directly.';
        case 'runtime_status_question':
            return 'You can ask which model is active, whether WhatsApp is connected, which number is live, or whether web tools are available.';
        case 'privacy_or_limits_question':
            return 'You can ask what PropAI stores, whether I auto-message anyone, and what your current workspace plan allows.';
        case 'support_issue':
            return 'If something feels broken, send what happened and I’ll guide you or ask for a screenshot for support.';
        case 'general_chat':
            return '';
        case 'general_answer':
            return '';
        default:
            return '';
    }
}

function buildCapabilityHintFromReply(reply: string) {
    const lowered = reply.toLowerCase();
    if (lowered.includes('listing')) return buildCapabilityHint('save_listing');
    if (lowered.includes('requirement')) return buildCapabilityHint('save_requirement');
    if (lowered.includes('channel')) return buildCapabilityHint('create_channel');
    if (lowered.includes('crm')) return buildCapabilityHint('search_my_crm');
    if (lowered.includes('callback') || lowered.includes('follow-up')) return buildCapabilityHint('schedule_callback');
    if (lowered.includes('queue')) return buildCapabilityHint('check_callbacks');
    if (lowered.includes('search')) return buildCapabilityHint('search_listings');
    return buildCapabilityHint('general_answer');
}

function logAgentInvocation(stage: 'request' | 'response', metadata: Record<string, unknown>) {
    console.info('[agent-invocation]', JSON.stringify({ stage, ...metadata }));
}

function toWorkflowAgentResponse(reply: string, data?: any) {
    const outputFormat = data?.output_format === 'bullet_list'
        || data?.output_format === 'table'
        || data?.output_format === 'summary_card'
        || data?.output_format === 'timeline'
        || data?.output_format === 'text'
        ? data.output_format
        : 'text';

    const payload = data && typeof data === 'object'
        ? Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'output_format'))
        : undefined;

    return toAgentResponse(reply, outputFormat, payload);
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

            const client = await sessionManager.getSession(tenantId);
            if (!client) {
                return 'WhatsApp is not connected right now, so I could not send that message.';
            }

            const remoteJid = normalizeWhatsAppJid(contactNumber);
            if (!remoteJid) {
                return 'I could not send that because the WhatsApp number was invalid.';
            }

            await client.sendText(remoteJid, messageContent);
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
    const { message, mode } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    try {
        // Search listings in database based on the message
        const { supabase } = await import('../config/supabase');
        const searchText = message.toLowerCase();
        
        // Simple keyword matching for demo
        let query = supabase.from('listings').select('*').eq('status', 'Active');
        
        const { data: listings, error } = await query;
        
        if (error) throw error;
        
        // Filter properties based on the query
        const properties = (listings || []).filter((listing: any) => {
            const text = JSON.stringify(listing.structured_data).toLowerCase();
            return text.includes(searchText) || 
                   searchText.includes('bandra') && text.includes('bandra') ||
                   searchText.includes('worli') && text.includes('worli') ||
                   searchText.includes('juhu') && text.includes('juhu') ||
                   searchText.includes('powai') && text.includes('powai') ||
                   searchText.includes('2bhk') && text.includes('2bhk') ||
                   searchText.includes('3bhk') && text.includes('3bhk') ||
                   searchText.includes('rental') && text.includes('rent') ||
                   searchText.includes('sale') && text.includes('sale');
        }).slice(0, 5);

        const { text: aiResponse } = await aiService.chat(
            `You are a Mumbai real estate expert. A client asked: "${message}". Respond helpfully about finding properties in Mumbai.`,
            'Auto',
            undefined,
            tenantId
        ).catch(() => ({ text: 'I found properties. Can you tell me more about your budget and preferred location?' }));

        res.json({
            response: aiResponse,
            properties: properties.map((p: any) => ({
                id: p.id,
                title: p.structured_data?.title || 'Property in Mumbai',
                location: p.structured_data?.location || 'Mumbai',
                price: p.structured_data?.price || 'Contact for price',
                details: p.raw_text || '',
                match: Math.floor(70 + Math.random() * 30)
            }))
        });
    } catch (error: any) {
        // Return demo properties if DB not set up
        res.json({
            response: "I understand you're looking for property in Mumbai. Here are some options:",
            properties: [
                { id: '1', title: '2BHK in Bandra West', location: 'Bandra West', price: '₹85L', details: '950 sqft, modern amenities', match: 92 },
                { id: '2', title: '3BHK in Worli Sea Face', location: 'Worli', price: '₹1.2Cr', details: '1500 sqft, sea view', match: 85 },
                { id: '3', title: '1BHK Rental in Powai', location: 'Powai', price: '₹35k/mo', details: '650 sqft, fully furnished', match: 78 }
            ]
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
