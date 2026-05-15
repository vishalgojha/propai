import { brokerWorkflowService } from './brokerWorkflowService';
import type { BrokerToolIntent, BrokerToolPlan } from './brokerWorkflowService';
import { browserToolService } from './browserToolService';
import { aiService } from './aiService';
import { igrQueryService } from './igrQueryService';
import { supabase, supabaseAdmin } from '../config/supabase';
import type { AgentRoutePlan } from './agentRouterService';
import { toAgentResponse } from '../types/agent';
import { normalizeConversationPhoneNumber } from '../memory/conversationMemory';
import { buildIstSystemContext } from '../utils/istTime';

type BrokerProfile = {
    full_name: string;
    phone: string;
    email: string | null;
    app_role: string | null;
    agency_name: string | null;
} | null;

type SharedRouteExecutionResult =
    | { handled: false }
    | {
        handled: true;
        reply: string;
        agentResponse: ReturnType<typeof toAgentResponse>;
        data?: Record<string, unknown>;
        capabilityHint?: string;
        workflowData?: unknown;
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

const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'vishal@chaoscraftslabs.com',
]);

export function isWorkflowIntent(intent: AgentRoutePlan['intent']): intent is BrokerToolIntent {
    return WORKFLOW_INTENTS.has(intent as BrokerToolIntent);
}

export function isRoutedToolIntent(intent: AgentRoutePlan['intent']) {
    return [
        'web_fetch',
        'search_web',
        'verify_rera',
        'fetch_property_listing',
        'igr_last_transaction',
        'igr_locality_stats',
    ].includes(intent);
}

export async function executeSharedRoute(
    tenantId: string,
    route: AgentRoutePlan,
    prompt: string,
): Promise<SharedRouteExecutionResult> {
    if (isRoutedToolIntent(route.intent)) {
        return executeRoutedToolIntent(route, prompt);
    }

    if (isWorkflowIntent(route.intent)) {
        const workflowPlan: BrokerToolPlan = { ...route, intent: route.intent };
        const workflow = await brokerWorkflowService.executePlan(tenantId, workflowPlan, prompt);
        if (!workflow.handled) {
            return { handled: false };
        }

        const agentResponse = toWorkflowAgentResponse(workflow.reply, workflow.data);
        return {
            handled: true,
            reply: agentResponse.message,
            agentResponse,
            workflowData: workflow.data,
            capabilityHint: buildCapabilityHint(route.intent),
        };
    }

    return { handled: false };
}

export async function getBrokerProfile(tenantId: string): Promise<BrokerProfile> {
    const client = supabaseAdmin ?? supabase;
    const [profileResult, workspaceResult] = await Promise.all([
        client
            .from('profiles')
            .select('full_name, phone, email, app_role')
            .eq('id', tenantId)
            .maybeSingle(),
        client
            .from('workspaces')
            .select('agency_name')
            .eq('owner_id', tenantId)
            .maybeSingle(),
    ]);

    const profile = profileResult.data;
    if (!profile) return null;

    return {
        full_name: profile.full_name || '',
        phone: normalizeConversationPhoneNumber(profile.phone || tenantId),
        email: profile.email || null,
        app_role: profile.app_role || null,
        agency_name: workspaceResult.data?.agency_name || null,
    };
}

export function buildPersonalizedSystemPrompt(
    profile: { full_name?: string; email?: string | null; app_role?: string | null; agency_name?: string | null } | null | undefined,
    basePrompt: string,
    isFirstReply = false,
    identityMd?: string,
) {
    const promptParts: string[] = [];

    if (identityMd) {
        promptParts.push(identityMd, '---', '');
    }

    promptParts.push(basePrompt, buildIstSystemContext());

    const fullName = profile?.full_name?.trim() || '';
    const isOwner = profile?.app_role === 'super_admin' || isOwnerSuperAdminEmail(profile?.email);

    if (fullName) {
        const parts = [`Broker profile name: ${fullName}.`];
        if (profile?.agency_name) {
            parts.push(`Agency: ${profile.agency_name}.`);
        }
        parts.push(
            `Conversation state: this ${isFirstReply ? 'is' : 'is not'} the first assistant reply in this conversation.`,
            'If this is the first reply, greet the broker naturally by name.',
        );
        promptParts.push(parts.join('\n'));
    }

    if (isOwner) {
        promptParts.push([
            'Workspace role: owner / super admin.',
            'This user is the builder-owner side of PropAI, not a generic broker seat.',
            'If they ask who built PropAI, ownership, roadmap, tool wiring, MCP, or product behavior, answer directly and at an operator/product level.',
        ].join('\n'));
    }

    return promptParts.join('\n\n');
}

