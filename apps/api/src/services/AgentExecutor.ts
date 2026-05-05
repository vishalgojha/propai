import { aiService } from './aiService';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase } from '../config/supabase';
import { safeJSONParse } from '../utils/jsonUtils';
import { igrQueryService } from './igrQueryService';
import { applyBrokerProfileFallbacks } from './channelService';
import { browserAutomationService } from './browserAutomationService';

export class AgentExecutor {
    async processMessage(tenantId: string, remoteJid: string, text: string): Promise<string> {
        const history = await this.getChatHistory(tenantId, remoteJid);
        let currentMessages = [
            { role: 'system', content: await this.getSystemPrompt() },
            ...history,
            { role: 'user', content: text }
        ];

        let iterations = 0;
        const MAX_ITERATIONS = 5;

        try {
            while (iterations < MAX_ITERATIONS) {
                const response = await aiService.chat(
                    currentMessages.map(m => (m as any).content).join('\\n'), 
                    'Local',
                    undefined,
                    tenantId
                );

                const toolCall = this.parseToolCall(response.text);

                if (!toolCall) {
                    return this.cleanAgentResponse(response.text);
                }

                const toolResult = await this.executeTool(toolCall.name, toolCall.args, tenantId, remoteJid);
                
                currentMessages.push({ role: 'assistant', content: response.text });
                currentMessages.push({ role: 'system', content: `Tool Result: ${JSON.stringify(toolResult)}` });
                
                iterations++;
            }
            return "I'm having a bit of trouble with this one. Could you try saying it differently?";
        } catch (error) {
            console.error('Agent Loop Error:', error);
            return "Something went wrong on my end, but I'm trying to fix it. One moment!";
        }
    }

    private cleanAgentResponse(text: string): string {
        const extracted = this.extractPlainMessage(text);

        // Remove tool call patterns if they leaked into final output.
        let cleaned = extracted.replace(/TOOL: \w+\s*\{[\s\S]*?\}/g, '').trim();
        cleaned = this.stripMarkdown(cleaned);

        return cleaned || "I've taken care of that for you!";
    }

    private extractPlainMessage(text: string): string {
        const trimmed = String(text || '').trim();
        if (!trimmed) return '';

        const jsonCandidate = this.extractJsonObject(trimmed);
        if (jsonCandidate) {
            const parsed = safeJSONParse(jsonCandidate);
            const message = this.findMessageString(parsed);
            if (message) return message;
        }

        return trimmed;
    }

    private extractJsonObject(text: string): string | null {
        if (text.startsWith('{') && text.endsWith('}')) return text;

        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenced?.[1]?.trim();
        if (candidate?.startsWith('{') && candidate.endsWith('}')) return candidate;

        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return text.slice(firstBrace, lastBrace + 1);
        }

