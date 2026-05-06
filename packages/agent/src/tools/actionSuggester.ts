import { z } from 'zod'

export const ActionSuggesterTools = {
	suggest_actions: {
		description: 'Use this after scoring when the broker wants practical next steps for hot leads, follow-ups, site visits, calls, or written nudges. It should be chosen for operational messages like who to call first, which lead needs a visit, or what action to take next.',
		schema: z.object({
			scored_leads: z.array(
				z.object({
					lead_id: z.string().min(1),
					record_type: z.enum(['inventory_listing', 'buyer_requirement']),
					priority_bucket: z.enum(['P1', 'P2', 'P3']).optional(),
					urgency: z.enum(['high', 'medium', 'low']).optional(),
					city: z.string().optional(),
					locality_canonical: z.string().optional(),
					micro_market: z.string().optional(),
					evidence: z.array(z.string().min(1)).optional(),
				}),
			),
			summary: z
				.object({
					new_leads_count: z.number().int().nonnegative().optional(),
					priority_breakdown: z
						.object({
							P1: z.number().int().nonnegative(),
							P2: z.number().int().nonnegative(),
							P3: z.number().int().nonnegative(),
						})
						.optional(),
					trends: z.array(z.string().min(1)).optional(),
				})
				.optional(),
		}),
	},
}
