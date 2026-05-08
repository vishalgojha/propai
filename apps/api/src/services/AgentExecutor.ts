import { aiService } from './aiService';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase, supabaseAdmin } from '../config/supabase';
import { safeJSONParse } from '../utils/jsonUtils';
import { brokerWorkflowService } from './brokerWorkflowService';
import { parseAgentResponse, toAgentResponse } from '../types/agent';
import { renderOutput } from '../whatsapp/formatter';
import {
    getConversationHistory,
    getConversationMessageCount,
    normalizeConversationPhoneNumber,
    saveToHistory,
} from '../memory/conversationMemory';
import { followUpService } from './followUpService';
import { subscriptionService } from './subscriptionService';
import { igrQueryService } from './igrQueryService';

type ChatTurn = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

function normalizeComparablePhone(value?: string | null) {
    const digits = String(value || '').split('').filter(c => c >= '0' && c <= '9').join('');
    return digits.slice(-10);
}

export class AgentExecutor {
    async processMessage(tenantId: string, remoteJid: string, text: string, sessionLabel?: string): Promise<string> {
        const ASSISTANT_PHONE = '7021045254'; // last 10 digits of +91 70210 45254
        let effectiveTenantId = tenantId;
        let systemPrompt: string;

        const assistantSessionPhone = await this.getSessionPhoneNumber(tenantId, sessionLabel);
        const isAssistantSession = normalizeComparablePhone(assistantSessionPhone) === normalizeComparablePhone(ASSISTANT_PHONE);

        if (isAssistantSession) {
            const brokerResolution = await this.resolveBrokerWorkspaceBySender(remoteJid);

            if (brokerResolution.isBroker && brokerResolution.verified) {
                // Verified broker → CRM mode inside their workspace
                systemPrompt = await this.getBrokerAssistantPrompt();
                effectiveTenantId = brokerResolution.tenantId!;
            } else {
                const looksLikeBroker = await this.detectsBrokerIntent(text);
                if (brokerResolution.isBroker && !brokerResolution.verified) {
                    // Known broker phone but not verified → ask for verification first
                    systemPrompt = await this.getUnregisteredBrokerPrompt();
                    effectiveTenantId = tenantId; // system/assistant tenant
                } else if (looksLikeBroker) {
                    // Unregistered broker → onboarding mode
                    systemPrompt = await this.getUnregisteredBrokerPrompt();
                    effectiveTenantId = tenantId; // system/assistant tenant
                } else {
                    // Client / unknown intent → qualification mode
                    systemPrompt = await this.getClientAssistantPrompt();
                    effectiveTenantId = tenantId; // system/assistant tenant
                }
            }
        } else {
            // Original flow for broker's own sessions
            const conversationKey = normalizeConversationPhoneNumber(remoteJid);
            const brokerProfile = await this.getBrokerProfile(tenantId);
            const isFirstReply = (await getConversationMessageCount(conversationKey)) === 0;
            const shouldGreetBrokerByName = Boolean(
                brokerProfile?.full_name
                && !remoteJid.endsWith('@g.us')
                && brokerProfile.phone
                && brokerProfile.phone === conversationKey
            );
            systemPrompt = await this.getSystemPrompt(brokerProfile?.full_name, shouldGreetBrokerByName);
        }

        const conversationKey = normalizeConversationPhoneNumber(remoteJid);
        const history = await getConversationHistory(conversationKey);
        const currentMessages: ChatTurn[] = [...history];
        let currentPrompt = text;

        let iterations = 0;
        const MAX_ITERATIONS = 5;

        try {
            while (iterations < MAX_ITERATIONS) {
                this.logAgentInvocation('request', {
                    source: 'AgentExecutor',
                    tenantId: effectiveTenantId,
                    toolsPresent: false,
                    toolsCount: 0,
                    taskType: 'agent_router',
                });
                const response = await aiService.chat(
                    currentPrompt,
                    'Auto',
                    'agent_router',
                    effectiveTenantId,
                    systemPrompt,
                    currentMessages
                );
                const agentResponse = parseAgentResponse(response.text);

                const toolCall = this.parseToolCall(agentResponse.message);
                this.logAgentInvocation('response', {
                    source: 'AgentExecutor',
                    tenantId: effectiveTenantId,
                    toolsPresent: false,
                    toolsCount: 0,
                    responseBlockType: toolCall ? 'tool' : 'text',
                    toolName: toolCall?.name || null,
                });

                if (!toolCall) {
                    const renderedReply = renderOutput(agentResponse);
                    await saveToHistory(conversationKey, text, renderedReply);
                    return renderedReply;
                }

                const toolResult = await this.executeTool(toolCall.name, toolCall.args, effectiveTenantId, remoteJid, text);
                if (this.isToolFailure(toolResult) || this.isToolEmpty(toolResult)) {
                    return renderOutput(toAgentResponse("Hey, this part of Pulse is still settling in. Please send a screenshot and what you tried to hello@propai.live so we can fix it quickly."));
                }

                currentMessages.push({ role: 'assistant', content: agentResponse.message });
                currentMessages.push({ role: 'user', content: `Tool Result: ${JSON.stringify(toolResult)}` });
                currentPrompt = 'Continue based on the tool result above.';

                iterations++;
            }
            return renderOutput(toAgentResponse("I'm having a bit of trouble with this one. Could you try saying it differently?"));
        } catch (error) {
            console.error('Agent Loop Error:', error);
            return renderOutput(toAgentResponse("Something went wrong on my end, but I'm trying to fix it. One moment!"));
        }
    }

