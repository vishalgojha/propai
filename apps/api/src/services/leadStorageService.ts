import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const LeadStorageInputSchema = z.object({
    confirmation_token: z.string().min(1),
    leads: z.array(
        z.object({
            lead_id: z.string().min(1),
            phone: z.string().min(1),
            name: z.string().min(1),
            record_type: z.enum(['inventory_listing', 'buyer_requirement']),
            dataset_mode: z.enum(['broker_group', 'buyer_inquiry', 'mixed']).optional(),
            deal_type: z.enum(['sale', 'rent', 'lease', 'outright', 'unknown']).optional(),
            asset_class: z.enum(['residential', 'commercial', 'mixed', 'pg', 'unknown']).optional(),
            price_basis: z.enum(['total', 'per_sqft', 'monthly_rent', 'deposit', 'unknown']).optional(),
            area_sqft: z.number().optional(),
            area_basis: z.enum(['carpet', 'rera_carpet', 'builtup', 'unknown']).optional(),
            budget: z.number().optional(),
            location_hint: z.string().optional(),
            city: z.string().optional(),
            city_canonical: z.string().optional(),
            locality_canonical: z.string().optional(),
            micro_market: z.string().optional(),
            matched_alias: z.string().optional(),
            confidence: z.number().min(0).max(1).optional(),
            unresolved_flag: z.boolean().optional(),
            resolution_method: z.enum(['exact_alias', 'normalized_alias', 'fuzzy_alias', 'unresolved']).optional(),
            urgency: z.enum(['high', 'medium', 'low']).optional(),
            priority_bucket: z.enum(['P1', 'P2', 'P3']).optional(),
            priority_score: z.number().min(0).max(100).optional(),
            sentiment_score: z.number().min(-1).max(1).optional(),
            intent_score: z.number().min(0).max(1).optional(),
            recency_score: z.number().min(0).max(1).optional(),
            sentiment_risk: z.number().min(0).max(1).optional(),
            raw_text: z.string().optional(),
            source: z.string().optional(),
            created_at: z.string().datetime().optional(),
        }),
    ).min(1),
    dataset_mode: z.enum(['broker_group', 'buyer_inquiry', 'mixed']).optional(),
    source: z.string().optional(),
});

type LeadStorageInput = z.infer<typeof LeadStorageInputSchema>;

export class LeadStorageServiceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LeadStorageServiceError';
    }
}

export class LeadStorageService {
    private readonly supabaseUrl = process.env.SUPABASE_URL || 'https://wnrwntumacbirbndfvwg.supabase.co';
    private readonly supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InducndudHVtYWNiaXJibmRmdndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTgwNjcsImV4cCI6MjA4OTgzNDA2N30.ub1zIhw1535oPMY9io07BPTgTfWiNdivAkfTerjeoYQ';

    private createRequestClient(accessToken: string): SupabaseClient {
        return createClient(this.supabaseUrl, this.supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });
    }

    async storeLeads(accessToken: string, tenantId: string, payload: unknown) {
        const parsedInput = LeadStorageInputSchema.safeParse(payload);
        if (!parsedInput.success) {
            return {
                status: 'failure' as const,
                stored_count: 0,
                skipped_count: 0,
                error_message: parsedInput.error.message,
            };
        }

        const confirmationToken = parsedInput.data.confirmation_token.trim();
        const expectedToken = process.env.SUPERVISOR_CONFIRMATION_TOKEN || process.env.LEAD_STORAGE_CONFIRMATION_TOKEN;
        if (!expectedToken) {
            return {
                status: 'failure' as const,
                stored_count: 0,
                skipped_count: 0,
                error_message: 'Lead storage confirmation token is not configured',
            };
        }

        if (confirmationToken !== expectedToken) {
            return {
                status: 'failure' as const,
                stored_count: 0,
                skipped_count: 0,
                error_message: 'Invalid confirmation token',
            };
        }

        const client = this.createRequestClient(accessToken);
        const rows = parsedInput.data.leads.map((lead: LeadStorageInput['leads'][number]) =>
            this.buildRow(tenantId, lead, parsedInput.data.dataset_mode, parsedInput.data.source),
        );

        const { error } = await client
            .from('lead_records')
            .upsert(rows, { onConflict: 'tenant_id,lead_id' });

        if (error) {
            return {
                status: 'failure' as const,
                stored_count: 0,
                skipped_count: 0,
                error_message: error.message,
            };
        }

        return {
            status: 'success' as const,
            stored_count: rows.length,
            skipped_count: 0,
            lead_ids: rows.map((row: ReturnType<LeadStorageService['buildRow']>) => row.lead_id),
        };
    }

    private buildRow(tenantId: string, lead: LeadStorageInput['leads'][number], datasetMode?: LeadStorageInput['dataset_mode'], source?: string) {
        return {
            tenant_id: tenantId,
            lead_id: lead.lead_id,
            phone: lead.phone,
            name: lead.name,
            record_type: lead.record_type,
            dataset_mode: lead.dataset_mode || datasetMode || null,
            deal_type: lead.deal_type || null,
            asset_class: lead.asset_class || null,
            price_basis: lead.price_basis || null,
            area_sqft: lead.area_sqft ?? null,
            area_basis: lead.area_basis || null,
            budget: lead.budget ?? null,
            location_hint: lead.location_hint || null,
            city: lead.city || null,
            city_canonical: lead.city_canonical || lead.city || null,
            locality_canonical: lead.locality_canonical || null,
            micro_market: lead.micro_market || null,
            matched_alias: lead.matched_alias || null,
            confidence: lead.confidence ?? null,
            unresolved_flag: lead.unresolved_flag ?? false,
            resolution_method: lead.resolution_method || null,
            urgency: lead.urgency || null,
            priority_bucket: lead.priority_bucket || null,
            priority_score: lead.priority_score ?? null,
            sentiment_score: lead.sentiment_score ?? null,
            intent_score: lead.intent_score ?? null,
            recency_score: lead.recency_score ?? null,
            sentiment_risk: lead.sentiment_risk ?? null,
            raw_text: lead.raw_text || null,
            source: lead.source || source || null,
            created_at: lead.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            payload: {
                ...lead,
                dataset_mode: lead.dataset_mode || datasetMode || null,
                source: lead.source || source || null,
            },
        };
    }
}

export const leadStorageService = new LeadStorageService();
