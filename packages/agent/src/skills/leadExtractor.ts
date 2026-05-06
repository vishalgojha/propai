import { z } from 'zod'

import type { ParsedMessage } from './messageParser'

export const ExtractedLeadSchema = z.object({
	lead_id: z.string().min(1),
	dataset_mode: z.enum(['broker_group', 'buyer_inquiry', 'mixed']).optional(),
	name: z.string().min(1),
	phone: z.string().min(1),
	record_type: z.enum(['inventory_listing', 'buyer_requirement']),
	property_type: z.string().optional(),
	budget: z.number().optional(),
	deal_type: z.enum(['sale', 'rent', 'lease', 'outright', 'unknown']).optional(),
	asset_class: z.enum(['residential', 'commercial', 'mixed', 'pg', 'unknown']).optional(),
	price_basis: z.enum(['total', 'per_sqft', 'monthly_rent', 'deposit', 'unknown']).optional(),
	area_sqft: z.number().nonnegative().optional(),
	area_basis: z.enum(['carpet', 'rera_carpet', 'builtup', 'unknown']).optional(),
	location_hint: z.string().optional(),
	raw_text: z.string().optional(),
	source: z.string().optional(),
	created_at: z.string().datetime().optional(),
})

export const ExtractedLeadArraySchema = z.array(ExtractedLeadSchema)

export type ExtractedLead = z.infer<typeof ExtractedLeadSchema>

export interface LeadExtractionOptions {
	datasetMode?: 'broker_group' | 'buyer_inquiry' | 'mixed'
	source?: string
}

const PROPERTY_SIGNALS = [
	'bhk',
	'studio',
	'flat',
	'apartment',
	'office',
	'shop',
	'showroom',
	'warehouse',
	'pg',
	'carpet',
]

const TRANSACTION_SIGNALS = [
	'sale',
	'outright',
	'rent',
	'lease',
	'leave and licence',
	'l & l',
	'l&l',
	'asking',
]

const REQUIREMENT_SIGNALS = [
	'required',
	'requirement',
	'needed',
	'need',
	'looking for',
	'wanted',
	'chahiye',
	'chahiyeh',
	'chaiye',
	'chaiyeh',
	'client looking',
	'need a',
]

const BOILERPLATE_PATTERNS = [
	/messages and calls are end-to-end encrypted/i,
	/end-to-end encrypted/i,
	/created group/i,
	/removed/i,
	/was added/i,
	/left/i,
	/^<Media omitted>$/i,
]

export class LeadExtractionError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'LeadExtractionError'
	}
}

export function extractLeadsFromMessages(messages: ParsedMessage[], options: LeadExtractionOptions = {}): ExtractedLead[] {
	if (!Array.isArray(messages)) {
		throw new LeadExtractionError('Parsed message array is required')
	}

	const leads: ExtractedLead[] = []
	const seen = new Set<string>()
	const datasetMode = options.datasetMode || inferDatasetMode(messages)

	for (const message of messages) {
		const parsed = extractLeadCandidate(message, datasetMode, options.source)
		if (!parsed) {
			continue
		}

		const leadId = buildLeadId(parsed)
		const key = normalizeDedupKey(parsed, leadId)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)

		const lead = {
			...parsed,
			lead_id: leadId,
			dataset_mode: parsed.dataset_mode || datasetMode,
		}

		const validated = ExtractedLeadSchema.safeParse(lead)
		if (!validated.success) {
			throw new LeadExtractionError(`Invalid extracted lead: ${validated.error.message}`)
		}

		leads.push(validated.data)
	}

	return ExtractedLeadArraySchema.parse(leads)
}