    private parseToolCall(text: string) {
        const regex = /TOOL: (\w+)\s*({.*})/g;
        const match = regex.exec(text);
        if (!match) return null;
        try {
            return { name: match[1], args: JSON.parse(match[2]) };
        } catch (e) {
            return null;
        }
    }

    private logAgentInvocation(stage: 'request' | 'response', metadata: Record<string, unknown>) {
        console.info('[agent-invocation]', JSON.stringify({ stage, ...metadata }));
    }

    private async logEvent(tenantId: string, eventType: string, description: string, metadata: any = {}) {
        await supabase.from('agent_events').insert({
            tenant_id: tenantId,
            event_type: eventType,
            description,
            metadata
        });
    }

    private formatCurrency(value: number | null | undefined) {
        if (value == null || !Number.isFinite(value)) return 'N/A';
        if (value >= 10000000) {
            return `₹${(value / 10000000).toFixed(2)}Cr`;
        }
        if (value >= 100000) {
            return `₹${(value / 100000).toFixed(1)}L`;
        }
        return `₹${Math.round(value).toLocaleString('en-IN')}`;
    }

    private formatSquareFeet(value: number | null | undefined) {
        if (value == null || !Number.isFinite(value)) return 'N/A';
        return `${Math.round(value).toLocaleString('en-IN')} sqft`;
    }

