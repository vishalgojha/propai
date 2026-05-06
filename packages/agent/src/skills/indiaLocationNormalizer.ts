import { z } from 'zod'

export const IndiaLocationNormalizerInputSchema = z.object({
	leads: z.array(
		z.object({
			lead_id: z.string().min(1),
			location_hint: z.string().min(1),
			raw_text: z.string().optional(),
			source: z.string().optional(),
		}),
	),
})

export const IndiaLocationNormalizerOutputSchema = z.object({
	normalized_locations: z.array(
		z.object({
			lead_id: z.string().min(1),
			city: z.enum(['Mumbai', 'Pune', 'Unknown']),
			locality_canonical: z.string().min(1),
			micro_market: z.string().min(1),
			matched_alias: z.string().min(1),
			confidence: z.number().min(0).max(1),
			unresolved_flag: z.boolean(),
			resolution_method: z.enum(['exact_alias', 'normalized_alias', 'fuzzy_alias', 'unresolved']),
		}),
	),
})

export type NormalizedLocation = z.infer<
	typeof IndiaLocationNormalizerOutputSchema
>['normalized_locations'][number]

export interface LocationInputLead {
	lead_id: string
	location_hint: string
	raw_text?: string
	source?: string
}

type LocalityDefinition = {
	city: 'Mumbai' | 'Pune'
	canonical: string
	micro_market: string
	aliases: string[]
}