function extractLeadCandidate(
	message: ParsedMessage,
	datasetMode: NonNullable<LeadExtractionOptions['datasetMode']>,
	source?: string,
): Omit<ExtractedLead, 'lead_id'> | null {
	const text = normalizeText(message.content)
	if (!text || isBoilerplate(text)) {
		return null
	}

	const signalScore = scoreLeadSignals(text)
	if (signalScore < 2) {
		return null
	}

	const recordType = inferRecordType(text, datasetMode)
	const phone = normalizePhone(text) || normalizePhone(message.sender)
	if (!phone) {
		return null
	}

	const lead = {
		dataset_mode: datasetMode,
		name: inferName(message.sender, text, phone),
		phone,
		record_type: recordType,
		property_type: inferPropertyType(text),
		budget: inferBudget(text),
		deal_type: inferDealType(text),
		asset_class: inferAssetClass(text),
		price_basis: inferPriceBasis(text),
		area_sqft: inferAreaSqft(text),
		area_basis: inferAreaBasis(text),
		location_hint: inferLocationHint(text),
		raw_text: message.content,
		source,
		created_at: message.timestamp,
	}

	return lead
}

function inferDatasetMode(messages: ParsedMessage[]): NonNullable<LeadExtractionOptions['datasetMode']> {
	const hasRequirementSignals = messages.some((message) => isRequirementText(message.content))
	const hasInventorySignals = messages.some((message) => isInventoryText(message.content))

	if (hasRequirementSignals && hasInventorySignals) {
		return 'mixed'
	}

	if (hasRequirementSignals) {
		return 'buyer_inquiry'
	}

	return 'broker_group'
}

function inferRecordType(
	text: string,
	datasetMode: NonNullable<LeadExtractionOptions['datasetMode']>,
): ExtractedLead['record_type'] {
	if (isRequirementText(text)) {
		return 'buyer_requirement'
	}

	if (datasetMode === 'buyer_inquiry') {
		return 'buyer_requirement'
	}

	return 'inventory_listing'
}

function scoreLeadSignals(text: string) {
	let score = 0
	if (PROPERTY_SIGNALS.some((signal) => text.includes(signal))) score += 1
	if (TRANSACTION_SIGNALS.some((signal) => text.includes(signal))) score += 1
	if (REQUIREMENT_SIGNALS.some((signal) => text.includes(signal))) score += 1
	if (normalizePhone(text)) score += 1
	if (inferBudget(text) !== undefined) score += 1
	if (inferLocationHint(text)) score += 1
	return score
}

function inferName(sender: string, text: string, phone: string) {
	const contactMatch = text.match(/\b(?:name|contact|client|broker)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,40})/i)
	if (contactMatch?.[1]) {
		return contactMatch[1].trim()
	}

	const senderName = sender.trim()
	if (senderName && !normalizePhone(senderName)) {
		return senderName
	}

	return phone ? `Lead ${phone.slice(-4)}` : 'Unknown'
}

function normalizePhone(text: string) {
	const matches = text.match(/(?:\+?91[\s-]?)?(?:[6-9]\d{9})|\b[6-9]\d{9}\b/g)
	if (!matches?.length) {
		return ''
	}

	for (const match of matches) {
		const digits = match.replace(/\D/g, '')
		if (digits.length === 10 && /^[6-9]/.test(digits)) {
			return `+91${digits}`
		}
		if (digits.length === 12 && digits.startsWith('91')) {
			return `+${digits}`
		}
	}

	return ''
}

function inferPropertyType(text: string) {
	if (text.includes('showroom')) return 'showroom'
	if (text.includes('office')) return 'office'
	if (text.includes('shop')) return 'shop'
	if (text.includes('warehouse')) return 'warehouse'
	if (text.includes('pg')) return 'pg'
	if (text.match(/\b\d+\s*bhk\b/)) return 'flat'
	if (text.includes('flat') || text.includes('apartment')) return 'flat'
	return undefined
}