    private formatDate(value: string | null | undefined) {
        if (!value) return 'unknown date';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    private async executeTool(name: string, args: any, tenantId: string, remoteJid: string, promptText: string): Promise<any> {
        switch (name) {
            case 'get_groups': {
                const client = await sessionManager.getSession(tenantId);
                return await (client as any).getGroups();
            }
            case 'get_whatsapp_groups': {
                const client = await sessionManager.getSession(tenantId);
                if (!client) {
                    return { success: false, error: 'No active WhatsApp session found' };
                }

                const groups = await (client as any).getParticipatingGroups?.() || await (client as any).getGroups?.() || [];
                return {
                    count: groups.length,
                    groups,
                };
            }
            case 'send_message': {
                const client = await sessionManager.getSession(tenantId);
                return await (client as any).sendText(args.remote_jid, args.text);
            }
            case 'send_whatsapp_message': {
                const client = await sessionManager.getSession(tenantId);
                if (!client) {
                    return { success: false, error: 'No active WhatsApp session found' };
                }

                try {
                    await (client as any).sendMessage(args.remote_jid || remoteJid, args.text || args.message || '');
                    return { success: true };
                } catch (error: any) {
                    return { success: false, error: error?.message || 'Failed to send WhatsApp message' };
                }
            }
            case 'parse_listing': {
                const res = await aiService.chat(`Extract structured listing data: ${args.text}`, 'Auto', 'listing_parsing', tenantId);
                return safeJSONParse(res.text);
            }
            case 'save_listing': {
                const result: any = await brokerWorkflowService.saveListingFromDraft(tenantId, args, promptText);
                // Auto-match: find matching requirements after saving
                if (result?.handled && result.data?.type === 'listing_saved') {
                    const matches: any = await brokerWorkflowService.executePlan(tenantId, {
                        intent: 'get_my_requirements',
                        args: { query: args.raw_text || promptText },
                    }, promptText);
                    // Notify broker about matches
                    const matchCount = matches?.data?.items?.length || 0;
                    if (matchCount > 0) {
                        await this.notifyBroker(tenantId,
                            `✅ Listing saved & *${matchCount} requirement match${matchCount > 1 ? 'es' : ''}* found.\nCheck PropAI dashboard → propai.live`
                        );
                    }
                    return { ...result, matches };
                }
                return result;
            }
            case 'save_requirement': {
                const result: any = await brokerWorkflowService.saveRequirementFromDraft(tenantId, args, promptText);
                // Auto-match: find matching listings after saving
                if (result?.handled && result.data?.type === 'requirement_saved') {
                    const matches: any = await brokerWorkflowService.executePlan(tenantId, {
                        intent: 'get_my_listings',
                        args: { query: args.raw_text || promptText },
                    }, promptText);
                    // Notify broker about matches
                    const matchCount = matches?.data?.items?.length || 0;
                    if (matchCount > 0) {
                        await this.notifyBroker(tenantId,
                            `✅ Requirement saved & *${matchCount} listing match${matchCount > 1 ? 'es' : ''}* found.\nCheck PropAI dashboard → propai.live`
                        );
                    }
                    return { ...result, matches };
                }
                return result;
            }
            case 'create_channel': {
                return await brokerWorkflowService.createChannelFromDraft(tenantId, args, promptText);
            }
            case 'classify_contact': {
                const { data, error } = await supabase.from('contacts').upsert({
                    tenant_id: tenantId,
                    remote_jid: remoteJid,
                    classification: args.classification
                });
                if (!error) await this.logEvent(tenantId, 'contact_classified', `Contact ${remoteJid} classified as ${args.classification}`);
                return error ? { error: error.message } : { success: true };
            }
            case 'update_lead_qualification': {
                const { data: contact } = await supabase.from('contacts').select('id').eq('remote_jid', remoteJid).single();
                if (!contact) return { error: 'Contact not found' };

                const { data: lead } = await supabase.from('leads').select('id, current_step').eq('contact_id', contact.id).single();

                if (!lead) {
                    const { data: newLead } = await supabase.from('leads').insert({
                        tenant_id: tenantId,
                        contact_id: contact.id,
                        status: 'New'
                    }).select().single();

                    if (!newLead) return { error: 'Failed to create lead' };
                    const res = await this.updateLeadStep(newLead.id, args.data);
                    await this.logEvent(tenantId, 'lead_created', `New lead created for ${remoteJid}`);
                    return res;
                }

                const res = await this.updateLeadStep(lead.id, args.data);
                if (res.next_step === 'qualified') {
                    await this.logEvent(tenantId, 'lead_qualified', `Lead ${remoteJid} is now fully qualified!`);
                }
                return res;
            }
            case 'check_subscription': {
                return await subscriptionService.getSubscription(tenantId);
            }
            case 'get_broker_subscription': {
                return await this.getBrokerSubscriptionByPhone(args?.phone_number, tenantId, remoteJid);
            }
            case 'igr_last_transaction': {
                const buildingName = String(args?.building_name || '').trim();
                const locality = String(args?.locality || '').trim();

                if (!buildingName && !locality) {
                    return { error: 'building_name or locality is required' };
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

                    return {
                        message: `Last registered transaction in ${transaction.building_name || buildingName}, ${transaction.locality || locality || 'Unknown locality'}: ${this.formatCurrency(transaction.consideration)} on ${this.formatDate(transaction.reg_date)} (${this.formatSquareFeet(transaction.area_sqft)}, ₹${dealRate != null ? Math.round(dealRate).toLocaleString('en-IN') : 'N/A'}/sqft)\nArea average (last 6 months): ₹${marketRate != null ? Math.round(marketRate).toLocaleString('en-IN') : 'N/A'}/sqft${comparison ? ` — this transaction was ${comparison} market.` : '.'}`,
                        transaction,
                        locality_stats: stats,
                    };
                }

                if (locality) {
                    const stats = await igrQueryService.getLocalityStats(locality, 6);
                    if (stats.transaction_count > 0) {
                        return {
                            message: `No exact building match found. Area average in ${locality} (last 6 months): ₹${stats.avg_price_per_sqft != null ? Math.round(stats.avg_price_per_sqft).toLocaleString('en-IN') : 'N/A'}/sqft across ${stats.transaction_count} transactions.`,
                            locality_stats: stats,
                        };
                    }
                }

                return { message: 'No IGR transaction data available for this building yet.' };
            }
            case 'upgrade_plan': {
                // In real world, generate Razorpay link here
                const paymentLink = `https://rzp.io/i/propai_${args.plan}_${tenantId}`;
                await subscriptionService.upgradePlan(tenantId, args.plan);
                return { payment_link: paymentLink, message: `Please complete payment at ${paymentLink} to activate your ${args.plan} plan.` };
            }
            case 'cancel_subscription': {
                await subscriptionService.cancelSubscription(tenantId);
                return { success: true, message: 'Your subscription will cancel at the end of the billing cycle.' };
            }
            case 'get_callbacks': {
                return await this.getCallbacks(args?.phone_number, tenantId, remoteJid);
            }
            case 'store_leads': {
                const result = await this.storeLeadRecord(tenantId, args, promptText);
                // Notify broker about new lead (except broker signup leads)
                if (result?.success && args.record_type !== 'broker_signup_lead') {
                    await this.notifyBroker(tenantId,
                        `🔔 *New lead via PropAI Assistant*\n*Name:* ${args.name || 'Unknown'}\n*Req:* ${(args.raw_text || '—').slice(0, 80)}\n*Phone:* ${args.phone || '—'}`
                    );
                }
                return result;
            }
            case 'get_my_listings': {
                return await brokerWorkflowService.executePlan(tenantId, {
                    intent: 'get_my_listings',
                    args,
                }, promptText);
            }
            case 'get_my_requirements': {
                return await brokerWorkflowService.executePlan(tenantId, {
                    intent: 'get_my_requirements',
                    args,
                }, promptText);
            }
            case 'search_my_crm': {
                return await brokerWorkflowService.executePlan(tenantId, {
                    intent: 'search_my_crm',
                    args,
                }, promptText);
            }
            case 'verify_rera': {
                return { status: 'Verified', reg_no: 'P518000XXXX', state: args.state };
            }
            case 'get_market_intelligence': {
                const buildingName = String(args?.building_name || '').trim();
                const locality = String(args?.locality || '').trim();

                if (!buildingName && !locality) {
                    return { error: 'building_name or locality is required' };
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

                    return {
                        message: `Last registered transaction in ${transaction.building_name || buildingName}, ${transaction.locality || locality || 'Unknown locality'}: ${this.formatCurrency(transaction.consideration)} on ${this.formatDate(transaction.reg_date)} (${this.formatSquareFeet(transaction.area_sqft)}, ₹${dealRate != null ? Math.round(dealRate).toLocaleString('en-IN') : 'N/A'}/sqft)\nArea average (last 6 months): ₹${marketRate != null ? Math.round(marketRate).toLocaleString('en-IN') : 'N/A'}/sqft${comparison ? ` — this transaction was ${comparison} market.` : '.'}`,
                        transaction,
                        locality_stats: stats,
                    };
                }

                const stats = await igrQueryService.getLocalityStats(locality || buildingName, 6);
                if (stats.transaction_count > 0) {
                    return {
                        message: `No exact building match found. Area average in ${stats.locality} (last 6 months): ₹${stats.avg_price_per_sqft != null ? Math.round(stats.avg_price_per_sqft).toLocaleString('en-IN') : 'N/A'}/sqft across ${stats.transaction_count} transactions.`,
                        locality_stats: stats,
                    };
                }

                return { message: 'No recent registration data found for this building.' };
            }
            default:
                return { error: `Tool ${name} not implemented` };
        }
    }

    private async notifyBroker(tenantId: string, message: string) {
        try {
            const db = supabaseAdmin ?? supabase;
            const { data: profile } = await db
                .from('profiles')
                .select('phone')
                .eq('id', tenantId)
                .maybeSingle();

            if (!profile?.phone) return;

            const brokerJid = `${profile.phone.startsWith('+') ? profile.phone.slice(1) : profile.phone}@s.whatsapp.net`;
            const client = await sessionManager.getSession(tenantId);
            if (!client) return;

            await (client as any).sendText(brokerJid, message);
        } catch (err) {
            console.error('[notifyBroker] Failed:', err);
        }
    }

    private async updateLeadStep(leadId: string, data: any) {
        const { data: lead } = await supabase.from('leads').select('current_step').eq('id', leadId).single();
        const currentStep = lead?.current_step || 'budget';
        
        let nextStep = currentStep;
        const updates: any = { ...data };

        // Simple state machine transition
        if (data.budget && currentStep === 'budget') nextStep = 'location';
        else if (data.location_pref && currentStep === 'location') nextStep = 'timeline';
        else if (data.timeline && currentStep === 'timeline') nextStep = 'possession';
        else if (data.possession && currentStep === 'possession') nextStep = 'qualified';

        const { error } = await supabase
            .from('leads')
            .update({ ...updates, current_step: nextStep })
            .eq('id', leadId);

        return error ? { error: error.message } : { success: true, next_step: nextStep };
    }

    private async getBrokerProfile(tenantId: string) {
        const client = supabaseAdmin ?? supabase;
        const { data } = await client
            .from('profiles')
            .select('full_name, phone')
            .eq('id', tenantId)
            .maybeSingle();

        return data
            ? {
                full_name: data.full_name || '',
                phone: normalizeConversationPhoneNumber(data.phone || ''),
            }
            : null;
    }

    private async getBrokerSubscriptionByPhone(phoneNumber: string | undefined, tenantId: string, remoteJid: string) {
        const normalizedPhone = normalizeConversationPhoneNumber(phoneNumber || remoteJid);
        const client = supabaseAdmin ?? supabase;

        const { data: profile } = await client
            .from('profiles')
            .select('id, phone')
            .or(`phone.eq.${normalizedPhone},id.eq.${tenantId}`)
            .limit(1)
            .maybeSingle();

        if (!profile?.id) {
            return { success: false, error: 'Broker profile not found' };
        }

        const subscription = await subscriptionService.getSubscription(profile.id);
        const leadsLimit = subscriptionService.getLimit(subscription.plan, 'leads');
        const whatsappNumbers = subscriptionService.getLimit(subscription.plan, 'sessions');
        const { count } = await client
            .from('lead_records')
            .select('lead_id', { count: 'exact', head: true })
            .eq('tenant_id', profile.id);

        return {
            plan: subscription.plan,
            leads_used: count || 0,
            leads_limit: Number.isFinite(leadsLimit) ? leadsLimit : null,
            whatsapp_numbers: whatsappNumbers,
        };
    }

    private async getCallbacks(phoneNumber: string | undefined, tenantId: string, remoteJid: string) {
        const normalizedPhone = normalizeConversationPhoneNumber(phoneNumber || remoteJid);
        const callbacks = await followUpService.getPendingCallbacks(tenantId, 25);
        const filteredCallbacks = callbacks.filter((callback: any) => {
            const leadPhone = normalizeConversationPhoneNumber(callback.lead_phone || '');
            return !normalizedPhone || leadPhone === normalizedPhone;
        });

        return {
            count: filteredCallbacks.length,
            callbacks: filteredCallbacks.map((callback: any) => ({
                lead_name: callback.lead_name,
                scheduled_at: callback.due_at,
                notes: callback.notes,
            })),
        };
    }

    private async storeLeadRecord(tenantId: string, args: Record<string, any>, promptText: string) {
        const client = supabaseAdmin ?? supabase;
        const rawText = String(args?.raw_text || promptText || '').trim();
        const phone = String(args?.phone || args?.phone_number || '').split('').filter(c => c >= '0' && c <= '9').join('');
        const name = String(args?.name || args?.lead_name || 'Pulse Lead').trim();
        const recordType = args?.record_type === 'inventory_listing' ? 'inventory_listing' : 'buyer_requirement';
        const location = String(args?.location || args?.location_pref || args?.locality_canonical || '').trim();
        const budget = args?.budget ?? args?.price ?? null;
        const leadId = String(
            args?.lead_id
            || [recordType, phone || 'unknown', location || 'na', budget || 'na'].join(':')
        );

        const row = {
            tenant_id: tenantId,
            lead_id: leadId,
            phone: phone || 'unknown',
            name,
            record_type: recordType,
            dataset_mode: 'mixed',
            deal_type: String(args?.deal_type || 'unknown'),
            asset_class: String(args?.asset_class || 'unknown'),
            price_basis: String(args?.price_basis || 'unknown'),
            budget: typeof budget === 'number' ? budget : null,
            location_hint: location || null,
            city: String(args?.city || 'Unknown'),
            city_canonical: String(args?.city_canonical || args?.city || 'Unknown'),
            locality_canonical: location || null,
            micro_market: String(args?.micro_market || location || ''),
            matched_alias: String(args?.matched_alias || location || ''),
            confidence: typeof args?.confidence === 'number' ? args.confidence : 0.7,
            unresolved_flag: Boolean(args?.unresolved_flag),
            resolution_method: String(args?.resolution_method || 'unresolved'),
            urgency: String(args?.urgency || 'medium'),
            priority_bucket: String(args?.priority_bucket || 'P2'),
            priority_score: typeof args?.priority_score === 'number' ? args.priority_score : 60,
            sentiment_score: typeof args?.sentiment_score === 'number' ? args.sentiment_score : 0,
            intent_score: typeof args?.intent_score === 'number' ? args.intent_score : 0.7,
            recency_score: typeof args?.recency_score === 'number' ? args.recency_score : 1,
            sentiment_risk: typeof args?.sentiment_risk === 'number' ? args.sentiment_risk : 0,
            raw_text: rawText || null,
            source: String(args?.source || 'whatsapp_agent'),
            created_at: String(args?.created_at || new Date().toISOString()),
            updated_at: new Date().toISOString(),
            payload: {
                ...args,
                raw_text: rawText || null,
            },
        };

        const { error } = await client
            .from('lead_records')
            .upsert(row, { onConflict: 'tenant_id,lead_id' });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, lead_id: leadId };
    }