export function buildCapabilityHint(intent: string) {
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
        case 'web_fetch':
            return 'You can paste a property or project URL and I will fetch the page contents for you.';
        case 'search_web':
            return 'You can ask me to search the web for project, builder, or market information.';
        case 'verify_rera':
            return 'You can ask me to verify a project RERA registration in plain language.';
        case 'fetch_property_listing':
            return 'You can paste a listing URL and I will extract structured property details.';
        case 'igr_last_transaction':
        case 'igr_locality_stats':
            return 'You can ask for the latest IGR transaction or locality registration stats using building plus locality.';
        case 'identity_question':
            return 'You can ask who built PropAI, what Pulse is, or whether I’m AI, and I’ll answer directly.';
        case 'runtime_status_question':
            return 'You can ask which model is active, whether WhatsApp is connected, which number is live, or whether web tools are available.';
        case 'privacy_or_limits_question':
            return 'You can ask what PropAI stores, whether I auto-message anyone, and what your current workspace plan allows.';
        case 'support_issue':
            return 'If something feels broken, send what happened and I’ll guide you or ask for a screenshot for support.';
        case 'general_chat':
        case 'general_answer':
        default:
            return '';
    }
}

function isOwnerSuperAdminEmail(email?: string | null) {
    return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

async function executeRoutedToolIntent(route: AgentRoutePlan, prompt: string): Promise<SharedRouteExecutionResult> {
    switch (route.intent) {
        case 'web_fetch':
        case 'search_web':
        case 'verify_rera':
        case 'fetch_property_listing': {
            const fallbackPlan = browserToolService.detectPrompt(prompt);
            const rawArgs = route.args && typeof route.args === 'object' ? route.args : {};
            const args = Object.keys(rawArgs).length > 0 ? rawArgs : (fallbackPlan?.args || {});
            const toolResult = await browserToolService.execute(route.intent, args);
            return {
                handled: true,
                reply: toolResult.message,
                agentResponse: toAgentResponse(toolResult.message, 'text', toolResult.data),
                capabilityHint: 'You can keep using web fetch, web search, listing extract, or RERA verify in plain language.',
                data: toolResult.data,
            };
        }
        case 'igr_last_transaction':
        case 'igr_locality_stats': {
            const parsed = detectIgrIntent(prompt);
            const routeArgs = route.args && typeof route.args === 'object' ? route.args as Record<string, unknown> : {};
            const buildingName = String(routeArgs.buildingName || routeArgs.building_name || parsed?.buildingName || '').trim() || null;
            const locality = String(routeArgs.locality || parsed?.locality || '').trim() || null;
            const liveIgrResult = await tryLiveIgrFallback({ buildingName, locality, prompt });
            if (liveIgrResult) {
                return liveIgrResult;
            }

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
                    `Live IGR fetch was unavailable, so here is the latest local IGR record for **${transaction.building_name || buildingName}** (${transaction.locality || locality || 'Unknown locality'})`,
                    '',
                    `- Date: ${formatIgrDate(transaction.reg_date)}`,
                    `- Consideration: ${formatInr(transaction.consideration)}`,
                    `- Area: ${formatSqft(transaction.area_sqft)}`,
                    `- Rate: ${formatRate(dealRate)}`,
                    stats?.transaction_count
                        ? `- Locality average (last 6 months): ${formatRate(marketRate)} across ${stats.transaction_count} transactions${comparison ? ` (this deal was ${comparison} market)` : ''}`
                        : null,
                ].filter(Boolean).join('\n');

                return {
                    handled: true,
                    reply: rendered,
                    agentResponse: toAgentResponse(rendered),
                    capabilityHint: 'I now try live IGR/GRAS lookup first. Local data is only a fallback when the live source cannot be extracted reliably.',
                    data: { transaction, locality_stats: stats, buildingName, locality, source: 'local_fallback' },
                };
            }

            const rendered = buildingName || locality
                ? `I could not extract a reliable live GRAS/IGR result for ${[buildingName, locality].filter(Boolean).join(', ')} right now, and there is no usable local fallback match either.`
                : 'I could not resolve the building or locality clearly enough to search IGR data yet.';
            return {
                handled: true,
                reply: rendered,
                agentResponse: toAgentResponse(rendered),
                capabilityHint: 'Try the exact registered building name plus locality, for example: “Latest IGR for Kalpataru Magnus, Bandra East”. Live GRAS/IGR lookup is now attempted first.',
                data: { buildingName, locality },
            };
        }
        default:
            return { handled: false };
    }
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

    let locality: string | null = null;
    let cleanedBuilding = compact;

    const commaParts = compact
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    if (commaParts.length >= 2) {
        const tail = commaParts[commaParts.length - 1];
        if (tail.length >= 3) {
            locality = tail;
            cleanedBuilding = commaParts.slice(0, -1).join(' ');
        }
    }

    if (!locality) {
        const localityMatch = compact.match(/\b(in|at|near|on)\s+([a-z][a-z0-9 .-]{2,40})$/i);
        locality = sanitizeIgrLocality(localityMatch?.[2] || null);
    }

    cleanedBuilding = cleanedBuilding
        .replace(/\b(hey|hi|hello|bro|bhai|please|plz|find|fetch|get|give|show|tell|me|using|use|with|for|of|the|a|an|latest|last|recent|transaction|transactions|tractions|data|details|igr|irg|registration|registered|record|records|sale deed|stamp duty|rent|rental|sale|resale|purchase|buy|sell)\b/g, ' ')
        .replace(/\b(in|at|near|on)\b\s+[a-z][a-z0-9 .-]{2,40}$/i, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const buildingName = cleanedBuilding.length >= 3 ? cleanedBuilding : null;
    if (!buildingName && !locality) return null;
    return { buildingName, locality };
}

