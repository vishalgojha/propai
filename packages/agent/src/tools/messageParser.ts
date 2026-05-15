import { z } from 'zod'

export const MessageParserTools = {
	parse_messages: {
		description: 'Use this when a broker sends a raw WhatsApp export, chat dump, copied group history, or JSON message payload. It turns messy text into clean timestamp, sender, content records even when the export includes forward headers, system lines, or broken formatting.',
		schema: z.object({
			raw_input: z.string().describe('Raw WhatsApp export text or JSON string'),
			format: z.enum(['auto', 'text', 'json']).optional().default('auto'),
			strict: z.boolean().optional().default(true),
		}),
	},
}