    private isToolFailure(toolResult: any) {
        if (!toolResult) {
            return true;
        }

        if (toolResult.error) {
            return true;
        }

        if (toolResult.status === 'failure') {
            return true;
        }

        if (toolResult.success === false) {
            return true;
        }

        return false;
    }

    private isToolEmpty(toolResult: any) {
        if (Array.isArray(toolResult)) {
            return toolResult.length === 0;
        }

        if (typeof toolResult?.count === 'number' && toolResult.count === 0) {
            return true;
        }

        if (Array.isArray(toolResult?.groups) && toolResult.groups.length === 0) {
            return true;
        }

        if (Array.isArray(toolResult?.callbacks) && toolResult.callbacks.length === 0) {
            return true;
        }

        return false;
    }

    private maybePersonalizeGreeting(reply: string, fullName?: string, shouldGreet?: boolean) {
        if (!shouldGreet || !fullName?.trim()) {
            return reply;
        }

        const trimmedReply = reply.trim();
        const firstName = fullName.trim().split(/\s+/)[0];
        const lowerReply = trimmedReply.toLowerCase();
        if (
            lowerReply.includes(firstName.toLowerCase())
            || /^(hi|hello|hey)\b/i.test(trimmedReply)
        ) {
            return trimmedReply;
        }

        return `Hi ${firstName}, ${trimmedReply}`;
    }

