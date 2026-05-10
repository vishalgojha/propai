import { aiService } from './aiService';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase, supabaseAdmin } from '../config/supabase';
import { safeJSONParse } from '../utils/jsonUtils';
import { brokerWorkflowService } from './brokerWorkflowService';
import { followUpService } from './followUpService';
import { subscriptionService } from './subscriptionService';
import { igrQueryService } from './igrQueryService';
import { browserToolService } from './browserToolService';
import { normalizeConversationPhoneNumber } from '../memory/conversationMemory';

type ExecuteAgentToolContext = {
    tenantId: string;
    remoteJid: string;
    promptText: string;
};

function cleanMessageText(text: unknown) {
    return String(text || '').trim().replace(/\\"/g, '"');
}

export class AgentToolService {
    async executeTool(name: string, args: any, context: ExecuteAgentToolContext): Promise<any> {
        const { tenantId, remoteJid, promptText } = context;

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
                    const destinationJid = args.remote_jid || remoteJid;
                    const messageText = cleanMessageText(args.text || args.message || '');
                    await (client as any).sendMessage(destinationJid, messageText);
                    await (supabaseAdmin ?? supabase).from('messages').insert({
                        tenant_id: tenantId,
                        remote_jid: destinationJid,
                        text: messageText,
                        sender: 'AI',
                        timestamp: new Date().toISOString(),
                    });
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
                if (result?.handled && result.data?.type === 'listing_saved') {
                    const matches: any = await brokerWorkflowService.executePlan(tenantId, {
                        intent: 'get_my_requirements',
                        args: { query: args.raw_text || promptText },
                    }, promptText);
                    const matchCount = matches?.data?.items?.length || 0;
                    if (matchCount > 0) {
                        await this.notifyBroker(
                            tenantId,
                            `✅ Listing saved & *${matchCount} requirement match${matchCount > 1 ? 'es' : ''}* found.\nCheck PropAI dashboard → propai.live`
                        );
                    }
                    return { ...result, matches };
                }
                return result;
            }
            case 'save_requirement': {
                const result: any = await brokerWorkflowService.saveRequirementFromDraft(tenantId, args, promptText);
                if (result?.handled && result.data?.type === 'requirement_saved') {
                    const matches: any = await brokerWorkflowService.executePlan(tenantId, {
                        intent: 'get_my_listings',
                        args: { query: args.raw_text || promptText },
                    }, promptText);
                    const matchCount = matches?.data?.items?.length || 0;
                    if (matchCount > 0) {
                        await this.notifyBroker(
                            tenantId,
                            `✅ Requirement saved & *${matchCount} listing match${matchCount > 1 ? 'es' : ''}* found.\nCheck PropAI dashboard → propai.live`
                        );
                    }
                    return { ...result, matches };
                }
                return result;
            }
            case 'create_channel':
                return await brokerWorkflowService.createChannelFromDraft(tenantId, args, promptText);
            case 'classify_contact': {
                const { error } = await supabase.from('contacts').upsert({
                    tenant_id: tenantId,
                    remote_jid: remoteJid,
                    classification: args.classification,
                });
                if (!error) {
                    await this.logEvent(tenantId, 'contact_classified', `Contact ${remoteJid} classified as ${args.classification}`);
                }
                return error ? { error: error.message } : { success: true };
            }
            case 'update_lead_qualification':
                return await this.updateLeadQualification(tenantId, remoteJid, args?.data);
            case 'check_subscription':
                return await subscriptionService.getSubscription(tenantId);
            case 'get_broker_subscription':
                return await this.getBrokerSubscriptionByPhone(args?.phone_number, tenantId, remoteJid);
            case 'igr_last_transaction':
            case 'get_market_intelligence':
                return await this.getMarketIntelligence(args);
            case 'upgrade_plan': {
                const paymentLink = `https://rzp.io/i/propai_${args.plan}_${tenantId}`;
                await subscriptionService.upgradePlan(tenantId, args.plan);
                return { payment_link: paymentLink, message: `Please complete payment at ${paymentLink} to activate your ${args.plan} plan.` };
            }
            case 'cancel_subscription':
                await subscriptionService.cancelSubscription(tenantId);
                return { success: true, message: 'Your subscription will cancel at the end of the billing cycle.' };
            case 'get_callbacks':
                return await this.getCallbacks(args?.phone_number, tenantId, remoteJid);
            case 'store_leads': {
                const result = await this.storeLeadRecord(tenantId, args, promptText);
                if (result?.success && args.record_type !== 'broker_signup_lead') {
                    await this.notifyBroker(
                        tenantId,
                        `🔔 *New lead via PropAI Assistant*\n*Name:* ${args.name || 'Unknown'}\n*Req:* ${(args.raw_text || '—').slice(0, 80)}\n*Phone:* ${args.phone || '—'}`
                    );
                }
                return result;
            }
            case 'get_my_listings':
                return await brokerWorkflowService.executePlan(tenantId, { intent: 'get_my_listings', args }, promptText);
            case 'get_my_requirements':
                return await brokerWorkflowService.executePlan(tenantId, { intent: 'get_my_requirements', args }, promptText);
            case 'search_my_crm':
                return await brokerWorkflowService.executePlan(tenantId, { intent: 'search_my_crm', args }, promptText);
            case 'verify_rera': {
                const query = String(args?.project_name || args?.query || args?.reg_no || '').trim();
                const state = String(args?.state || 'Maharashtra').trim();
                return await browserToolService.execute('verify_rera', { query, state });
            }
            default:
                return { error: `Tool ${name} not implemented` };
        }
    }

    private async getMarketIntelligence(args: any) {
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

    private async logEvent(tenantId: string, eventType: string, description: string, metadata: any = {}) {
        await supabase.from('agent_events').insert({
            tenant_id: tenantId,
            event_type: eventType,
            description,
            metadata,
        });
    }

    private async updateLeadQualification(tenantId: string, remoteJid: string, data: any) {
        const { data: contact } = await supabase.from('contacts').select('id').eq('remote_jid', remoteJid).single();
        if (!contact) return { error: 'Contact not found' };

        const { data: lead } = await supabase.from('leads').select('id, current_step').eq('contact_id', contact.id).single();

        if (!lead) {
            const { data: newLead } = await supabase.from('leads').insert({
                tenant_id: tenantId,
                contact_id: contact.id,
                status: 'New',
            }).select().single();

            if (!newLead) return { error: 'Failed to create lead' };
            const res = await this.updateLeadStep(newLead.id, data);
            await this.logEvent(tenantId, 'lead_created', `New lead created for ${remoteJid}`);
            return res;
        }

        const res = await this.updateLeadStep(lead.id, data);
        if (res.next_step === 'qualified') {
            await this.logEvent(tenantId, 'lead_qualified', `Lead ${remoteJid} is now fully qualified!`);
        }
        return res;
    }

    private async updateLeadStep(leadId: string, data: any) {
        const { data: lead } = await supabase.from('leads').select('current_step').eq('id', leadId).single();
        const currentStep = lead?.current_step || 'budget';

        let nextStep = currentStep;
        const updates: any = { ...data };

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
}

export const agentToolService = new AgentToolService();
