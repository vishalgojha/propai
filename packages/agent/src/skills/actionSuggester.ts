import { z } from 'zod'

export const ActionSuggesterInputSchema = z.object({
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
})

export const ActionSuggesterOutputSchema = z.object({
	actions: z.array(
		z.object({
			lead_id: z.string().min(1),
			action_type: z.enum(['call', 'email', 'visit']),
			description: z.string().min(1),
			rationale: z.string().min(1),
			priority_rank: z.number().int().positive(),
		}),
	),
	diagnostics: z.array(z.string().min(1)),
})

export type SuggestedAction = z.infer<typeof ActionSuggesterOutputSchema>['actions'][number]

export interface ActionSuggesterInputLead {
	lead_id: string
	record_type: 'inventory_listing' | 'buyer_requirement'
	priority_bucket?: 'P1' | 'P2' | 'P3'
	urgency?: 'high' | 'medium' | 'low'
	city?: string
	locality_canonical?: string
	micro_market?: string
	evidence?: string[]
}

export class ActionSuggesterError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ActionSuggesterError'
	}
}

const HIGH_ACTION_CUES = [
	'site visit',
	'visit today',
	'inspection any time',
	'keys at office',
	'one day notice',
	'confirmed',
	'asap',
	'immediately',
]

const CALL_CUES = ['call', 'call now', 'phone', 'discuss', 'confirm']
const EMAIL_CUES = ['send details', 'brochure', 'email', 'whatsapp', 'share']

export function suggestFollowUpActions(input: {
	scored_leads: ActionSuggesterInputLead[]
	summary?: {
		new_leads_count?: number
		priority_breakdown?: { P1: number; P2: number; P3: number }
		trends?: string[]
	}
}) {
	const parsedInput = ActionSuggesterInputSchema.safeParse(input)
	if (!parsedInput.success) {
		throw new ActionSuggesterError(parsedInput.error.message)
	}

	const sorted = parsedInput.data.scored_leads
		.map((lead) => ({ lead, sortKey: buildSortKey(lead) }))
		.sort((left, right) => right.sortKey - left.sortKey)

	const actions = sorted.flatMap(({ lead }, index) => buildActionsForLead(lead, index + 1))

	const diagnostics = buildDiagnostics(parsedInput.data.summary, actions.length)

	return ActionSuggesterOutputSchema.parse({ actions, diagnostics })
}

function buildSortKey(lead: ActionSuggesterInputLead) {
	const bucketScore = lead.priority_bucket === 'P1' ? 300 : lead.priority_bucket === 'P2' ? 200 : 100
	const urgencyScore = lead.urgency === 'high' ? 30 : lead.urgency === 'medium' ? 20 : 10
	const recordTypeScore = lead.record_type === 'buyer_requirement' ? 15 : 0
	const evidenceScore = hasEvidenceCue(lead.evidence, HIGH_ACTION_CUES) ? 10 : 0
	return bucketScore + urgencyScore + recordTypeScore + evidenceScore
}

function buildActionsForLead(lead: ActionSuggesterInputLead, rank: number): SuggestedAction[] {
	const evidence = lead.evidence || []
	const highAction = hasEvidenceCue(evidence, HIGH_ACTION_CUES)
	const callCue = hasEvidenceCue(evidence, CALL_CUES)
	const emailCue = hasEvidenceCue(evidence, EMAIL_CUES)

	if (lead.priority_bucket === 'P1' || lead.urgency === 'high') {
		if (highAction) {
			return [
				buildAction(lead, 'visit', rank, 'High-intent lead. Draft a site visit or inspection follow-up.', 'High-action cues indicate immediate on-site follow-up is appropriate.'),
				buildAction(lead, 'call', rank, 'Call the lead to confirm timing, budget, and next steps.', 'P1 leads should be contacted directly before any softer follow-up.'),
			]
		}

		return [
			buildAction(lead, 'call', rank, 'Call the lead to confirm interest, timing, and requirements.', 'P1 or high-urgency lead should be called first.'),
		]
	}

	if (lead.record_type === 'buyer_requirement') {
		if (callCue || lead.priority_bucket === 'P2') {
			return [
				buildAction(lead, 'call', rank, 'Call the buyer to qualify budget, location, and timeline.', 'Buyer requirements benefit from a direct qualification call.'),
			]
		}

		return [
			buildAction(lead, 'email', rank, 'Send a concise follow-up with matching options and a reply prompt.', 'No stronger action cue available; use a lighter touch first.'),
		]
	}

	if (emailCue || lead.priority_bucket === 'P3') {
		return [
			buildAction(lead, 'email', rank, 'Send a listing recap or availability note.', 'Lower-priority inventory is best handled with a non-blocking written follow-up.'),
		]
	}

	return [
		buildAction(lead, 'call', rank, 'Call to verify listing details and availability.', 'No strong written follow-up cue found; confirm by phone.'),
	]
}

function buildAction(
	lead: ActionSuggesterInputLead,
	actionType: SuggestedAction['action_type'],
	priorityRank: number,
	description: string,
	rationale: string,
): SuggestedAction {
	return {
		lead_id: lead.lead_id,
		action_type: actionType,
		description,
		rationale,
		priority_rank: priorityRank,
	}
}

function buildDiagnostics(
	summary: { new_leads_count?: number; priority_breakdown?: { P1: number; P2: number; P3: number }; trends?: string[] } | undefined,
	actionCount: number,
) {
	const diagnostics: string[] = []

	if (summary?.new_leads_count !== undefined) {
		diagnostics.push(`summary covers ${summary.new_leads_count} lead(s)`)
	}
	if (summary?.priority_breakdown) {
		diagnostics.push(
			`priority split P1=${summary.priority_breakdown.P1}, P2=${summary.priority_breakdown.P2}, P3=${summary.priority_breakdown.P3}`,
		)
	}
	if (summary?.trends?.length) {
		diagnostics.push(...summary.trends.slice(0, 3))
	}
	if (actionCount === 0) {
		diagnostics.push('no follow-up actions generated because evidence was insufficient')
	} else {
		diagnostics.push(`generated ${actionCount} non-binding action suggestion(s)`)
	}

	return diagnostics
}

function hasEvidenceCue(evidence: string[] | undefined, cues: string[]) {
	if (!evidence?.length) return false
	const lowered = evidence.map((item) => item.toLowerCase())
	return cues.some((cue) => lowered.some((item) => item.includes(cue)))
}
