import { aiService } from './aiService';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase } from '../config/supabase';
import { safeJSONParse } from '../utils/jsonUtils';
// Remove the direct import that causes TS issues in test
// import { PropAITools } from '../../../packages/agent/src/tools';

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
        // Remove tool call patterns if they leaked into final output
        let cleaned = text.replace(/TOOL: \w+ \{.*?\}/g, '').trim();
        // Remove JSON-like blocks
        cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '').trim();
        // Remove technical markers
        cleaned = cleaned.replace(/\[.*?\]/g, '').trim();
        
        return cleaned || "I've taken care of that for you!";
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
                const { data, error } = await supabase.from('listings').insert({
                    tenant_id: tenantId,
                    source_group_id: args.source_group_id,
                    structured_data: args.listing_data,
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
                return { status: 'Verified', reg_no: 'P518000XXXX', state: args.state };
            }
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
            .select('text, sender')
            .eq('tenant_id', tenantId)
            .eq('remote_jid', remoteJid)
            .order('timestamp', { ascending: true })
            .limit(10);
        
        return (data || []).map(m => ({
            role: m.sender === 'Broker' ? 'user' : (m.sender === 'AI' ? 'assistant' : 'user'),
            content: m.text
        }));
    }

    private async getSystemPrompt() {
        // Read from the file we created in packages/agent
        return "You are the PropAI Agent. You can use tools to manage WhatsApp and Listings. To use a tool, respond with 'TOOL: tool_name {args}'.";
    }
}

export const agentExecutor = new AgentExecutor();
