import { z } from 'zod'

const UrgencySchema = z.enum(['high', 'medium', 'low'])

export const SentimentPriorityScorerInputSchema = z.object({
	leads: z.array(
		z.object({
			lead_id: z.string().min(1),
			record_type: z.enum(['inventory_listing', 'buyer_requirement']),
			urgency: UrgencySchema.optional(),
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
})

export const SentimentPriorityScorerOutputSchema = z.object({
	scored_leads: z.array(
		z.object({
			lead_id: z.string().min(1),
			record_type: z.enum(['inventory_listing', 'buyer_requirement']),
			urgency_score: z.number().min(0).max(1),
			sentiment_score: z.number().min(-1).max(1),
			intent_score: z.number().min(0).max(1),
			recency_score: z.number().min(0).max(1),
			sentiment_risk: z.number().min(0).max(1),
			priority_score: z.number().min(0).max(100),
			priority_bucket: z.enum(['P1', 'P2', 'P3']),
			rank: z.number().int().positive(),
			evidence: z.array(z.string().min(1)),
		}),
	),
})

export type ScoredLead = z.infer<typeof SentimentPriorityScorerOutputSchema>['scored_leads'][number]

export interface SentimentPriorityInputLead {
	lead_id: string
	record_type: 'inventory_listing' | 'buyer_requirement'
	urgency?: 'high' | 'medium' | 'low'
	raw_text?: string
	source?: string
	created_at?: string
	city?: string
	locality_canonical?: string
	micro_market?: string
	matched_alias?: string
	confidence?: number
	unresolved_flag?: boolean
	resolution_method?: 'exact_alias' | 'normalized_alias' | 'fuzzy_alias' | 'unresolved'
}

export class SentimentPriorityScorerError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'SentimentPriorityScorerError'
	}
}

const HIGH_INTENT_CUES = [
	'interested',
	'ready',
	'confirm',
	'confirmed',
	'asap',
	'immediately',
	'today',
	'call now',
	'site visit',
	'visit today',
	'inspection any time',
	'keys at office',
	'one day notice',
	'possession',
	'close to final',
]

const MEDIUM_INTENT_CUES = [
	'need',
	'looking',
	'looking for',
	'requirement',
	'required',
	'budget',
	'whatsapp',
	'send details',
	'send brochure',
	'follow up',
	'available',
]

const POSITIVE_SENTIMENT_CUES = [
	'interested',
	'ready',
	'confirmed',
	'ok',
	'yes',
	'good',
	'thanks',
	'thank you',
	'appreciate',
	'available',
]

const NEGATIVE_SENTIMENT_CUES = [
	'not interested',
	'no budget',
	'expensive',
	'too high',
	'cancelled',
	'cancel',
	'delay',
	'later',
	'issue',
	'problem',
	'complaint',
	'bad',
	'wrong',
	'no',
]

const HIGH_URGENCY_CUES = [
	'asap',
	'immediately',
	'urgent',
	'call now',
	'today',
	'now',
	'site visit',
	'inspection any time',
	'keys at office',
	'one day notice',
]

const MEDIUM_URGENCY_CUES = [
	'tomorrow',
	'soon',
	'this week',
	'follow up',
	'interested',
	'available',
]

export function scoreSentimentPriority(input: { leads: SentimentPriorityInputLead[] }) {
	const parsedInput = SentimentPriorityScorerInputSchema.safeParse(input)
	if (!parsedInput.success) {
		throw new SentimentPriorityScorerError(parsedInput.error.message)
	}

	const scored = parsedInput.data.leads.map((lead) => scoreLeadPriority(lead))
	scored.sort((left, right) => {
		if (right.priority_score !== left.priority_score) {
			return right.priority_score - left.priority_score
		}
		return left.lead_id.localeCompare(right.lead_id)
	})

	const ranked = scored.map((lead, index) => ({ ...lead, rank: index + 1 }))
	return SentimentPriorityScorerOutputSchema.parse({ scored_leads: ranked })
}

function scoreLeadPriority(lead: SentimentPriorityInputLead): ScoredLead {
	const text = normalizeText(lead.raw_text || '')
	const sentimentScore = clamp(roundToTwo(computeSentimentScore(text)), -1, 1)
	const intentScore = clamp(roundToTwo(computeIntentScore(text, lead.record_type)), 0, 1)
	const urgencyScore = clamp(roundToTwo(resolveUrgencyScore(lead.urgency, text)), 0, 1)
	const recencyScore = clamp(roundToTwo(computeRecencyScore(lead.created_at)), 0, 1)
	const sentimentRisk = clamp(roundToTwo(Math.max(0, -sentimentScore)), 0, 1)
	const priorityScore = clamp(
		roundToTwo(100 * (0.4 * urgencyScore + 0.3 * intentScore + 0.2 * recencyScore + 0.1 * sentimentRisk)),
		0,
		100,
	)

	return {
		lead_id: lead.lead_id,
		record_type: lead.record_type,
		urgency_score: urgencyScore,
		sentiment_score: sentimentScore,
		intent_score: intentScore,
		recency_score: recencyScore,
		sentiment_risk: sentimentRisk,
		priority_score: priorityScore,
		priority_bucket: priorityBucket(priorityScore),
		rank: 1,
		evidence: buildEvidence(lead, text, sentimentScore, intentScore, urgencyScore, recencyScore, priorityScore),
	}
}

function buildEvidence(
	lead: SentimentPriorityInputLead,
	text: string,
	sentimentScore: number,
	intentScore: number,
	urgencyScore: number,
	recencyScore: number,
	priorityScore: number,
) {
	const evidence: string[] = [
		`record type: ${lead.record_type}`,
		`priority score: ${priorityScore.toFixed(2)}`,
		`urgency score: ${urgencyScore.toFixed(2)}`,
		`intent score: ${intentScore.toFixed(2)}`,
		`recency score: ${recencyScore.toFixed(2)}`,
		`sentiment score: ${sentimentScore.toFixed(2)}`,
	]

	if (!text) {
		evidence.push('raw text missing; sentiment and intent defaulted conservatively')
		return evidence
	}

	const matchedPositive = POSITIVE_SENTIMENT_CUES.filter((cue) => text.includes(cue))
	const matchedNegative = NEGATIVE_SENTIMENT_CUES.filter((cue) => text.includes(cue))
	const matchedHighIntent = HIGH_INTENT_CUES.filter((cue) => text.includes(cue))
	const matchedMediumIntent = MEDIUM_INTENT_CUES.filter((cue) => text.includes(cue))
	const matchedHighUrgency = HIGH_URGENCY_CUES.filter((cue) => text.includes(cue))
	const matchedMediumUrgency = MEDIUM_URGENCY_CUES.filter((cue) => text.includes(cue))

	if (lead.record_type === 'buyer_requirement') {
		evidence.push('buyer_requirement lift applied')
	} else if (matchedHighIntent.length === 0) {
		evidence.push('inventory_listing with no high-action cue lift')
	}

	if (matchedHighIntent.length > 0) {
		evidence.push(`high-intent cues: ${matchedHighIntent.join(', ')}`)
	}
	if (matchedMediumIntent.length > 0) {
		evidence.push(`intent cues: ${matchedMediumIntent.join(', ')}`)
	}
	if (matchedHighUrgency.length > 0) {
		evidence.push(`high-urgency cues: ${matchedHighUrgency.join(', ')}`)
	}
	if (matchedMediumUrgency.length > 0) {
		evidence.push(`urgency cues: ${matchedMediumUrgency.join(', ')}`)
	}
	if (matchedPositive.length > 0) {
		evidence.push(`positive sentiment cues: ${matchedPositive.join(', ')}`)
	}
	if (matchedNegative.length > 0) {
		evidence.push(`negative sentiment cues: ${matchedNegative.join(', ')}`)
	}

	if (!lead.created_at) {
		evidence.push('created_at missing; recency defaulted conservatively')
	}
	if (!lead.urgency) {
		evidence.push('urgency missing; inferred from text')
	}

	return evidence
}

function computeSentimentScore(text: string) {
	if (!text) return 0

	let score = 0
	for (const cue of POSITIVE_SENTIMENT_CUES) {
		if (text.includes(cue)) score += 0.18
	}
	for (const cue of NEGATIVE_SENTIMENT_CUES) {
		if (text.includes(cue)) score -= 0.18
	}

	return score
}

function computeIntentScore(text: string, recordType: SentimentPriorityInputLead['record_type']) {
	let score = 0

	for (const cue of HIGH_INTENT_CUES) {
		if (text.includes(cue)) score += 0.2
	}

	for (const cue of MEDIUM_INTENT_CUES) {
		if (text.includes(cue)) score += 0.08
	}

	if (recordType === 'buyer_requirement') {
		score += 0.1
	}

	return score
}

function resolveUrgencyScore(urgency: SentimentPriorityInputLead['urgency'] | undefined, text: string) {
	if (urgency === 'high') return 1
	if (urgency === 'medium') return 0.6
	if (urgency === 'low') return 0.3

	for (const cue of HIGH_URGENCY_CUES) {
		if (text.includes(cue)) {
			return 1
		}
	}

	for (const cue of MEDIUM_URGENCY_CUES) {
		if (text.includes(cue)) {
			return 0.6
		}
	}

	return 0.3
}

function computeRecencyScore(createdAt?: string) {
	if (!createdAt) {
		return 0.5
	}

	const timestamp = Date.parse(createdAt)
	if (Number.isNaN(timestamp)) {
		return 0.5
	}

	const ageHours = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60))
	const ageDays = ageHours / 24
	return Math.max(0.1, 1 - ageDays / 14)
}

function priorityBucket(priorityScore: number): ScoredLead['priority_bucket'] {
	if (priorityScore >= 75) return 'P1'
	if (priorityScore >= 50) return 'P2'
	return 'P3'
}

function normalizeText(value: string) {
	return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function roundToTwo(value: number) {
	return Math.round(value * 100) / 100
}
