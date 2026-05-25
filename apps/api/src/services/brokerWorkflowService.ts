import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverClientOptions } from '../config/supabase';
import { followUpService } from './followUpService';
import { extractIndianCity, extractIndianLocality, parseIndianLocation } from '../utils/locationParser';
import { channelService } from './channelService';

type WorkflowResult =
    | { handled: false }
    | { handled: true; reply: string; data?: any };

type ConfirmationIntent = 'save_listing' | 'save_requirement';

export type GroupMentionListingMatch = {
    id: string;
    title: string;
    location: string;
    city: string | null;
    bhk: string | null;
    priceLabel: string | null;
    priceNumeric: number | null;
    areaSqft: number | null;
    propertyCategory: string | null;
    brokerName: string | null;
    brokerPhone: string | null;
    sourcePhone: string | null;
    rawText: string;
    createdAt: string;
    score: number;
};

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
    | 'semantic_search'
    | 'market_insights'
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

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

export class BrokerWorkflowService {
    private readonly admin: SupabaseClient;

    constructor() {
        this.admin = createClient(SUPABASE_URL || 'http://127.0.0.1:54321', SUPABASE_SERVICE_KEY || 'missing-service-role-key', serverClientOptions);
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
            case 'semantic_search':
                return await this.semanticSearchListings(tenantId, this.mergeText(plan.args, prompt));
            case 'market_insights':
                return await this.getMarketInsights(tenantId, this.mergeText(plan.args, prompt));
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

    async matchListingToRequirements(tenantId: string, prompt: string, limit = 3): Promise<GroupMentionListingMatch[]> {
        const queryText = String(prompt || '').trim();
        if (!queryText) {
            return [];
        }

        const location = this.extractLocation(queryText).toLowerCase();
        const city = this.extractCity(queryText).toLowerCase();
        const bhk = this.extractBhk(queryText).toLowerCase();
        const budget = this.extractBudgetNumeric(queryText);
        const tokens = queryText
            .toLowerCase()
            .split(/[^a-z0-9]+/i)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2 && !['in', 'at', 'for', 'and', 'the', 'with', 'from'].includes(token));

        const { data, error } = await this.admin
            .from('stream_items')
            .select('id, locality, city, bhk, price_label, price_numeric, property_category, area_sqft, raw_text, created_at, confidence_score, source_phone, parsed_payload, record_type')
            .eq('tenant_id', tenantId)
            .eq('record_type', 'listing')
            .order('created_at', { ascending: false })
            .limit(250);

        if (error || !data) {
            return [];
        }

        const scored = data
            .map((item: any) => this.scoreGroupMentionListing(item, { queryText, tokens, location, city, bhk, budget }))
            .filter((item): item is GroupMentionListingMatch => Boolean(item))
            .sort((a, b) => b.score - a.score || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

        return scored.slice(0, Math.max(1, Math.min(limit, 10)));
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

        if (!this.isDraftConfirmed(draft) && !this.isExplicitSaveIntent(prompt)) {
            return {
                handled: true,
                reply: this.buildListingConfirmationReply(intake),
                data: {
                    type: 'listing_confirmation_required',
                    confirmation_intent: 'save_listing',
                },
            };
        }

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

        if (!this.isDraftConfirmed(draft) && !this.isExplicitSaveIntent(prompt)) {
            return {
                handled: true,
                reply: this.buildRequirementConfirmationReply(intake),
                data: {
                    type: 'requirement_confirmation_required',
                    confirmation_intent: 'save_requirement',
                },
            };
        }

        await this.saveLeadRecord(tenantId, intake);
        const matches = await this.matchListingToRequirements(tenantId, intake.raw_text, 3);
        const location = intake.requirement?.location_pref || 'the requested location';
        const streamReply = matches.length
            ? `\n\nStream matches right now:\n${this.renderRequirementMatches(matches)}`
            : '\n\nI checked Stream and did not find a close live match yet.';

        return {
            handled: true,
            reply: `Saved your requirement for ${location}.${streamReply}`,
            data: {
                type: 'requirement_saved',
                record_type: 'buyer_requirement',
                stream_match_count: matches.length,
                stream_matches: matches,
            },
        };
    }

    isAffirmativeReply(text: string) {
        return /^(y|yes|yeah|yep|confirm|confirmed|ok|okay|go ahead|do it|save it)$/i.test(String(text || '').trim());
    }

    isNegativeReply(text: string) {
        return /^(n|no|nope|cancel|stop|not now|don't|do not)$/i.test(String(text || '').trim());
    }

    extractConfirmationIntent(text: string): ConfirmationIntent | null {
        const normalized = String(text || '');
        if (/I understood this as a buyer requirement:/i.test(normalized)) {
            return 'save_requirement';
        }
        if (/I understood this as a listing:/i.test(normalized)) {
            return 'save_listing';
        }
        return null;
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

        const hasEnoughChannelCriteria = localities.length > 0
            || keywords.length > 0
            || recordTypes.length > 0
            || dealTypes.length > 0
            || bhkValues.length > 0
            || assetClasses.length > 0;

        if (!hasEnoughChannelCriteria) {
            return {
                handled: true,
                reply: 'Sure. Which area or filter should I use for the channel? For example: Bandra West, 2BHK buyers, or South Mumbai listings.',
                data: {
                    type: 'channel_clarification_required',
                    missing: ['locality_or_filter'],
                },
            };
        }

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
        const criteria = this.buildSearchCriteria(prompt);
        const { data, error } = await this.admin
            .from('stream_items')
            .select('id, locality, city, bhk, price_label, price_numeric, area_sqft, property_category, raw_text, created_at, parsed_payload, record_type, type, source_phone, ingestion_status')
            .eq('tenant_id', tenantId)
            .eq('record_type', 'listing')
            .not('ingestion_status', 'in', '("suppressed","expired")')
            .order('created_at', { ascending: false })
            .limit(250);

        if (error) {
            return {
                handled: true,
                reply: `I couldn't search Stream right now: ${error.message}`,
                data: { type: 'search_failed' },
            };
        }

        const matches = (data || []).filter((listing: any) => {
            const payload = listing?.parsed_payload && typeof listing.parsed_payload === 'object'
                ? listing.parsed_payload
                : {};
            const haystack = [
                listing?.locality,
                listing?.city,
                listing?.bhk,
                listing?.price_label,
                listing?.property_category,
                listing?.type,
                listing?.raw_text,
                JSON.stringify(payload || {}),
            ]
                .filter(Boolean)
                .map((value: unknown) => String(value).toLowerCase())
                .join(' ');

            if (criteria.wantsRequirementOnly) {
                return false;
            }
            if (criteria.location && !haystack.includes(criteria.location)) {
                return false;
            }
            if (criteria.bhk && !haystack.includes(criteria.bhk)) {
                return false;
            }
            if (criteria.budget != null) {
                const listingBudget = Number(listing?.price_numeric);
                if (Number.isFinite(listingBudget) && listingBudget > criteria.budget * 1.05) {
                    return false;
                }
            }

            return this.hasMeaningfulTokenMatch(haystack, criteria.tokens)
                || Boolean(criteria.location || criteria.bhk || criteria.budget != null);
        }).slice(0, 10);

        return {
            handled: true,
            reply: matches.length
                ? [
                    `I found ${matches.length} matching listing${matches.length === 1 ? '' : 's'} in Stream:`,
                    '',
                    ...matches.map((listing: any, index: number) => `- ${this.describeStreamListing(listing)}`),
                  ].join('\n')
                : 'I could not find any matching inventory in Stream.',
            data: {
                type: 'listing_search',
                output_format: 'bullet_list',
                items: matches.map((listing: any) => ({
                    title: this.describeStreamListing(listing),
                    snippet: this.formatCreatedAt(listing.created_at),
                })),
            },
        };
    }

    private describeStreamListing(listing: any) {
        const payload = listing?.parsed_payload && typeof listing.parsed_payload === 'object'
            ? listing.parsed_payload as Record<string, unknown>
            : {};

        const title = String(payload.displayTitle || payload.title || '').trim();
        const bits = [
            title,
            listing?.bhk,
            listing?.locality,
            listing?.city,
            listing?.price_label,
            listing?.area_sqft ? `${Math.round(Number(listing.area_sqft))} sqft` : '',
        ].filter(Boolean).map((value: unknown) => String(value).trim());

        return bits.length ? bits.join(' | ') : String(listing?.raw_text || 'Stream listing').trim();
    }

    private isDraftConfirmed(draft: Record<string, unknown>) {
        return draft.confirmed === true || draft.confirmed === 'true';
    }

    private isExplicitSaveIntent(prompt: string) {
        return /\b(save|add|store|record|log|create|post|put|submit|update crm|save this|add this)\b/i.test(prompt);
    }

    private buildRequirementConfirmationReply(intake: ParsedIntake) {
        return `I understood this as a buyer requirement:\n${this.describePendingRequirement(intake)}\n\nShould I save it and check Stream for matches? Reply Y or N.`;
    }

    private buildListingConfirmationReply(intake: ParsedIntake) {
        return `I understood this as a listing:\n${this.describePendingListing(intake)}\n\nShould I save it? Reply Y or N.`;
    }

    private describePendingRequirement(intake: ParsedIntake) {
        const bits = [
            this.extractBhk(intake.raw_text) || '',
            /\b(rent|lease)\b/i.test(intake.raw_text) ? 'for rent' : /\b(sale|buy|outright|purchase)\b/i.test(intake.raw_text) ? 'for sale' : '',
            intake.requirement?.location_pref || '',
            intake.requirement?.budget ? `budget ${intake.requirement.budget}` : '',
            intake.requirement?.timeline ? `timeline ${intake.requirement.timeline}` : '',
        ].filter(Boolean);

        return bits.length ? `• ${bits.join(' | ')}` : `• ${intake.raw_text}`;
    }

    private describePendingListing(intake: ParsedIntake) {
        const bits = [
            intake.listing?.bhk || '',
            intake.listing?.location || '',
            intake.listing?.price ? `price ${intake.listing.price}` : '',
            intake.listing?.carpet_area ? `area ${intake.listing.carpet_area}` : '',
            intake.listing?.furnishing ? intake.listing.furnishing : '',
        ].filter(Boolean);

        return bits.length ? `• ${bits.join(' | ')}` : `• ${intake.raw_text}`;
    }

    private renderRequirementMatches(matches: GroupMentionListingMatch[]) {
        return matches
            .map((match, index) => {
                const detailBits = [
                    match.location,
                    match.bhk || '',
                    match.priceLabel || '',
                    match.areaSqft ? `${Math.round(match.areaSqft)} sqft` : '',
                ].filter(Boolean);
                return `${index + 1}. ${detailBits.join(' | ')}`;
            })
            .join('\n');
    }

    private async semanticSearchListings(tenantId: string, prompt: string): Promise<WorkflowResult> {
        try {
            const { generateEmbedding, checkEmbeddingHealth } = await import('../services/embeddingService');
            const health = await checkEmbeddingHealth();
            if (!health.ok) {
                return {
                    handled: true,
                    reply: 'Semantic search is wired, but the embedding service is not reachable right now. I can still search saved CRM records by keyword.',
                    data: { type: 'semantic_search_unavailable', reason: 'embedder_unavailable', detail: health.error },
                };
            }

            const embedding = await generateEmbedding(prompt);
            if (!embedding) {
                return {
                    handled: true,
                    reply: 'Embedding generation failed. Try again or fall back to keyword search.',
                    data: { type: 'semantic_search_unavailable', reason: 'embedding_failed' },
                };
            }
            const { data, error } = await this.admin.rpc('match_listings', {
                query_embedding: embedding,
                match_threshold: 0.55,
                match_count: 10,
                p_tenant_id: tenantId,
                p_locality: null,
                p_bhk: null,
                p_type: null,
            });
            if (error) throw error;
            return {
                handled: true,
                reply: data?.length
                    ? `I found ${data.length} semantically matching listings for your request.`
                    : 'I could not find any semantically matching listings.',
                data: { type: 'semantic_search', items: data || [] },
            };
        } catch (e: any) {
            return {
                handled: true,
                reply: `Semantic search is wired, but it could not run right now: ${e.message}`,
                data: { type: 'semantic_search_failed' },
            };
        }
    }

    private async getMarketInsights(tenantId: string, prompt: string): Promise<WorkflowResult> {
        try {
            const { data, error } = await this.admin.rpc('market_stats', {
                p_locality: null,
                p_days: 30,
            });
            if (error) throw error;
            if (!data?.length) {
                return {
                    handled: true,
                    reply: 'Not enough market data available yet. The scraper needs more listings to compute meaningful stats.',
                    data: { type: 'market_insights', items: [] },
                };
            }
            const lines = (data as any[]).slice(0, 10).map((r: any) => {
                const avgPrice = Number(r.avg_price_numeric ?? r.avg_price ?? 0);
                return `${r.locality}: avg ₹${avgPrice.toLocaleString('en-IN')} (${r.listing_count} listings)`;
            });
            return {
                handled: true,
                reply: `Market insights (last 30 days):\n${lines.join('\n')}`,
                data: { type: 'market_insights', items: data },
            };
        } catch (e: any) {
            return {
                handled: true,
                reply: `Market insights unavailable: ${e.message}`,
                data: { type: 'market_insights_failed' },
            };
        }
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

    private extractBudgetNumeric(text: string): number | null {
        const match = text.match(/(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|k|thousand)\b/i);
        if (!match) return null;
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        if (Number.isNaN(amount)) return null;
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
        const criteria = this.buildSearchCriteria(prompt);
        if (!criteria.normalized) {
            return listings;
        }

        return listings.filter((listing) => {
            const haystack = JSON.stringify(listing.structured_data || {}).toLowerCase() + ' ' + String(listing.raw_text || '').toLowerCase();
            if (criteria.wantsRequirementOnly) {
                return false;
            }
            if (criteria.location && !haystack.includes(criteria.location)) {
                return false;
            }
            if (criteria.bhk && !haystack.includes(criteria.bhk)) {
                return false;
            }
            if (criteria.budget != null) {
                const listingBudget = this.extractBudgetNumeric(haystack);
                if (listingBudget != null && listingBudget > criteria.budget * 1.05) {
                    return false;
                }
            }
            return this.hasMeaningfulTokenMatch(haystack, criteria.tokens)
                || Boolean(criteria.location || criteria.bhk || criteria.budget != null);
        });
    }

    private filterLeadRecords(records: any[], prompt: string) {
        const criteria = this.buildSearchCriteria(prompt);
        if (!criteria.normalized) {
            return records;
        }

        return records.filter((record) => {
            const haystack = JSON.stringify(record || {}).toLowerCase();
            if (criteria.wantsRequirementOnly && record.record_type !== 'buyer_requirement') {
                return false;
            }
            if (criteria.wantsListingOnly && record.record_type === 'buyer_requirement') {
                return false;
            }
            if (criteria.location && !haystack.includes(criteria.location)) {
                return false;
            }
            if (criteria.bhk && !haystack.includes(criteria.bhk)) {
                return false;
            }
            if (criteria.budget != null) {
                const recordBudget = Number(record.budget);
                if (Number.isFinite(recordBudget) && recordBudget > criteria.budget * 1.05) {
                    return false;
                }
            }
            return this.hasMeaningfulTokenMatch(haystack, criteria.tokens)
                || Boolean(criteria.location || criteria.bhk || criteria.budget != null || criteria.wantsRequirementOnly || criteria.wantsListingOnly);
        });
    }

    private buildSearchCriteria(prompt: string) {
        const normalized = String(prompt || '')
            .toLowerCase()
            .replace(/[^a-z0-9+\s.]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const location = this.extractLocation(normalized).toLowerCase();
        const bhk = this.extractBhk(normalized).toLowerCase();
        const budget = this.extractBudgetNumeric(normalized);
        const wantsRequirementOnly = /\b(buyer|tenant|requirement|requirements|lead|leads)\b/i.test(normalized);
        const wantsListingOnly = /\b(listing|listings|inventory|property|properties)\b/i.test(normalized) && !wantsRequirementOnly;
        const ignored = new Set([
            'search',
            'find',
            'show',
            'pull',
            'get',
            'lookup',
            'look',
            'up',
            'my',
            'crm',
            'for',
            'in',
            'at',
            'under',
            'below',
            'less',
            'than',
            'max',
            'maximum',
            'upto',
            'up',
            'to',
            'buyer',
            'tenant',
            'requirement',
            'requirements',
            'lead',
            'leads',
            'listing',
            'listings',
            'inventory',
            'property',
            'properties',
            'records',
            'saved',
            'data',
        ]);
        const locationTokens = new Set(location.split(/\s+/).filter(Boolean));
        const bhkTokens = new Set(bhk.split(/\s+/).filter(Boolean));
        const tokens = normalized
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2)
            .filter((token) => !ignored.has(token))
            .filter((token) => !locationTokens.has(token))
            .filter((token) => !bhkTokens.has(token))
            .filter((token) => !/^\d+(?:\.\d+)?(?:k|l|lac|lakh|cr|crore)?$/.test(token));

        return {
            normalized,
            location,
            bhk,
            budget,
            wantsRequirementOnly,
            wantsListingOnly,
            tokens,
        };
    }

    private hasMeaningfulTokenMatch(haystack: string, tokens: string[]) {
        if (tokens.length === 0) {
            return false;
        }

        return tokens.every((token) => haystack.includes(token));
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

    private scoreGroupMentionListing(
        item: any,
        criteria: {
            queryText: string;
            tokens: string[];
            location: string;
            city: string;
            bhk: string;
            budget: number | null;
        },
    ): GroupMentionListingMatch | null {
        const payload = (item?.parsed_payload && typeof item.parsed_payload === 'object') ? item.parsed_payload as Record<string, any> : {};
        const locality = String(item?.locality || payload.locality || payload.microLocation || '').trim();
        const city = String(item?.city || payload.city || '').trim() || null;
        const bhk = String(item?.bhk || payload.bhk || '').trim() || null;
        const priceLabel = String(item?.price_label || payload.priceLabel || '').trim() || null;
        const priceNumeric = Number.isFinite(Number(item?.price_numeric)) ? Number(item.price_numeric) : null;
        const areaSqft = Number.isFinite(Number(item?.area_sqft)) ? Number(item.area_sqft) : null;
        const propertyCategory = String(item?.property_category || payload.propertyCategory || '').trim() || null;
        const rawText = String(item?.raw_text || '').trim();
        const brokerName = String(payload.contactName || payload.sourceLabel || '').trim() || null;
        const brokerPhone = String(payload.contactPhone || item?.source_phone || '').trim() || null;
        const sourcePhone = String(item?.source_phone || '').trim() || null;
        const title = String(payload.displayTitle || [bhk, locality, priceLabel].filter(Boolean).join(' | ') || rawText || 'Listing').trim();
        const haystack = [
            title,
            locality,
            city || '',
            bhk || '',
            priceLabel || '',
            rawText,
            JSON.stringify(payload || {}),
        ].join(' ').toLowerCase();

        if (criteria.location && !haystack.includes(criteria.location)) {
            return null;
        }

        if (criteria.city && !haystack.includes(criteria.city)) {
            return null;
        }

        if (criteria.bhk && !haystack.includes(criteria.bhk)) {
            return null;
        }

        let score = Number(item?.confidence_score || 0) / 20;

        if (criteria.location && haystack.includes(criteria.location)) {
            score += 5;
        }

        if (criteria.city && haystack.includes(criteria.city)) {
            score += 3;
        }

        if (criteria.bhk && haystack.includes(criteria.bhk)) {
            score += 4;
        }

        if (criteria.budget != null && priceNumeric != null) {
            if (priceNumeric <= criteria.budget * 1.05) {
                score += 4;
            } else if (priceNumeric <= criteria.budget * 1.2) {
                score += 2;
            } else if (priceNumeric > criteria.budget * 1.4) {
                score -= 4;
            } else {
                score -= 1;
            }
        }

        const tokenHits = criteria.tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);
        score += tokenHits;

        if (criteria.tokens.length > 0 && tokenHits === 0) {
            return null;
        }

        if (score <= 0) {
            return null;
        }

        return {
            id: String(item?.id || ''),
            title,
            location: locality || 'Location not parsed yet',
            city,
            bhk,
            priceLabel,
            priceNumeric,
            areaSqft,
            propertyCategory,
            brokerName,
            brokerPhone,
            sourcePhone,
            rawText,
            createdAt: String(item?.created_at || new Date().toISOString()),
            score,
        };
    }
}

export const brokerWorkflowService = new BrokerWorkflowService();
