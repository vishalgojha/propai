import { z } from 'zod'

export const LeadStorageInputSchema = z.object({
	confirmation_token: z.string().min(1),
	dataset_mode: z.enum(['broker_group', 'buyer_inquiry', 'mixed']).optional(),
	source: z.string().optional(),
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
})

export const LeadStorageOutputSchema = z.object({
	status: z.enum(['success', 'failure']),
	stored_count: z.number().int().nonnegative(),
	skipped_count: z.number().int().nonnegative(),
	lead_ids: z.array(z.string().min(1)).optional(),
	error_message: z.string().optional(),
})

export type LeadStorageOutput = z.infer<typeof LeadStorageOutputSchema>

export class LeadStorageSkillError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'LeadStorageSkillError'
	}
}

export function prepareLeadStoragePayload(input: z.infer<typeof LeadStorageInputSchema>) {
	const parsedInput = LeadStorageInputSchema.safeParse(input)
	if (!parsedInput.success) {
		throw new LeadStorageSkillError(parsedInput.error.message)
	}

	return LeadStorageInputSchema.parse(parsedInput.data)
}