        return null;
    }

    private findMessageString(value: unknown): string | null {
        if (!value || typeof value !== 'object') return null;

        const objectValue = value as Record<string, unknown>;
        for (const key of ['message', 'text', 'reply', 'content']) {
            const maybeMessage = objectValue[key];
            if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
                return maybeMessage.trim();
            }
        }

        for (const nestedKey of ['response', 'data', 'output']) {
            const nested = this.findMessageString(objectValue[nestedKey]);
            if (nested) return nested;
        }

        return null;
    }

    private stripMarkdown(text: string): string {
        return text
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[ \t]+$/gm, '')
            .trim();
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

    private async getIgrLastTransactionSummary(args: any) {
        const buildingName = String(args?.building_name || '').trim();
        const locality = String(args?.locality || '').trim();

        if (!buildingName && !locality) {
            return { message: 'No IGR transaction data available for this building yet.' };
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

    private async executeTool(name: string, args: any, tenantId: string, remoteJid: string): Promise<any> {
        switch (name) {
            case 'get_groups': {
                const client = await sessionManager.getSession(tenantId);
                return await (client as any).getGroups();
            }
            case 'send_message': {
                const client = await sessionManager.getSession(tenantId);
                return await (client as any).sendText(args.remote_jid, args.text);
            }
            case 'parse_listing': {
                const res = await aiService.chat(`Extract structured listing data: ${args.text}`, 'Local', 'listing_parsing', tenantId);
                return safeJSONParse(res.text);
            }
            case 'save_listing': {
                const enrichedListingData = await applyBrokerProfileFallbacks(
                    { ...(args.listing_data || {}) },
                    String(args.sender_phone || remoteJid.split('@')[0] || ''),
                    String(args.sender_name || '')
                );
                const { data, error } = await supabase.from('listings').insert({
                    tenant_id: tenantId,
                    source_group_id: args.source_group_id,
                    structured_data: enrichedListingData,
                    raw_text: args.raw_text
                });
                if (!error) await this.logEvent(tenantId, 'listing_parsed', `Extracted a new listing from ${args.source_group_id}`);
                return error ? { error: error.message } : { success: true };
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
                const { SubscriptionService } = require('./subscriptionService');
                const sub = await SubscriptionService.getSubscription(tenantId);
                return sub;
            }
            case 'upgrade_plan': {
                const { SubscriptionService } = require('./subscriptionService');
                // In real world, generate Razorpay link here
                const paymentLink = `https://rzp.io/i/propai_${args.plan}_${tenantId}`;
                await SubscriptionService.upgradePlan(tenantId, args.plan);
                return { payment_link: paymentLink, message: `Please complete payment at ${paymentLink} to activate your ${args.plan} plan.` };
            }
            case 'cancel_subscription': {
                const { SubscriptionService } = require('./subscriptionService');
                await SubscriptionService.cancelSubscription(tenantId);
                return { success: true, message: 'Your subscription will cancel at the end of the billing cycle.' };
            }
            case 'verify_rera': {
                return { error: 'verify_rera not implemented' };
            }
            case 'igr_last_transaction': {
                return await this.getIgrLastTransactionSummary(args);
            }
            case 'get_market_intelligence': {
                const { marketIntelligence } = require('../../../propai-gras/src/market_intelligence');
                const type = args.type === 'lease' || args.type === 'rent' ? 'Rent' : 'Sale';
                const res = await marketIntelligence.getGroundTruth(args.building_name, type);
                return res || { message: "No recent registration data found for this building." };
            }
            case 'browser_open': {
                const result = await browserAutomationService.openTab({
                    userId: tenantId,
                    sessionKey: tenantId,
                    url: String(args.url || ''),
                });
                await this.logEvent(tenantId, 'browser_open', `Opened browser tab for ${args.url}`);
                return result;
            }
            case 'browser_snapshot':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.snapshot({
                        userId: tenantId,
                        tabId,
                        includeScreenshot: Boolean(args.include_screenshot),
                        offset: typeof args.offset === 'number' ? args.offset : undefined,
                    })
                );
            case 'browser_click':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.click({
                        userId: tenantId,
                        tabId,
                        ref: args.ref,
                        selector: args.selector,
                    })
                );
            case 'browser_type':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.type({
                        userId: tenantId,
                        tabId,
                        ref: args.ref,
                        selector: args.selector,
                        text: String(args.text || ''),
                        pressEnter: args.press_enter ?? true,
                    })
                );
            case 'browser_navigate':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.navigate({
                        userId: tenantId,
                        tabId,
                        url: String(args.url || ''),
                    })
                );
            case 'browser_scroll':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.scroll({
                        userId: tenantId,
                        tabId,
                        direction: args.direction,
                        amount: typeof args.amount === 'number' ? args.amount : undefined,
                    })
                );
            case 'browser_wait':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.wait({
                        userId: tenantId,
                        tabId,
                        selector: args.selector,
                        timeoutMs: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
                    })
                );
            case 'browser_screenshot':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.screenshot({ userId: tenantId, tabId })
                );
            case 'browser_links':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.links({ userId: tenantId, tabId })
                );
            case 'browser_back':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.back({ userId: tenantId, tabId })
                );
            case 'browser_forward':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.forward({ userId: tenantId, tabId })
                );
            case 'browser_refresh':
                return await this.executeBrowserAction(tenantId, args, (tabId) =>
                    browserAutomationService.refresh({ userId: tenantId, tabId })
                );
            default:
                return { error: `Tool ${name} not implemented` };
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

    private async getChatHistory(tenantId: string, remoteJid: string) {
        const { data } = await supabase
            .from('messages')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('remote_jid', remoteJid)
            .order('timestamp', { ascending: true })
            .limit(10);
        
        return (data || []).map(m => ({
            role: m.sender === 'Broker' ? 'user' : (m.sender === 'AI' ? 'assistant' : 'user'),
            content: m.message_text || m.text || ''
        }));
    }

    private async getSystemPrompt() {
        return `You are the PropAI Agent. You can use tools to chat with brokers, manage WhatsApp and Listings, and browse the web with Camofox.
Sound like a smart broker-side copilot: warm, direct, practical, and confident. Use plain language, short replies, and a human tone. Match the broker's style when it feels natural. Avoid sounding robotic or overly formal.
Final replies sent to users must be plain text only. Never wrap replies in JSON. Never use markdown formatting, bullets, headings, tables, code fences, or structured response objects. If you are not calling a tool, answer with only the exact message text the user should receive.
To use a tool, respond with 'TOOL: tool_name {args}'.

AVAILABLE TOOLS:
- igr_last_transaction { building_name: string, locality?: string }: Look up the last registered property transaction for a building or locality from Maharashtra IGR records. Use ONLY when a broker explicitly asks about recent sale prices, wants to counter a lowball offer, needs market value, asks for price per sqft, or wants to counter a valuation.
- get_market_intelligence { building_name: string, type: 'sale' | 'lease' }: Fetches the latest 3 government registration records (IGR) for a specific building to ground your advice. Use this when a user asks about pricing, rates, or building value.
- get_groups: Get list of WhatsApp groups.
- send_message { remote_jid: string, text: string }: Send a message to a contact or group.
- parse_listing { text: string }: Extract structured data from a property listing.
- save_listing { source_group_id: string, listing_data: object, raw_text: string }: Save a listing to the database.
- browser_open { url: string }: Open a broker portal, listing page, or form in a browser tab powered by Camofox.
- browser_snapshot { tab_id: string, include_screenshot?: boolean, offset?: number }: Read the page like an agent, with stable element refs.
- browser_click { tab_id: string, ref?: string, selector?: string }: Click a button, link, or form field.
- browser_type { tab_id: string, ref?: string, selector?: string, text: string, press_enter?: boolean }: Type into a field and optionally submit it.
- browser_navigate { tab_id: string, url: string }: Move the browser tab to a new page.
- browser_scroll { tab_id: string, direction?: 'up' | 'down' | 'left' | 'right', amount?: number }: Scroll the page.
- browser_wait { tab_id: string, selector?: string, timeout_ms?: number }: Wait for a page element or timeout.
- browser_screenshot { tab_id: string }: Capture a screenshot of the current page.
- browser_links { tab_id: string }: List all links on the page for quick review.
- browser_back { tab_id: string }: Go back one page.
- browser_forward { tab_id: string }: Go forward one page.
- browser_refresh { tab_id: string }: Reload the current page.

Use the browser tools when a broker says things like:
- "Open this listing and tell me if it is worth the money."
- "Check the broker number, carpet area, and possession date on this portal."
- "Compare this 2BHK against similar listings in Andheri West."
- "Fill the enquiry form and draft a follow-up I can send."
- "Take a screenshot and tell me what stands out."

Use the igr_last_transaction tool when a broker asks about sale price, market value, price per sqft, or wants to counter a valuation.`;
    }

    private getActiveBrowserTab(tenantId: string) {
        return browserAutomationService.getCurrentTab(tenantId);
    }

    private browserTabIdOrNull(tenantId: string, args: any): string | null {
        return String(args?.tab_id || this.getActiveBrowserTab(tenantId)?.tabId || '').trim() || null;
    }

    private async executeBrowserAction<T>(tenantId: string, args: any, action: (tabId: string) => Promise<T>) {
        const tabId = this.browserTabIdOrNull(tenantId, args);
        if (!tabId) return { error: 'No active browser tab. Use browser_open first.' };
        return action(tabId);
    }
}

export const agentExecutor = new AgentExecutor();