const LOCALITIES: LocalityDefinition[] = [
	{ city: 'Mumbai', canonical: 'Andheri West', micro_market: 'Western Suburbs', aliases: ['andheri west', 'andheri w', 'andheri (w)', 'andheriw'] },
	{ city: 'Mumbai', canonical: 'Andheri East', micro_market: 'Western Suburbs', aliases: ['andheri east', 'andheri e', 'andheri (e)', 'andheriest'] },
	{ city: 'Mumbai', canonical: 'Bandra West', micro_market: 'Western Suburbs', aliases: ['bandra west', 'bandra w', 'bandra', 'bandra west side'] },
	{ city: 'Mumbai', canonical: 'Bandra East', micro_market: 'Western Suburbs', aliases: ['bandra east', 'bandra e', 'bkc', 'bandra kurla complex'] },
	{ city: 'Mumbai', canonical: 'Khar West', micro_market: 'Western Suburbs', aliases: ['khar west', 'khar w', 'khar'] },
	{ city: 'Mumbai', canonical: 'Santacruz West', micro_market: 'Western Suburbs', aliases: ['santacruz west', 'santacruz', 'scruz', 'scrz', 'sacruz'] },
	{ city: 'Mumbai', canonical: 'Santacruz East', micro_market: 'Western Suburbs', aliases: ['santacruz east', 'scruz east', 'scrz east'] },
	{ city: 'Mumbai', canonical: 'Juhu', micro_market: 'Western Suburbs', aliases: ['juhu', 'juhu tara', 'jvpd'] },
	{ city: 'Mumbai', canonical: 'Goregaon West', micro_market: 'Western Suburbs', aliases: ['goregaon west', 'goregaon w', 'goregaon'] },
	{ city: 'Mumbai', canonical: 'Goregaon East', micro_market: 'Western Suburbs', aliases: ['goregaon east', 'goregaon e'] },
	{ city: 'Mumbai', canonical: 'Powai', micro_market: 'Central Suburbs', aliases: ['powai', 'pawai', 'hiranandani powai'] },
	{ city: 'Mumbai', canonical: 'Worli', micro_market: 'South Mumbai', aliases: ['worli', 'worli sea face'] },
	{ city: 'Mumbai', canonical: 'Cuffe Parade', micro_market: 'South Mumbai', aliases: ['cuffe parade', 'cuff parade'] },
	{ city: 'Mumbai', canonical: 'Borivali West', micro_market: 'Western Suburbs', aliases: ['borivali west', 'borivali', 'borivali w'] },
	{ city: 'Mumbai', canonical: 'Malad West', micro_market: 'Western Suburbs', aliases: ['malad west', 'malad', 'malad w'] },
	{ city: 'Mumbai', canonical: 'Kandivali West', micro_market: 'Western Suburbs', aliases: ['kandivali west', 'kandivali', 'kandivali w', 'kandivli'] },
	{ city: 'Mumbai', canonical: 'Dahisar', micro_market: 'Western Suburbs', aliases: ['dahisar', 'dahisar east', 'dahisar west'] },
	{ city: 'Mumbai', canonical: 'Mira Road', micro_market: 'Mira-Bhayandar', aliases: ['mira road', 'mira rd', 'mira'] },
	{ city: 'Mumbai', canonical: 'Thane West', micro_market: 'Thane Belt', aliases: ['thane west', 'thane w', 'thane'] },
	{ city: 'Mumbai', canonical: 'Vashi', micro_market: 'Navi Mumbai', aliases: ['vashi', 'navi vashi'] },
	{ city: 'Mumbai', canonical: 'Kharghar', micro_market: 'Navi Mumbai', aliases: ['kharghar'] },
	{ city: 'Mumbai', canonical: 'CBD Belapur', micro_market: 'Navi Mumbai', aliases: ['cbd belapur', 'belapur', 'cbd'] },
	{ city: 'Mumbai', canonical: 'Turner Road', micro_market: 'Bandra West', aliases: ['turner road', 'turner rd', 'off turner road'] },
	{ city: 'Mumbai', canonical: 'Carter Road', micro_market: 'Bandra West', aliases: ['carter road', 'carter rd', 'off carter road'] },
	{ city: 'Pune', canonical: 'Hinjewadi Phase 1', micro_market: 'West IT Corridor', aliases: ['hinjewadi phase 1', 'hinjewadi p1', 'phase 1 hinjewadi'] },
	{ city: 'Pune', canonical: 'Hinjewadi Phase 2', micro_market: 'West IT Corridor', aliases: ['hinjewadi phase 2', 'hinjewadi p2', 'phase 2 hinjewadi'] },
	{ city: 'Pune', canonical: 'Hinjewadi Phase 3', micro_market: 'West IT Corridor', aliases: ['hinjewadi phase 3', 'hinjewadi p3', 'phase 3 hinjewadi'] },
	{ city: 'Pune', canonical: 'Wakad', micro_market: 'West IT Corridor', aliases: ['wakad', 'wakad bridge', 'wakad pune'] },
	{ city: 'Pune', canonical: 'Baner', micro_market: 'West Pune', aliases: ['baner', 'baner road'] },
	{ city: 'Pune', canonical: 'Balewadi', micro_market: 'West Pune', aliases: ['balewadi', 'balewadi high street', 'bhs'] },
	{ city: 'Pune', canonical: 'Aundh', micro_market: 'West Pune', aliases: ['aundh', 'aundh road'] },
	{ city: 'Pune', canonical: 'Pimpri-Chinchwad', micro_market: 'PCMC', aliases: ['pcmc', 'pimpri chinchwad', 'pimpri-chinchwad', 'pimpri', 'chinchwad'] },
	{ city: 'Pune', canonical: 'Kharadi', micro_market: 'East IT Corridor', aliases: ['kharadi', 'kharadi bypass', 'eon kharadi'] },
	{ city: 'Pune', canonical: 'Viman Nagar', micro_market: 'East Pune', aliases: ['viman nagar', 'vimannagar'] },
	{ city: 'Pune', canonical: 'Hadapsar', micro_market: 'East Pune', aliases: ['hadapsar', 'hadpsar'] },
	{ city: 'Pune', canonical: 'Wagholi', micro_market: 'East Pune', aliases: ['wagholi', 'waghuli'] },
	{ city: 'Pune', canonical: 'Magarpatta', micro_market: 'East Pune', aliases: ['magarpatta', 'magarpatta city'] },
	{ city: 'Pune', canonical: 'Kondhwa', micro_market: 'South Pune', aliases: ['kondhwa', 'kondhva'] },
	{ city: 'Pune', canonical: 'NIBM Road', micro_market: 'South Pune', aliases: ['nibm road', 'nibm', 'nibm area'] },
	{ city: 'Pune', canonical: 'Tathawade', micro_market: 'West IT Corridor', aliases: ['tathawade', 'tathwade'] },
	{ city: 'Pune', canonical: 'Ravet', micro_market: 'PCMC', aliases: ['ravet', 'rawet'] },
	{ city: 'Pune', canonical: 'Pimple Saudagar', micro_market: 'PCMC', aliases: ['pimple saudagar', 'pimplesaudagar', 'saudagar'] },
	{ city: 'Pune', canonical: 'Bavdhan', micro_market: 'West Pune', aliases: ['bavdhan', 'bawdhan'] },
	{ city: 'Pune', canonical: 'Kothrud', micro_market: 'Central Pune', aliases: ['kothrud', 'kothrud depot'] },
]

export class IndiaLocationNormalizerError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'IndiaLocationNormalizerError'
	}
}