    private async getSystemPrompt(fullName?: string, shouldGreetByName = false) {
        return `You are Pulse, the AI agent for PropAI built for Indian real estate brokers.
Use broker language. Understand Hinglish, Gujarati, shortforms, and messy WhatsApp text.
Be concise, action-oriented, and friendly. Never explain internal tool mechanics to the broker.
Language: English, Hindi, Hinglish, and Gujarati.
Always detect and reply in the user's language. Gujarati speakers are a key broker demographic in Mumbai.
${fullName?.trim() ? `Broker profile name: ${fullName.trim()}.` : ''}
${shouldGreetByName && fullName?.trim() ? 'If this is the first reply in a new conversation with the broker, greet them by name.' : ''}

Tool rule:
- If the broker message matches a tool, respond with exactly one TOOL call.
- Prefer tool use over free text for operational tasks like saving listings, saving requirements, creating channels, storing leads, searching CRM data, scheduling callbacks, checking callbacks, and subscription questions.
- The message can be informal, Hinglish, or partially structured; use the tool anyway when the intent is clear.

Response rules:
- If you need a tool, reply with exactly: TOOL: tool_name {"arg":"value"}
- Only call one tool per message.
- After a tool result comes back, continue the same conversation with that context.
- Keep final replies short and plain-language.

Tools:
- save_listing: use for property listings. Args: source_group_id, raw_text, listing_data.
- save_requirement: use for buyer or tenant requirements. Args: raw_text, requirement_data.
- create_channel: use to create a personal stream channel from localities, keywords, or deal filters. Args: name, localities, keywords, record_types, deal_types.
- store_leads: use for idempotent lead storage. Args: lead_id, name, phone, record_type, raw_text.
- get_my_listings: use to show the broker's saved listings from CRM. Args: query when useful.
- get_my_requirements: use to show the broker's saved buyer or tenant requirements from CRM. Args: query when useful.
- search_my_crm: use to search across the broker's saved listings and requirements. Args: query when useful.
- schedule_callback: use for follow-ups and reminders. Args: lead_name, due_at, action_type, notes.
- check_callbacks: use for follow-up queue requests.
- get_callbacks: use for pending callbacks. Args: phone_number when available.
- igr_last_transaction: use when a broker asks for the latest registered sale or rent transaction for a building or locality.
- get_market_intelligence: use when a broker asks for price per sqft, market value, or whether a building is above or below recent IGR comps.
- search_listings: use for matching inventory searches. Args: query, location, bhk, max_price, deal_type.
- classify_contact: use when the contact type is obvious. Args: classification.
- check_subscription: use for plan and limit questions.
- get_broker_subscription: use for broker plan, lead usage, and WhatsApp number limits. Args: phone_number when available.
- upgrade_plan: use for plan upgrades. Args: plan.
- send_whatsapp_message: use to send a WhatsApp message. Args: remote_jid, text.
- get_whatsapp_groups: use to list broker WhatsApp groups.
- verify_rera: use for RERA verification. Args: reg_no, state.

Broker shorthand:
- BW = Bandra West
- 2BHK / 3BHK / 4BHK are valid
- 1.5L means 1,50,000
- 80k means 80,000
- 1.8Cr means 1,80,00,000

If no tool is needed, answer briefly in plain language only.

Output Formatting Rules:
You are running inside a WhatsApp interface.
Never use markdown formatting.
Prohibited: **, __, ##, backticks, blockquotes, - as bullets.
WhatsApp bold = *text* (single asterisk only)
WhatsApp italic = _text_ (underscore)
Bullet points = use • or → or ✅ only
Keep each message under 4 lines where possible.
For lead summaries use this structure:
  *Name:* value
  *Budget:* value
  *Location:* value
  *Status:* value
When comparing properties use plain spaced columns, no tables.
Always return tool call results as clean structured JSON.
Never add commentary outside JSON when responding to tool calls.
Use bullet_list format when listing property features or options.
Use summary_card format when presenting a lead profile.
Use timeline format when showing visit or follow-up history.
Use table format only for direct property comparisons, max 3 cols.
Use text format for everything else.
Always wrap responses in the AgentResponse JSON schema.
Never return plain text outside of the JSON structure.`;
    }