function sanitizeIgrLocality(value: string | null) {
    const cleaned = String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s.-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) {
        return null;
    }

    const tokens = cleaned.split(' ').filter(Boolean);
    const blocked = new Set([
        'igr', 'irg', 'data', 'transaction', 'transactions', 'record', 'records',
        'registered', 'registration', 'latest', 'last', 'recent', 'rent', 'rental',
        'sale', 'resale', 'buy', 'sell', 'purchase', 'deed', 'stamp', 'duty',
    ]);

    if (tokens.length > 4 || tokens.some((token) => blocked.has(token))) {
        return null;
    }

    return cleaned;
}

async function tryLiveIgrFallback(input: {
    buildingName: string | null;
    locality: string | null;
    prompt: string;
}): Promise<SharedRouteExecutionResult | null> {
    const target = [input.buildingName, input.locality].filter(Boolean).join(', ').trim() || input.prompt.trim();
    if (!target) {
        return null;
    }

    const searchQuery = [
        `"${input.buildingName || target}"`,
        input.locality || '',
        'Maharashtra IGR OR GRAS latest transaction sale rent registration',
    ].filter(Boolean).join(' ');

    try {
        const searchResult = await browserToolService.execute('search_web', { query: searchQuery });
        const items = Array.isArray(searchResult.data?.items)
            ? searchResult.data.items as Array<Record<string, unknown>>
            : [];

        const preferred = items.find((item) => {
            const url = String(item.url || '').toLowerCase();
            return url.includes('igrmaharashtra') || url.includes('igrs.maharashtra') || url.includes('registration');
        }) || items[0];

        const candidateUrl = typeof preferred?.url === 'string' ? preferred.url : null;
        if (!candidateUrl) {
            return {
                handled: true,
                reply: `I couldn't find a reliable live IGR result for ${target} right now. Here are the closest web results I found:\n\n${searchResult.message}`,
                agentResponse: toAgentResponse(`I couldn't find a reliable live IGR result for ${target} right now. Here are the closest web results I found:\n\n${searchResult.message}`),
                capabilityHint: 'You can share the exact registered building name plus locality, and I will try both the local IGR dataset and a live GRAS/IGR web lookup.',
                data: {
                    live_search_query: searchQuery,
                    live_search_results: items,
                },
            };
        }

        const pageResult = await browserToolService.execute('web_fetch', { url: candidateUrl });
        const pageText = String(pageResult.message || '').trim();
        if (!pageText) {
            return {
                handled: true,
                reply: `I found a possible live IGR source for ${target}, but I could not read enough page content to extract the transaction cleanly.\n\n${candidateUrl}`,
                agentResponse: toAgentResponse(`I found a possible live IGR source for ${target}, but I could not read enough page content to extract the transaction cleanly.\n\n${candidateUrl}`),
                capabilityHint: 'You can retry with the exact building name and locality. I will try both the local IGR dataset and a live source lookup.',
                data: {
                    live_search_query: searchQuery,
                    live_source_url: candidateUrl,
                },
            };
        }

        const extractionPrompt = `You are extracting Maharashtra IGR / GRAS transaction data from a fetched web page.
Return valid JSON only. No markdown.

Return this exact shape:
{
  "found": true | false,
  "building_name": "string or null",
  "locality": "string or null",
  "registration_date": "string or null",
  "consideration": number or null,
  "area_sqft": number or null,
  "price_per_sqft": number or null,
  "transaction_type": "sale | rent | leave_and_license | unknown",
  "summary": "short plain English summary or null",
  "confidence_note": "string or null"
}

Requested building: ${input.buildingName || 'unknown'}
Requested locality: ${input.locality || 'unknown'}
Source URL: ${candidateUrl}

Fetched page text:
"""
${pageText.slice(0, 8000)}
"""`;

        const extraction = await aiService.chat(
            extractionPrompt,
            'Auto',
            'listing_parsing',
            undefined,
            'Extract transaction details from IGR/GRAS page text. Return JSON only.'
        );

        const parsed = safeParseJson(extraction.text) as Record<string, unknown> | null;
        if (!parsed || parsed.found !== true) {
            return {
                handled: true,
                reply: `I found a live IGR/GRAS source for ${target}, but could not confidently extract the transaction details.\n\nSource: ${candidateUrl}`,
                agentResponse: toAgentResponse(`I found a live IGR/GRAS source for ${target}, but could not confidently extract the transaction details.\n\nSource: ${candidateUrl}`),
                capabilityHint: 'You can retry with the exact registered building name and locality. I will try both local data and a live source lookup.',
                data: {
                    live_search_query: searchQuery,
                    live_source_url: candidateUrl,
                    live_extraction_raw: extraction.text,
                },
            };
        }

        const rendered = [
            `Live IGR/GRAS result for **${String(parsed.building_name || input.buildingName || target)}** (${String(parsed.locality || input.locality || 'Unknown locality')})`,
            '',
            `- Date: ${formatIgrDate(asNullableString(parsed.registration_date))}`,
            `- Consideration: ${formatInr(asNullableNumber(parsed.consideration))}`,
            `- Area: ${formatSqft(asNullableNumber(parsed.area_sqft))}`,
            `- Rate: ${formatRate(asNullableNumber(parsed.price_per_sqft))}`,
            parsed.transaction_type ? `- Type: ${String(parsed.transaction_type)}` : null,
            parsed.summary ? `- Summary: ${String(parsed.summary)}` : null,
            `- Source: ${candidateUrl}`,
        ].filter(Boolean).join('\n');

        return {
            handled: true,
            reply: rendered,
            agentResponse: toAgentResponse(rendered),
            capabilityHint: 'I first check local IGR data, then fall back to a live GRAS/IGR web lookup when the local dataset has no match.',
            data: {
                live_search_query: searchQuery,
                live_source_url: candidateUrl,
                live_extraction: parsed,
            },
        };
    } catch (error) {
        console.warn('[unifiedAgentService] Live IGR fallback failed:', error);
        return null;
    }
}

function safeParseJson(text: string) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || text.trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) {
        return null;
    }

    try {
        return JSON.parse(candidate.slice(start, end + 1));
    } catch {
        return null;
    }
}

function asNullableString(value: unknown) {
    const text = String(value || '').trim();
    return text || null;
}

function asNullableNumber(value: unknown) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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
