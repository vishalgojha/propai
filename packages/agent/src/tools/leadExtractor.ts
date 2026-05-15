import { z } from 'zod'

export const LeadExtractorTools = {
	extract_leads: {
		description: 'Use this when a broker sends parsed chat messages that may contain listings, buyer requirements, or mixed WhatsApp chatter. It should fire for informal broker language, Hinglish, abbreviations, and partial property details when the goal is to turn messages into structured leads.',
		schema: z.object({
			parsed_messages: z.array(
				z.object({
					timestamp: z.string(),
					sender: z.string(),
					content: z.string(),
				}),
			),
			dataset_mode: z.enum(['broker_group', 'buyer_inquiry', 'mixed']).optional().default('broker_group'),
			source: z.string().optional(),
		}),
	},
}