function inferBudget(text: string) {
	const moneyMatch = text.match(/(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|k|thousand|psf|sqft|sq ft|per sq ft|per sqft)\b/i)
	if (!moneyMatch) {
		return undefined
	}

	const amount = Number(moneyMatch[1])
	const unit = moneyMatch[2].toLowerCase()
	if (Number.isNaN(amount)) return undefined

	if (unit === 'cr' || unit === 'crore' || unit === 'crores') return amount * 10000000
	if (unit === 'lakh' || unit === 'lakhs' || unit === 'lac' || unit === 'lacs') return amount * 100000
	if (unit === 'k' || unit === 'thousand') return amount * 1000
	return amount
}

function inferDealType(text: string): ExtractedLead['deal_type'] {
	if (text.includes('leave and licence') || text.includes('l&l') || text.includes('l & l') || text.includes('lease')) {
		return 'lease'
	}
	if (text.includes('outright')) return 'outright'
	if (text.includes('rent')) return 'rent'
	if (text.includes('sale')) return 'sale'
	return 'unknown'
}

function inferAssetClass(text: string): ExtractedLead['asset_class'] {
	const commercial = ['office', 'showroom', 'shop', 'retail', 'commercial'].some((signal) => text.includes(signal))
	const pg = text.includes('pg') || text.includes('paying guest')
	const residential = /\b\d+\s*bhk\b/.test(text) || text.includes('flat') || text.includes('furnished') || text.includes('family')

	if (commercial && residential) return 'mixed'
	if (commercial) return 'commercial'
	if (pg) return 'pg'
	if (residential) return 'residential'
	return 'unknown'
}

function inferPriceBasis(text: string): ExtractedLead['price_basis'] {
	if (text.includes('psf') || text.includes('per sq ft') || text.includes('per sqft')) return 'per_sqft'
	if (text.includes('deposit')) return 'deposit'
	if (text.includes('rent')) return 'monthly_rent'
	return 'total'
}

function inferAreaSqft(text: string) {
	const match = text.match(/(\d{2,5}(?:\.\d+)?)\s*(sqft|sq ft|carpet|builtup|built-up|rera carpet|cpt)\b/i)
	if (!match) {
		return undefined
	}

	const value = Number(match[1])
	return Number.isNaN(value) ? undefined : value
}

function inferAreaBasis(text: string): ExtractedLead['area_basis'] {
	if (text.includes('rera carpet')) return 'rera_carpet'
	if (text.includes('carpet') || text.includes('cpt')) return 'carpet'
	if (text.includes('builtup') || text.includes('built-up')) return 'builtup'
	return 'unknown'
}

function inferLocationHint(text: string) {
	const locationPatterns = [
		/\b(?:in|at|near|opp|opposite|behind|off)\s+([A-Za-z0-9 .,'/-]{3,50})/i,
		/\b([A-Za-z][A-Za-z0-9 .,'/-]{2,40})\s+(?:area|locality|location)\b/i,
	]

	for (const pattern of locationPatterns) {
		const match = text.match(pattern)
		if (match?.[1]) {
			return match[1].trim()
		}
	}

	return undefined
}

function buildLeadId(lead: Omit<ExtractedLead, 'lead_id'>) {
	return [
		lead.phone,
		lead.record_type,
		lead.property_type || 'na',
		lead.location_hint || 'na',
		lead.budget ? String(lead.budget) : 'na',
	].join(':')
}

function normalizeDedupKey(lead: Omit<ExtractedLead, 'lead_id'>, leadId: string) {
	return `${lead.phone}|${lead.record_type}|${lead.property_type || ''}|${lead.location_hint || ''}|${lead.budget || ''}|${leadId}`
}

function isRequirementText(text: string) {
	return REQUIREMENT_SIGNALS.some((signal) => text.includes(signal))
}

function isInventoryText(text: string) {
	return PROPERTY_SIGNALS.some((signal) => text.includes(signal)) || TRANSACTION_SIGNALS.some((signal) => text.includes(signal))
}

function normalizeText(value: string) {
	return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function isBoilerplate(text: string) {
	return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text))
}
