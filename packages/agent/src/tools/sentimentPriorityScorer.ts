import { z } from 'zod'

export const SentimentPriorityScorerTools = {
	score_priority: {
		description: 'Use this after leads have been extracted and location hints normalized when the broker wants to rank urgency. It should fire for messages that sound hot, ready, follow-up worthy, or time-sensitive so the model can bucket them into P1, P2, or P3 in plain broker terms.',
		schema: z.object({
			leads: z.array(
				z.object({
					lead_id: z.string().min(1),
					record_type: z.enum(['inventory_listing', 'buyer_requirement']),
					urgency: z.enum(['high', 'medium', 'low']).optional(),
					raw_text: z.string().optional(),
					source: z.string().optional(),
					created_at: z.string().datetime().optional(),
					city: z.string().optional(),
					locality_canonical: z.string().optional(),
					micro_market: z.string().optional(),
					matched_alias: z.string().optional(),
					confidence: z.number().min(0).max(1).optional(),
					unresolved_flag: z.boolean().optional(),
					resolution_method: z.enum(['exact_alias', 'normalized_alias', 'fuzzy_alias', 'unresolved']).optional(),
				}),
			),
		}),
	},
}
