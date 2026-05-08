import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverClientOptions } from '../config/supabase';
import { followUpService } from './followUpService';
import { extractIndianCity, extractIndianLocality, parseIndianLocation } from '../utils/locationParser';
import { channelService } from './channelService';

type WorkflowResult =
    | { handled: false }
    | { handled: true; reply: string; data?: any };

type ParsedIntake = {
    record_type: 'inventory_listing' | 'buyer_requirement';
    name: string;
    phone: string;
    raw_text: string;
    source: string;
    listing?: {
        bhk?: string;
        location?: string;
        price?: string;
        carpet_area?: string;
        furnishing?: string;
        possession_date?: string;
        contact_number?: string;
    };
    requirement?: {
        budget?: string;
        location_pref?: string;
        timeline?: string;
        possession?: string;
    };
};

export type BrokerToolIntent =
    | 'save_listing'
    | 'save_requirement'
    | 'create_channel'
    | 'schedule_callback'
    | 'check_callbacks'
    | 'search_listings'
    | 'get_my_listings'
    | 'get_my_requirements'
    | 'search_my_crm'
    | 'general_answer';

export type BrokerToolPlan = {
    intent: BrokerToolIntent;
    confidence?: number;
    rationale?: string;
    args?: Record<string, unknown>;
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wnrwntumacbirbndfvwg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

export class BrokerWorkflowService {
    private readonly admin: SupabaseClient;

    constructor() {
        this.admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || 'placeholder-service-key', serverClientOptions);
    }

    async handlePrompt(tenantId: string, prompt: string): Promise<WorkflowResult> {
        const normalized = prompt.toLowerCase().trim();
        const intake = this.parseIntake(prompt);
        const callbackSchedule = this.isCallbackSchedule(normalized);
        const callbackCheck = this.isCallbackCheck(normalized);

        if (!SUPABASE_SERVICE_KEY) {
            if (!intake && !callbackSchedule && !callbackCheck) {
                return { handled: false };
            }

            return {
                handled: true,
                reply: 'AI storage features are temporarily unavailable because the storage service key is not configured.',
                data: { type: 'storage_unavailable' },
            };
        }

        if (callbackSchedule) {
            const schedule = await this.scheduleFollowUp(tenantId, prompt);
            return schedule;
        }

        if (callbackCheck) {
            const callbackQueue = await followUpService.getPendingCallbacks(tenantId, 10);
            const count = callbackQueue.length;
            const top = callbackQueue[0];
            return {
                handled: true,
                reply: count === 0
                    ? 'No callback queue entries found right now.'
                    : `I found ${count} callback candidate(s). Next up: ${top.lead_name} at ${this.formatDueAt(top.due_at)}.`,
                data: { type: 'callback_check', items: callbackQueue },
            };
        }

        if (!intake) {
            return { handled: false };
        }

        if (intake.record_type === 'inventory_listing') {
            await this.saveListing(tenantId, intake);
            await this.saveLeadRecord(tenantId, intake);
            return {
                handled: true,
                reply: `Saved your listing for ${intake.listing?.location || 'the requested location'}.`,
                data: { type: 'listing_saved', record_type: 'inventory_listing' },
            };
        }

        await this.saveLeadRecord(tenantId, intake);
        return {
            handled: true,
            reply: `Saved your requirement for ${intake.requirement?.location_pref || 'the requested location'}.`,
            data: { type: 'requirement_saved', record_type: 'buyer_requirement' },
        };
    }

    async executePlan(tenantId: string, plan: BrokerToolPlan, prompt: string): Promise<WorkflowResult> {
        switch (plan.intent) {
            case 'save_listing':
                return await this.saveListingFromDraft(tenantId, plan.args || {}, prompt);
            case 'save_requirement':
                return await this.saveRequirementFromDraft(tenantId, plan.args || {}, prompt);
            case 'create_channel':
                return await this.createChannelFromDraft(tenantId, plan.args || {}, prompt);
            case 'schedule_callback':
                return await this.scheduleFollowUp(tenantId, this.mergeText(plan.args, prompt));
            case 'check_callbacks':
                return await this.checkCallbacks(tenantId);
            case 'search_listings':
                return await this.searchListings(tenantId, this.mergeText(plan.args, prompt));
            case 'get_my_listings':
                return await this.getMyListings(tenantId, this.mergeText(plan.args, prompt));
            case 'get_my_requirements':
                return await this.getMyRequirements(tenantId, this.mergeText(plan.args, prompt));
            case 'search_my_crm':
                return await this.searchMyCrm(tenantId, this.mergeText(plan.args, prompt));
            default:
                return { handled: false };
        }
    }

    private isCallbackCheck(text: string) {
        return (
            (text.includes('callback') || text.includes('call back') || text.includes('follow up')) &&
            (text.includes('check') || text.includes('show') || text.includes('queue') || text.includes('pending') || text.includes('today'))
        );
    }

    private isCallbackSchedule(text: string) {
        return (
            (text.includes('callback') || text.includes('call back') || text.includes('follow up') || text.includes('remind')) &&
            (text.includes('tomorrow') || text.includes('today') || text.includes('next week') || text.includes('in ') || text.includes('schedule') || text.includes('set'))
        );
    }

    private parseIntake(prompt: string): ParsedIntake | null {
        const lowered = prompt.toLowerCase();
        const requirementCue = /\b(requirement|required|looking for|need|wanted)\b/i.test(prompt);
        const listingCue = /\b(listing|available|sale|rent|lease|bhk|flat|apartment|office|shop|showroom|warehouse)\b/i.test(prompt);
        const phone = this.extractPhone(prompt) || 'unknown';
        const name = this.extractName(prompt) || 'AI Chat Entry';

        if (!requirementCue && !listingCue) {
            return null;
        }

        if (requirementCue && !listingCue) {
            return {
                record_type: 'buyer_requirement',
                name,
                phone,
                raw_text: prompt,
                source: 'ai_chat',
                requirement: {
                    budget: this.extractBudget(prompt),
                    location_pref: this.extractLocation(prompt),
                    timeline: this.extractTimeline(prompt),
                    possession: this.extractPossession(prompt),
                },
            };
        }

        return {
            record_type: 'inventory_listing',
            name,
            phone,
            raw_text: prompt,
            source: 'ai_chat',
            listing: {
                bhk: this.extractBhk(prompt),
                location: this.extractLocation(prompt),
                price: this.extractPrice(prompt),
                carpet_area: this.extractCarpetArea(prompt),
                furnishing: this.extractFurnishing(prompt),
                possession_date: this.extractPossession(prompt),
                contact_number: phone === 'unknown' ? undefined : phone,
            },
        };
    }

    private async saveListing(tenantId: string, intake: ParsedIntake) {
        const listingData = intake.listing || {};
        await this.admin.from('listings').insert({
            tenant_id: tenantId,
            source_group_id: 'ai-chat',
            structured_data: {
                ...listingData,
                source: intake.source,
            },
            raw_text: intake.raw_text,
        });
    }

    async saveListingFromDraft(tenantId: string, draft: Record<string, unknown>, fallbackText: string): Promise<WorkflowResult> {
        const prompt = this.mergeText(draft, fallbackText);
        const intake = this.parseIntake(prompt) || {
            record_type: 'inventory_listing' as const,
            name: String(draft.name || this.extractName(prompt) || 'AI Chat Entry'),
            phone: String(draft.phone || this.extractPhone(prompt) || 'unknown'),
            raw_text: prompt,
            source: 'ai_chat',
            listing: {
                bhk: String(draft.bhk || this.extractBhk(prompt) || ''),
                location: String(draft.location || this.extractLocation(prompt) || ''),
                price: String(draft.price || this.extractPrice(prompt) || ''),
                carpet_area: String(draft.carpet_area || this.extractCarpetArea(prompt) || ''),
                furnishing: String(draft.furnishing || this.extractFurnishing(prompt) || ''),
                possession_date: String(draft.possession_date || this.extractPossession(prompt) || ''),
                contact_number: String(draft.contact_number || this.extractPhone(prompt) || ''),
            },
        };

        await this.saveListing(tenantId, intake);
        await this.saveLeadRecord(tenantId, intake);

        return {
            handled: true,
            reply: `Saved your listing for ${intake.listing?.location || 'the requested location'}.`,
            data: { type: 'listing_saved', record_type: 'inventory_listing' },
        };
    }

    async saveRequirementFromDraft(tenantId: string, draft: Record<string, unknown>, fallbackText: string): Promise<WorkflowResult> {
        const prompt = this.mergeText(draft, fallbackText);
        const intake = this.parseIntake(prompt) || {
            record_type: 'buyer_requirement' as const,
            name: String(draft.name || this.extractName(prompt) || 'AI Chat Entry'),
            phone: String(draft.phone || this.extractPhone(prompt) || 'unknown'),
            raw_text: prompt,
            source: 'ai_chat',
            requirement: {
                budget: String(draft.budget || this.extractBudget(prompt) || ''),
                location_pref: String(draft.location_pref || this.extractLocation(prompt) || ''),
                timeline: String(draft.timeline || this.extractTimeline(prompt) || ''),
                possession: String(draft.possession || this.extractPossession(prompt) || ''),
            },
        };

        await this.saveLeadRecord(tenantId, intake);

        return {
            handled: true,
            reply: `Saved your requirement for ${intake.requirement?.location_pref || 'the requested location'}.`,
            data: { type: 'requirement_saved', record_type: 'buyer_requirement' },
        };
    }

    async createChannelFromDraft(tenantId: string, draft: Record<string, unknown>, fallbackText: string): Promise<WorkflowResult> {
        const mergedText = this.mergeText(draft, fallbackText);
        const localities = this.extractChannelLocalities(draft, mergedText);
        const keywords = this.extractChannelKeywords(draft, mergedText);
        const recordTypes = this.extractChannelRecordTypes(draft, mergedText);
        const dealTypes = this.extractChannelDealTypes(draft, mergedText);
        const bhkValues = this.extractChannelBhkValues(draft, mergedText);
        const assetClasses = this.extractChannelAssetClasses(draft, mergedText);
        const channelType = draft.channel_type === 'listing' || draft.channel_type === 'requirement' || draft.channel_type === 'mixed'
            ? draft.channel_type
            : recordTypes.includes('requirement')
                ? 'requirement'
                : recordTypes.includes('listing')
                    ? 'listing'
                    : 'mixed';

        const created = await channelService.createChannel(tenantId, {
            name: String(draft.name || '').trim() || undefined,
            channelType,
            localities,
            keywords,
            keywordsExclude: this.extractStringArray(draft.keywords_exclude),
            dealTypes,
            recordTypes,
            bhkValues,
            assetClasses,
            pinned: true,
        });

        return {
            handled: true,
            reply: `Done. I created ${created.name} and I'll route matching stream items there.`,
            data: {
                type: 'channel_created',
                channel_id: created.id,
                output_format: 'summary_card',
                name: created.name,
                location: created.localities.join(', ') || 'Keyword-based',
                status: `${created.itemCount} matched item${created.itemCount === 1 ? '' : 's'} ready`,
                localities: created.localities,
                keywords: created.keywords,
            },
        };
    }

    private async saveLeadRecord(tenantId: string, intake: ParsedIntake) {
        const payload = intake.record_type === 'inventory_listing'
            ? {
                ...intake.listing,
                lead_id: this.buildLeadId(intake),
                phone: intake.phone,
                name: intake.name,
                record_type: intake.record_type,
                source: intake.source,
                raw_text: intake.raw_text,
            }
            : {
                ...intake.requirement,
                lead_id: this.buildLeadId(intake),
                phone: intake.phone,
                name: intake.name,
                record_type: intake.record_type,
                source: intake.source,
                raw_text: intake.raw_text,
            };

        const resolvedLocation = parseIndianLocation(intake.raw_text);
        const resolvedLocality = resolvedLocation?.locality || this.extractLocation(intake.raw_text);
        const resolvedCity = resolvedLocation?.city || this.extractCity(intake.raw_text);
        const matchedAlias = resolvedLocation?.matchedAlias || resolvedLocality || null;
        const resolutionMethod = resolvedLocation?.resolvedVia || 'unresolved';
        const unresolvedFlag = !resolvedLocation;

        const row = {
            tenant_id: tenantId,
            lead_id: this.buildLeadId(intake),
            phone: intake.phone,
            name: intake.name,
            record_type: intake.record_type,
            dataset_mode: 'mixed',
            deal_type: intake.record_type === 'inventory_listing' ? this.inferDealType(intake.raw_text) : 'unknown',
            asset_class: intake.record_type === 'inventory_listing' ? this.inferAssetClass(intake.raw_text) : 'unknown',
            price_basis: intake.record_type === 'inventory_listing' ? this.inferPriceBasis(intake.raw_text) : 'unknown',
            area_sqft: intake.record_type === 'inventory_listing' ? this.extractAreaSqft(intake.raw_text) : null,
            area_basis: intake.record_type === 'inventory_listing' ? this.extractAreaBasis(intake.raw_text) : 'unknown',
            budget: intake.record_type === 'buyer_requirement' ? this.extractBudgetNumeric(intake.raw_text) : null,
            location_hint: resolvedLocality,
            city: resolvedCity,
            city_canonical: resolvedCity,
            locality_canonical: resolvedLocality,
            micro_market: resolvedLocality,
            matched_alias: matchedAlias,
            confidence: resolvedLocation ? Math.max(0.72, resolvedLocation.confidence / 100) : 0.72,
            unresolved_flag: unresolvedFlag,
            resolution_method: resolutionMethod,
            urgency: this.extractUrgency(intake.raw_text),
            priority_bucket: this.extractUrgency(intake.raw_text) === 'high' ? 'P1' : 'P2',
            priority_score: intake.record_type === 'buyer_requirement' ? 76 : 62,
            sentiment_score: 0.2,
            intent_score: intake.record_type === 'buyer_requirement' ? 0.82 : 0.7,
            recency_score: 1,
            sentiment_risk: 0,
            raw_text: intake.raw_text,
            source: intake.source,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            payload,
        };

        await this.admin.from('lead_records').upsert(row, { onConflict: 'tenant_id,lead_id' });
    }

    private async getCallbackQueue(tenantId: string, prompt: string) {
        let query = this.admin
            .from('lead_records')
            .select('lead_id,name,phone,record_type,priority_bucket,priority_score,locality_canonical,location_hint,raw_text,source,created_at')
            .eq('tenant_id', tenantId)
            .order('priority_score', { ascending: false, nullsFirst: false })
            .limit(10);

        const locality = this.extractLocation(prompt);
        if (locality) {
            query = query.or(`locality_canonical.ilike.%${locality}%,location_hint.ilike.%${locality}%`);
        }

        const { data } = await query;
        return data || [];
    }

    private async checkCallbacks(tenantId: string): Promise<WorkflowResult> {
        const callbackQueue = await followUpService.getPendingCallbacks(tenantId, 10);
        const count = callbackQueue.length;
        const top = callbackQueue[0];
        return {
            handled: true,
            reply: count === 0
                ? 'No callback queue entries found right now.'
                : `I found ${count} callback candidate(s). Next up: ${top.lead_name} at ${this.formatDueAt(top.due_at)}.`,
            data: { type: 'callback_check', items: callbackQueue },
        };
    }

    private async searchListings(tenantId: string, prompt: string): Promise<WorkflowResult> {
        const { data, error } = await this.admin
            .from('listings')
            .select('id,source_group_id,structured_data,raw_text,created_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'Active')
            .limit(10);

        if (error) {
            return {
                handled: true,
                reply: `I couldn't search listings right now: ${error.message}`,
                data: { type: 'search_failed' },
            };
        }

        const queryText = prompt.toLowerCase().trim();
        const matches = (data || []).filter((listing: any) => {
            const text = JSON.stringify(listing.structured_data || {}).toLowerCase();
            return queryText.length < 3 || text.includes(queryText);
        });

        return {
            handled: true,
            reply: matches.length
                ? `I found ${matches.length} matching listing(s).`
                : 'I did not find any matching listings.',
            data: { type: 'listing_search', items: matches },
        };
    }

    private async getMyListings(tenantId: string, prompt: string): Promise<WorkflowResult> {
        const { data, error } = await this.admin
            .from('listings')
            .select('id, structured_data, raw_text, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return {
                handled: true,
                reply: `I couldn't open your saved listings right now: ${error.message}`,
                data: { type: 'listing_fetch_failed' },
            };
        }

        const matches = this.filterListings(data || [], prompt).slice(0, 10);

        return {
            handled: true,
            reply: matches.length
                ? `I found ${matches.length} saved listing(s) in your CRM.`
                : 'I could not find any saved listings matching that yet.',
            data: {
                type: 'saved_listings',
                output_format: 'bullet_list',
                items: matches.map((listing: any) => ({
                    title: this.describeListing(listing),
                    snippet: this.formatCreatedAt(listing.created_at),
                })),
            },
        };
    }

    private async getMyRequirements(tenantId: string, prompt: string): Promise<WorkflowResult> {
        const { data, error } = await this.admin
            .from('lead_records')
            .select('lead_id,name,phone,location_hint,locality_canonical,budget,raw_text,created_at')
            .eq('tenant_id', tenantId)
            .eq('record_type', 'buyer_requirement')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return {
                handled: true,
                reply: `I couldn't open your saved requirements right now: ${error.message}`,
                data: { type: 'requirement_fetch_failed' },
            };
        }

        const matches = this.filterLeadRecords(data || [], prompt).slice(0, 10);

        return {
            handled: true,
            reply: matches.length
                ? `I found ${matches.length} saved requirement(s) in your CRM.`
                : 'I could not find any saved requirements matching that yet.',
            data: {
                type: 'saved_requirements',
                output_format: 'bullet_list',
                items: matches.map((record: any) => ({
                    title: this.describeRequirement(record),
                    snippet: this.formatCreatedAt(record.created_at),
                })),
            },
        };
    }

    private async searchMyCrm(tenantId: string, prompt: string): Promise<WorkflowResult> {
        const [listingsResult, requirementsResult] = await Promise.all([
            this.admin
                .from('listings')
                .select('id, structured_data, raw_text, created_at')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(50),
            this.admin
                .from('lead_records')
                .select('lead_id,name,phone,record_type,location_hint,locality_canonical,budget,raw_text,created_at')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(50),
        ]);

        if (listingsResult.error) {
            return {
                handled: true,
                reply: `I couldn't search your CRM right now: ${listingsResult.error.message}`,
                data: { type: 'crm_search_failed' },
            };
        }

        if (requirementsResult.error) {
            return {
                handled: true,
                reply: `I couldn't search your CRM right now: ${requirementsResult.error.message}`,
                data: { type: 'crm_search_failed' },
            };
        }

        const listingMatches = this.filterListings(listingsResult.data || [], prompt).slice(0, 5);
        const crmMatches = this.filterLeadRecords(requirementsResult.data || [], prompt).slice(0, 5);
        const items = [
            ...listingMatches.map((listing: any) => ({
                title: `Listing: ${this.describeListing(listing)}`,
                snippet: this.formatCreatedAt(listing.created_at),
            })),
            ...crmMatches.map((record: any) => ({
                title: `${record.record_type === 'buyer_requirement' ? 'Requirement' : 'Lead'}: ${this.describeRequirement(record)}`,
                snippet: this.formatCreatedAt(record.created_at),
            })),
        ];

        return {
            handled: true,
            reply: items.length
                ? `I found ${items.length} matching CRM record(s).`
                : 'I could not find anything in your saved CRM records for that yet.',
            data: {
                type: 'crm_search',
                output_format: 'bullet_list',
                items,
            },
        };
    }

    private async scheduleFollowUp(tenantId: string, prompt: string): Promise<WorkflowResult> {
        const leadName = this.extractName(prompt) || 'AI Chat Entry';
        const leadPhone = this.extractPhone(prompt) || undefined;
        const actionType = this.detectActionType(prompt);
        const dueAt = this.resolveDueAt(prompt);
        const priorityBucket = this.detectPriorityBucket(prompt);
        const notes = prompt.trim();

        const result = await followUpService.scheduleCallback(tenantId, {
            lead_name: leadName,
            lead_phone: leadPhone,
            action_type: actionType,
            due_at: dueAt,
            notes,
            priority_bucket: priorityBucket,
        });

        if (result.status === 'failure') {
            return {
                handled: true,
                reply: `I couldn't schedule the callback: ${result.error_message}`,
                data: { type: 'callback_schedule_failed' },
            };
        }

        return {
            handled: true,
            reply: `Callback scheduled for ${leadName} at ${this.formatDueAt(result.due_at)}.`,
            data: {
                type: 'callback_scheduled',
                lead_name: leadName,
                due_at: result.due_at,
                action_type: actionType,
            },
        };
    }

    private buildLeadId(intake: ParsedIntake) {
        return [
            intake.record_type,
            intake.phone,
            intake.listing?.location || intake.requirement?.location_pref || 'na',
            intake.listing?.price || intake.requirement?.budget || 'na',
        ].join(':');
    }

    private extractPhone(text: string) {
        const match = text.match(/(?:\+?91[\s-]?)?([6-9]\d{9})/);
        return match ? `+91${match[1]}` : '';
    }

    private extractName(text: string) {
        const match = text.match(/\b(?:name|contact|broker|client)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,40})/i);
        return match?.[1]?.trim() || '';
    }

    private extractLocation(text: string) {
        return extractIndianLocality(text);
    }

    private extractCity(text: string) {
        const city = extractIndianCity(text);
        if (city !== 'Unknown') {
            return city;
        }
        if (/gurgaon|gurugram/i.test(text)) return 'Gurgaon';
        if (/bangalore|bengaluru/i.test(text)) return 'Bangalore';
        return 'Unknown';
    }

    private extractBhk(text: string) {
        const match = text.match(/\b(\d+\+?\s*bhk)\b/i);
        return match?.[1]?.trim() || '';
    }

    private extractPrice(text: string) {
        const match = text.match(/(\d+(?:\.\d+)?)\s*(cr|crore|lakh|lac|k)\b/i);
        return match ? `${match[1]} ${match[2]}` : '';
    }

    private extractCarpetArea(text: string) {
        const match = text.match(/(\d{2,5}(?:\.\d+)?)\s*(sqft|sq ft|carpet|builtup|built-up)\b/i);
        return match ? `${match[1]} ${match[2]}` : '';
    }

    private extractFurnishing(text: string) {
        if (/semi[-\s]?furnished/i.test(text)) return 'semi-furnished';
        if (/fully furnished|furnished/i.test(text)) return 'furnished';
        if (/unfurnished/i.test(text)) return 'unfurnished';
        return '';
    }

    private extractPossession(text: string) {
        const match = text.match(/\b(?:immediate|ready|possession|available from|vacant from)\b[^\n.]*/i);
        return match?.[0]?.trim() || '';
    }

    private extractTimeline(text: string) {
        const match = text.match(/\b(?:today|tomorrow|this week|this month|immediate|urgent|soon)\b/i);
        return match?.[0] || '';
    }

    private extractBudget(text: string) {
        const value = this.extractBudgetNumeric(text);
        return value ? String(value) : '';
    }

    private extractBudgetNumeric(text: string) {
        const match = text.match(/(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|k|thousand)\b/i);
        if (!match) return undefined;
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        if (Number.isNaN(amount)) return undefined;
        if (unit === 'cr' || unit === 'crore' || unit === 'crores') return amount * 10000000;
        if (unit === 'lakh' || unit === 'lakhs' || unit === 'lac' || unit === 'lacs') return amount * 100000;
        if (unit === 'k' || unit === 'thousand') return amount * 1000;
        return amount;
    }

    private extractDealType(text: string) {
        if (/lease|leave and licence|l&l|l & l/i.test(text)) return 'lease';
        if (/outright/i.test(text)) return 'outright';
        if (/rent/i.test(text)) return 'rent';
        if (/sale/i.test(text)) return 'sale';
        return 'unknown';
    }

    private inferDealType(text: string) {
        return this.extractDealType(text);
    }

    private extractAssetClass(text: string) {
        if (/office|shop|showroom|retail|commercial/i.test(text)) return 'commercial';
        if (/pg|paying guest/i.test(text)) return 'pg';
        if (/\b\d+\s*bhk\b/i.test(text) || /flat|apartment|furnished|family/i.test(text)) return 'residential';
        return 'unknown';
    }

    private inferAssetClass(text: string) {
        return this.extractAssetClass(text);
    }

    private extractPriceBasis(text: string) {
        if (/psf|per sq ft|per sqft/i.test(text)) return 'per_sqft';
        if (/deposit/i.test(text)) return 'deposit';
        if (/rent/i.test(text)) return 'monthly_rent';
        return 'total';
    }

    private inferPriceBasis(text: string) {
        return this.extractPriceBasis(text);
    }

    private extractAreaSqft(text: string) {
        const match = text.match(/(\d{2,5}(?:\.\d+)?)\s*(sqft|sq ft|carpet|builtup|built-up)\b/i);
        return match ? Number(match[1]) : null;
    }

    private extractAreaBasis(text: string) {
        if (/rera carpet/i.test(text)) return 'rera_carpet';
        if (/carpet/i.test(text)) return 'carpet';
        if (/builtup|built-up/i.test(text)) return 'builtup';
        return 'unknown';
    }

    private extractUrgency(text: string) {
        if (/immediate|urgent|asap|today|call now|site visit|inspection any time/i.test(text)) return 'high';
        if (/soon|this week|follow up|tomorrow/i.test(text)) return 'medium';
        return 'low';
    }

    private detectActionType(text: string) {
        if (/visit|site visit|inspection/i.test(text)) return 'visit';
        if (/email|mail/i.test(text)) return 'email';
        return 'call';
    }

    private detectPriorityBucket(text: string) {
        if (/p1|urgent|asap|today|immediate|site visit/i.test(text)) return 'P1';
        if (/p2|soon|this week|follow up/i.test(text)) return 'P2';
        return 'P3';
    }

    private resolveDueAt(text: string) {
        const now = new Date();
        if (/tomorrow/i.test(text)) {
            now.setDate(now.getDate() + 1);
            return now.toISOString();
        }
        if (/next week/i.test(text)) {
            now.setDate(now.getDate() + 7);
            return now.toISOString();
        }
        if (/today|now|asap|immediate/i.test(text)) {
            return now.toISOString();
        }
        now.setDate(now.getDate() + 1);
        return now.toISOString();
    }

    private formatDueAt(dueAt: string) {
        const date = new Date(dueAt);
        return Number.isNaN(date.getTime()) ? 'soon' : date.toLocaleString();
    }

    private mergeText(value: unknown, fallbackText: string) {
        if (!value || typeof value !== 'object') {
            return fallbackText;
        }

        const pieces = [fallbackText];
        for (const entry of Object.values(value as Record<string, unknown>)) {
            if (typeof entry === 'string' && entry.trim()) {
                pieces.push(entry.trim());
            }
        }

        return pieces.join(' ').trim();
    }

    private extractStringArray(value: unknown) {
        return Array.isArray(value)
            ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [];
    }

    private extractChannelLocalities(draft: Record<string, unknown>, text: string) {
        const direct = this.extractStringArray(draft.localities);
        if (direct.length > 0) {
            return direct;
        }

        const specificLocation = parseIndianLocation(
            String(draft.location || draft.locality || draft.area || text || '')
        );
        if (specificLocation?.locality) {
            return [specificLocation.locality.toLowerCase()];
        }

        const inferred = this.extractLocation(text);
        if (inferred) {
            return [String(inferred).toLowerCase()];
        }

        const normalized = text.toLowerCase();
        const matched = [
            'andheri west',
            'andheri east',
            'bandra west',
            'bandra east',
            'khar west',
            'khar',
            'juhu',
            'powai',
            'worli',
            'lower parel',
            'goregaon',
            'borivali',
            'lokhandwala',
            'oshiwara',
            'kandivali',
            'kanjurmarg',
        ].filter((locality) => normalized.includes(locality));

        return matched.length > 0 ? [matched[0]] : [];
    }

    private extractChannelKeywords(draft: Record<string, unknown>, text: string) {
        const direct = this.extractStringArray(draft.keywords);
        if (direct.length > 0) {
            return direct;
        }

        const matched: string[] = [];
        if (/pre[-\s]?leased/i.test(text)) matched.push('pre-leased');
        if (/urgent/i.test(text)) matched.push('urgent');
        if (/investor|investment/i.test(text)) matched.push('investor');
        if (/office|commercial/i.test(text)) matched.push('commercial');
        return matched;
    }

    private extractChannelRecordTypes(draft: Record<string, unknown>, text: string) {
        const direct = this.extractStringArray(draft.record_types);
        if (direct.length > 0) {
            return direct;
        }

        const lowered = text.toLowerCase();
        if (/requirement|buyer|tenant wants|looking for|need/i.test(lowered)) return ['requirement'];
        if (/listing|listings|inventory|available|properties|property|for sale|for rent|pre[-\s]?leased/i.test(lowered)) return ['listing'];
        return [];
    }

    private extractChannelDealTypes(draft: Record<string, unknown>, text: string) {
        const direct = this.extractStringArray(draft.deal_types);
        if (direct.length > 0) {
            return direct;
        }

        const matched: string[] = [];
        if (/rental|rent|lease|leave and license|leave & license/i.test(text)) matched.push('rent');
        if (/sale|buy|purchase/i.test(text)) matched.push('sale');
        if (/pre[-\s]?leased/i.test(text)) matched.push('pre-leased');
        return matched;
    }

    private extractChannelBhkValues(draft: Record<string, unknown>, text: string) {
        const direct = this.extractStringArray(draft.bhk_values);
        if (direct.length > 0) {
            return direct;
        }

        // Extract BHK patterns without regex
        const words = text.split(' ').filter(Boolean);
        const bhkPatterns: string[] = [];
        for (let i = 0; i < words.length; i++) {
            const word = words[i].toLowerCase();
            if (word.endsWith('bhk')) {
                // Check if there's a number before it
                if (i > 0) {
                    const prev = words[i - 1];
                    // Check if prev is a number (including decimal)
                    let isNumber = true;
                    for (const c of prev) {
                        if (!(c >= '0' && c <= '9') && c !== '.') {
                            isNumber = false;
                            break;
                        }
                    }
                    if (isNumber && prev.length > 0) {
                        let pattern = prev;
                        // Check for + before the number
                        if (i > 1 && words[i - 2] === '+') {
                            pattern = '+' + pattern;
                        }
                        pattern = (pattern + ' ' + word).toUpperCase();
                        bhkPatterns.push(pattern);
                    }
                }
            }
        }
        return Array.from(new Set(bhkPatterns));
    }

    private extractChannelAssetClasses(draft: Record<string, unknown>, text: string) {
        const direct = this.extractStringArray(draft.asset_classes);
        if (direct.length > 0) {
            return direct;
        }

        if (/office|commercial|shop|showroom|warehouse/i.test(text)) {
            return ['commercial'];
        }

        if (/\bbhk\b|flat|apartment|residential/i.test(text)) {
            return ['residential'];
        }

        return [];
    }

    private filterListings(listings: any[], prompt: string) {
        const queryText = prompt.toLowerCase().trim();
        if (!queryText) {
            return listings;
        }

        return listings.filter((listing) => {
            const haystack = JSON.stringify(listing.structured_data || {}).toLowerCase() + ' ' + String(listing.raw_text || '').toLowerCase();
            return haystack.includes(queryText)
                || queryText.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
        });
    }

    private filterLeadRecords(records: any[], prompt: string) {
        const queryText = prompt.toLowerCase().trim();
        if (!queryText) {
            return records;
        }

        return records.filter((record) => {
            const haystack = JSON.stringify(record || {}).toLowerCase();
            return haystack.includes(queryText)
                || queryText.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
        });
    }

    private describeListing(listing: any) {
        const data = listing.structured_data || {};
        const parts = [
            data.bhk,
            data.location,
            data.price,
        ].filter(Boolean).map((value: unknown) => String(value).trim());

        return parts.length ? parts.join(' | ') : String(listing.raw_text || 'Saved listing').trim();
    }

    private describeRequirement(record: any) {
        const parts = [
            record.name,
            record.locality_canonical || record.location_hint,
            record.budget ? `Budget ${record.budget}` : '',
        ].filter(Boolean).map((value: unknown) => String(value).trim());

        return parts.length ? parts.join(' | ') : String(record.raw_text || 'Saved requirement').trim();
    }

    private formatCreatedAt(value: string) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'saved recently';
        }

        return `Saved ${date.toLocaleString()}`;
    }
}

export const brokerWorkflowService = new BrokerWorkflowService();
