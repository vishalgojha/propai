import { z } from 'zod'

export const SummaryGeneratorTools = {
	summarize_leads: {
		description: 'Use this when the broker asks for today\'s queue, a daily update, a range summary, or a scan of what came in. It should turn ranked leads into a readable workload summary with locality, priority, and urgency patterns.',
		schema: z.object({
			leads: z.array(
				z.object({
					lead_id: z.string().min(1),
					record_type: z.enum(['inventory_listing', 'buyer_requirement']),
					priority_bucket: z.enum(['P1', 'P2', 'P3']).optional(),
					urgency: z.enum(['high', 'medium', 'low']).optional(),
					city: z.string().optional(),
					locality_canonical: z.string().optional(),
					micro_market: z.string().optional(),
					created_at: z.string().datetime().optional(),
					source: z.string().optional(),
					dataset_mode: z.enum(['broker_group', 'buyer_inquiry', 'mixed']).optional(),
				}),
			),
			dataset_mode: z.enum(['broker_group', 'buyer_inquiry', 'mixed']).optional(),
			date_range: z
				.object({
					from: z.string().optional(),
					to: z.string().optional(),
				})
				.optional(),
		}),
	},
}