    private async getBrokerAssistantPrompt(): Promise<string> {
        return `You are the PropAI Assistant — a WhatsApp-native CRM for real estate brokers in India.
Brokers send you raw listings and requirements. You parse, save, and instantly match them.

When a broker sends a listing (property for sale/rent):
- Extract: location, BHK, price, area sqft, floor, possession, contact
- Call save_listing with the structured data
- Then call get_my_requirements with matching filters
- Reply with matched buyer requirements immediately

When a broker sends a requirement (client looking to buy/rent):
- Extract: location preference, budget, BHK, timeline, client name/phone
- Call save_requirement with the structured data  
- Then call get_my_listings with matching filters
- Reply with matched listings immediately

Match reply format:
*New Listing Saved ✅*
• 3BHK Bandra West | 4.2Cr | 1200sqft

*Matching Requirements (2):*
→ Rahul S. | 3BHK BW | Budget 4-5Cr | Ready
→ Mehta | 3BHK Bandra | 4.5Cr | 3 months

If no matches: "Saved ✅ No matches yet — will notify when one comes in."

Understand broker shorthand:
- "3bhk bw 4cr redy posesion 1200sqft cont 98XXXXXXXX" → valid listing
- "client req 2bhk jb 2-3cr end user" → valid requirement
- Hinglish, typos, abbreviations — all valid input

Rules:
- Always save before matching
- Never ask for clarification unless data is completely missing
- Keep replies under 5 lines
- Use WhatsApp formatting only

Always wrap responses in the AgentResponse JSON schema.`;
    }

