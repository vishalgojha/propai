import { z } from 'zod'

export const IndiaLocationNormalizerTools = {
	normalize_locations: {
		description: 'Use this when a lead contains a locality hint, neighborhood shorthand, or a Mumbai/Pune area written in broker slang. It resolves aliases like BW, BKC, Andheri W, Hinjewadi P1, or other messy location mentions into canonical localities and micro-markets.',
		schema: z.object({
			leads: z.array(
				z.object({
					lead_id: z.string().min(1),
					location_hint: z.string().min(1),
					raw_text: z.string().optional(),
					source: z.string().optional(),
				}),
			),
		}),
	},
}
