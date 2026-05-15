import { z } from 'zod'

export const SummaryGeneratorInputSchema = z.object({
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
})

export const SummaryGeneratorOutputSchema = z.object({
	dataset_mode: z.enum(['broker_group', 'buyer_inquiry', 'mixed']),
	date_range: z
		.object({
			from: z.string().optional(),
			to: z.string().optional(),
		})
		.optional(),
	new_leads_count: z.number().int().nonnegative(),
	trends: z.array(z.string().min(1)),
	record_type_breakdown: z.object({
		inventory_listing: z.number().int().nonnegative(),
		buyer_requirement: z.number().int().nonnegative(),
	}),
	priority_breakdown: z.object({
		P1: z.number().int().nonnegative(),
		P2: z.number().int().nonnegative(),
		P3: z.number().int().nonnegative(),
	}),
	urgency_breakdown: z.object({
		high: z.number().int().nonnegative(),
		medium: z.number().int().nonnegative(),
		low: z.number().int().nonnegative(),
		unknown: z.number().int().nonnegative(),
	}),
	top_localities: z.array(
		z.object({
			city: z.string().min(1),
			locality_canonical: z.string().min(1),
			count: z.number().int().nonnegative(),
			share: z.number().min(0).max(1),
		}),
	),
})

export type SummaryGeneratorOutput = z.infer<typeof SummaryGeneratorOutputSchema>

export interface SummaryGeneratorInputLead {
	lead_id: string
	record_type: 'inventory_listing' | 'buyer_requirement'
	priority_bucket?: 'P1' | 'P2' | 'P3'
	urgency?: 'high' | 'medium' | 'low'
	city?: string
	locality_canonical?: string
	micro_market?: string
	created_at?: string
	source?: string
	dataset_mode?: 'broker_group' | 'buyer_inquiry' | 'mixed'
}

export class SummaryGeneratorError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'SummaryGeneratorError'
	}
}

export function generateLeadSummary(input: {
	leads: SummaryGeneratorInputLead[]
	dataset_mode?: 'broker_group' | 'buyer_inquiry' | 'mixed'
	date_range?: { from?: string; to?: string }
}) {
	const parsedInput = SummaryGeneratorInputSchema.safeParse(input)
	if (!parsedInput.success) {
		throw new SummaryGeneratorError(parsedInput.error.message)
	}

	const leads = parsedInput.data.leads
	const datasetMode = parsedInput.data.dataset_mode || inferDatasetMode(leads)
	const recordTypeBreakdown = { inventory_listing: 0, buyer_requirement: 0 }
	const priorityBreakdown = { P1: 0, P2: 0, P3: 0 }
	const urgencyBreakdown = { high: 0, medium: 0, low: 0, unknown: 0 }
	const localityCounts = new Map<string, { city: string; locality_canonical: string; count: number }>()

	for (const lead of leads) {
		recordTypeBreakdown[lead.record_type] += 1

		if (lead.priority_bucket) {
			priorityBreakdown[lead.priority_bucket] += 1
		}

		if (lead.urgency && lead.urgency in urgencyBreakdown) {
			urgencyBreakdown[lead.urgency] += 1
		} else {
			urgencyBreakdown.unknown += 1
		}

		const city = lead.city?.trim()
		const locality = lead.locality_canonical?.trim()
		if (city && locality) {
			const key = `${city}|${locality}`
			const existing = localityCounts.get(key)
			if (existing) {
				existing.count += 1
			} else {
				localityCounts.set(key, { city, locality_canonical: locality, count: 1 })
			}
		}
	}

	const topLocalities = Array.from(localityCounts.values())
		.sort((left, right) => right.count - left.count || left.city.localeCompare(right.city) || left.locality_canonical.localeCompare(right.locality_canonical))
		.slice(0, 10)
		.map((item) => ({
			...item,
			share: leads.length === 0 ? 0 : roundToFour(item.count / leads.length),
		}))

	const trends = buildTrends(leads, recordTypeBreakdown, priorityBreakdown, topLocalities)

	return SummaryGeneratorOutputSchema.parse({
		dataset_mode: datasetMode,
		date_range: parsedInput.data.date_range,
		new_leads_count: leads.length,
		trends,
		record_type_breakdown: recordTypeBreakdown,
		priority_breakdown: priorityBreakdown,
		urgency_breakdown: urgencyBreakdown,
		top_localities: topLocalities,
	})
}

function inferDatasetMode(leads: SummaryGeneratorInputLead[]): 'broker_group' | 'buyer_inquiry' | 'mixed' {
	const hasBuyerRequirement = leads.some((lead) => lead.record_type === 'buyer_requirement')
	const hasInventoryListing = leads.some((lead) => lead.record_type === 'inventory_listing')

	if (hasBuyerRequirement && hasInventoryListing) {
		return 'mixed'
	}
	if (hasBuyerRequirement) {
		return 'buyer_inquiry'
	}
	return 'broker_group'
}

function buildTrends(
	leads: SummaryGeneratorInputLead[],
	recordTypeBreakdown: { inventory_listing: number; buyer_requirement: number },
	priorityBreakdown: { P1: number; P2: number; P3: number },
	topLocalities: Array<{ city: string; locality_canonical: string; count: number; share: number }>,
) {
	const trends: string[] = []

	if (leads.length === 0) {
		trends.push('No leads found in the requested range.')
		return trends
	}

	if (recordTypeBreakdown.buyer_requirement > recordTypeBreakdown.inventory_listing) {
		trends.push('Buyer requirements outnumber inventory listings.')
	} else if (recordTypeBreakdown.inventory_listing > recordTypeBreakdown.buyer_requirement) {
		trends.push('Inventory listings outnumber buyer requirements.')
	} else {
		trends.push('Buyer requirements and inventory listings are balanced.')
	}

	if (priorityBreakdown.P1 > 0) {
		trends.push(`${priorityBreakdown.P1} lead(s) are in the P1 callback queue.`)
	}
	if (priorityBreakdown.P2 > priorityBreakdown.P3) {
		trends.push('The queue is skewed toward actionable mid-priority follow-ups.')
	}

	if (topLocalities.length > 0) {
		const top = topLocalities[0]
		trends.push(`Top locality: ${top.locality_canonical} (${top.city}) with ${top.count} lead(s).`)
	}

	return trends
}

function roundToFour(value: number) {
	return Math.round(value * 10000) / 10000
}