    private async getClientAssistantPrompt(): Promise<string> {
        return `You are the PropAI Assistant — helping property buyers and tenants find the right home.

Your job:
1. Understand intent: buy / rent / sell
2. Capture: location → budget → BHK → timeline → name → phone
3. Search available listings via get_my_listings
4. Save as lead via store_leads
5. Tell them a broker will follow up

When you have location + budget + BHK, always call get_my_listings first.
If listings match, show up to 3 options clearly.
If no match: "I'll have our team reach out with the best options shortly."

Reply format for listings:
*Available Options:*
🏠 3BHK Bandra West | 4.2Cr | Ready
🏠 3BHK Khar | 3.8Cr | 6 months
"Want details on any of these?"

Lead save: call store_leads once you have name + phone + requirement.

Language: match the user — English, Hindi, Hinglish.
Keep every reply under 3 lines.
Never reveal broker names or internal data.

If someone asks who you are:
"I'm the PropAI Assistant 🏠 I help you find the right property and connect you with experts."

Always wrap responses in the AgentResponse JSON schema.`;
    }

    private async getUnregisteredBrokerPrompt(): Promise<string> {
        return `You are the PropAI Assistant — a WhatsApp-native CRM for real estate brokers in India.

The person messaging you appears to be a broker but is NOT yet registered on PropAI.

Your goal: convert them into a PropAI signup.

Flow:
1. Acknowledge what they sent ("That looks like a listing/requirement!")
2. Explain PropAI in 2 lines — WhatsApp-native CRM, auto-match listings to requirements, no app needed
3. Ask: "Are you a broker? I can save this and start matching for you — takes 30 seconds to get started."
4. If yes → collect name + number → call store_leads with record_type: 'broker_signup_lead'
5. Send them the signup link: https://propai.live

Tone: peer-to-peer, broker-to-broker. Not salesy. Like a colleague who found a better tool.

Example opener:
"Looks like a listing 👀 PropAI can auto-save this and match it to buyer requirements in your network instantly.
Are you a broker? Takes 30 seconds to set up — propai.live"

Once you have their name + number, call store_leads with:
- record_type: 'broker_signup_lead'
- source: 'assistant_wa_7021045254'
- raw_text: the original message they sent

Always wrap responses in the AgentResponse JSON schema.`;
    }