export function normalizeIndiaLocations(input: { leads: LocationInputLead[] }) {
	const parsedInput = IndiaLocationNormalizerInputSchema.safeParse(input)
	if (!parsedInput.success) {
		throw new IndiaLocationNormalizerError(parsedInput.error.message)
	}

	const normalized_locations = parsedInput.data.leads.map((lead) => normalizeLeadLocation(lead))
	return IndiaLocationNormalizerOutputSchema.parse({ normalized_locations })
}

function normalizeLeadLocation(lead: LocationInputLead): NormalizedLocation {
	const hint = normalizeText(lead.location_hint)
	const exactMatch = findExactMatch(hint)
	if (exactMatch) {
		return buildNormalizedLocation(lead.lead_id, exactMatch, hint, 1, false, 'exact_alias')
	}

	const normalizedMatch = findNormalizedMatch(hint)
	if (normalizedMatch) {
		return buildNormalizedLocation(lead.lead_id, normalizedMatch, hint, 0.92, false, 'normalized_alias')
	}

	const fuzzyMatch = findFuzzyMatch(hint)
	if (fuzzyMatch) {
		return buildNormalizedLocation(lead.lead_id, fuzzyMatch.match, hint, fuzzyMatch.confidence, fuzzyMatch.ambiguous, fuzzyMatch.ambiguous ? 'unresolved' : 'fuzzy_alias')
	}

	return {
		lead_id: lead.lead_id,
		city: 'Unknown',
		locality_canonical: lead.location_hint.trim(),
		micro_market: 'Unknown',
		matched_alias: lead.location_hint.trim(),
		confidence: 0,
		unresolved_flag: true,
		resolution_method: 'unresolved',
	}
}

function buildNormalizedLocation(
	leadId: string,
	match: LocalityDefinition,
	matchedAlias: string,
	confidence: number,
	unresolvedFlag: boolean,
	resolutionMethod: NormalizedLocation['resolution_method'],
): NormalizedLocation {
	return {
		lead_id: leadId,
		city: match.city,
		locality_canonical: match.canonical,
		micro_market: match.micro_market,
		matched_alias: matchedAlias,
		confidence,
		unresolved_flag: unresolvedFlag,
		resolution_method: resolutionMethod,
	}
}

function findExactMatch(hint: string): LocalityDefinition | null {
	for (const locality of LOCALITIES) {
		if (locality.aliases.some((alias) => alias === hint)) {
			return locality
		}
	}
	return null
}

function findNormalizedMatch(hint: string): LocalityDefinition | null {
	for (const locality of LOCALITIES) {
		if (locality.aliases.some((alias) => normalizeText(alias) === hint)) {
			return locality
		}
	}
	return null
}

function findFuzzyMatch(hint: string): { match: LocalityDefinition; confidence: number; ambiguous: boolean } | null {
	let best: { match: LocalityDefinition; confidence: number } | null = null
	let secondBest: { match: LocalityDefinition; confidence: number } | null = null

	for (const locality of LOCALITIES) {
		for (const alias of locality.aliases) {
			const confidence = similarityScore(hint, normalizeText(alias))
			if (confidence < 0.82) {
				continue
			}

			const candidate = { match: locality, confidence }
			if (!best || confidence > best.confidence) {
				secondBest = best
				best = candidate
			} else if (!secondBest || confidence > secondBest.confidence) {
				secondBest = candidate
			}
		}
	}

	if (!best) return null

	const ambiguous = !!secondBest && Math.abs(best.confidence - secondBest.confidence) < 0.05
	if (ambiguous) {
		return { match: best.match, confidence: best.confidence, ambiguous: true }
	}

	return { match: best.match, confidence: best.confidence, ambiguous: false }
}

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.replace(/[()\-_,]/g, ' ')
		.replace(/\b(w|e|n|s)\b/g, '')
		.replace(/\s+/g, ' ')
		.trim()
}

function similarityScore(a: string, b: string) {
	if (!a || !b) return 0
	if (a === b) return 1
	if (a.includes(b) || b.includes(a)) {
		return Math.max(0.84, Math.min(0.98, Math.min(a.length, b.length) / Math.max(a.length, b.length)))
	}

	const distance = levenshtein(a, b)
	const maxLen = Math.max(a.length, b.length)
	return maxLen === 0 ? 0 : 1 - distance / maxLen
}

function levenshtein(a: string, b: string) {
	const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))

	for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i
	for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j

	for (let i = 1; i <= a.length; i += 1) {
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost,
			)
		}
	}

	return matrix[a.length][b.length]
}