    private async isBrokerSender(remoteJid: string): Promise<{
        isBroker: boolean;
        tenantId?: string;
    }> {
        const strippedPhone = remoteJid.replace('@s.whatsapp.net', '');
        const phone = strippedPhone.startsWith('+') ? strippedPhone.slice(1) : strippedPhone;
        const client = supabaseAdmin ?? supabase;

        const { data } = await client
            .from('profiles')
            .select('id')
            .or(`phone.eq.${phone},phone.eq.+${phone}`)
            .maybeSingle();

        return data
            ? { isBroker: true, tenantId: data.id }
            : { isBroker: false };
    }

    private async getSessionPhoneNumber(tenantId: string, sessionLabel?: string) {
        const client = supabaseAdmin ?? supabase;
        let query = client
            .from('whatsapp_sessions')
            .select('session_data')
            .eq('tenant_id', tenantId);

        if (sessionLabel?.trim()) {
            query = query.eq('label', sessionLabel.trim());
        }

        const { data } = await query
            .order('last_sync', { ascending: false })
            .limit(1)
            .maybeSingle();

        const sessionData = (data?.session_data && typeof data.session_data === 'object')
            ? data.session_data as Record<string, any>
            : {};

        return String(sessionData.phoneNumber || '').trim();
    }

    private async resolveBrokerWorkspaceBySender(remoteJid: string): Promise<{
        isBroker: boolean;
        verified: boolean;
        tenantId?: string;
        role?: string | null;
    }> {
        const strippedPhone = remoteJid.replace('@s.whatsapp.net', '');
        const phone = strippedPhone.startsWith('+') ? strippedPhone.slice(1) : strippedPhone;
        const normalizedPhone = normalizeComparablePhone(phone);
        const client = supabaseAdmin ?? supabase;

        // 1) Direct profile match (owner)
        const { data: ownerProfile } = await client
            .from('profiles')
            .select('id, phone_verified')
            .or(`phone.eq.${phone},phone.eq.+${phone}`)
            .maybeSingle();

        if (ownerProfile?.id) {
            return {
                isBroker: true,
                verified: Boolean(ownerProfile.phone_verified),
                tenantId: ownerProfile.id,
                role: 'owner',
            };
        }

        // 2) Workspace member match (team)
        const { data: member } = await client
            .from('workspace_members')
            .select('workspace_owner_id, role, status')
            .or(`member_phone.eq.${phone},member_phone.eq.+${phone}`)
            .maybeSingle();

        if (member?.workspace_owner_id && String(member.status || '').toLowerCase() === 'active') {
            // Workspace verification is tied to the owner profile phone verification, not the member phone.
            const { data: workspaceOwner } = await client
                .from('profiles')
                .select('id, phone_verified, phone')
                .eq('id', member.workspace_owner_id)
                .maybeSingle();

            const ownerVerified = Boolean(workspaceOwner?.phone_verified);
            const memberMatchesOwnerPhone = normalizeComparablePhone(workspaceOwner?.phone) === normalizedPhone;
            const verified = ownerVerified || memberMatchesOwnerPhone;

            return {
                isBroker: true,
                verified,
                tenantId: member.workspace_owner_id,
                role: member.role || null,
            };
        }

        return { isBroker: false, verified: false };
    }

    private async detectsBrokerIntent(text: string): Promise<boolean> {
        const brokerPatterns = [
            /\d+\s*bhk/i,
            /\b(listing|inventory|requirement|req|client needs|looking for client)\b/i,
            /\b(cr|crore|lac|lakh|sqft|sq\.ft)\b/i,
            /\b(ready\s*possession|under\s*construction|rera)\b/i,
            /\b(rent out|for sale|available for)\b/i,
        ];
        return brokerPatterns.some((p) => p.test(text));
    }
}

export const agentExecutor = new AgentExecutor();
