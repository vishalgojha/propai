import { z } from 'zod'

export const ParsedMessageSchema = z.object({
	timestamp: z.string().datetime(),
	sender: z.string().min(1),
	content: z.string(),
})

export const ParsedMessageArraySchema = z.array(ParsedMessageSchema)

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>

export interface ParseIssue {
	line: number
	message: string
	raw?: string
}

export class MessageParseError extends Error {
	issues: ParseIssue[]

	constructor(message: string, issues: ParseIssue[]) {
		super(message)
		this.name = 'MessageParseError'
		this.issues = issues
	}
}

const TEXT_PATTERNS = [
	/^\[(?<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}),\s*(?<time>\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?)\]\s*(?<rest>.*)$/i,
	/^(?<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}),\s*(?<time>\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?)\s*[-–]\s*(?<rest>.*)$/i,
]

const BOILERPLATE_PATTERNS = [
	/messages and calls are end-to-end encrypted/i,
	/end-to-end encrypted/i,
	/created group/i,
	/changed (?:this group'?s icon|the subject|the description)/i,
	/joined using (?:this group'?s )?invite link/i,
	/was added/i,
	/\badded\b/i,
	/\bleft\b/i,
	/removed/i,
	/this message was deleted/i,
]

const STRUCTURED_TEXT_KEYS = [
	'content',
	'text',
	'message',
	'body',
	'messageText',
	'msg',
]

const STRUCTURED_SENDER_KEYS = [
	'sender',
	'author',
	'from',
	'name',
	'participant',
	'displayName',
]

const STRUCTURED_TIMESTAMP_KEYS = [
	'timestamp',
	'date',
	'datetime',
	'sentAt',
	'createdAt',
	'time',
]

export interface ParseOptions {
	strict?: boolean
}

export function parseWhatsAppMessages(input: unknown, options: ParseOptions = {}): ParsedMessage[] {
	const strict = options.strict !== false
	const { messages, issues } = normalizeInput(input)
	const parsed = ParsedMessageArraySchema.safeParse(messages)

	if (!parsed.success) {
		issues.push(
			...parsed.error.issues.map((issue) => ({
				line: 0,
				message: issue.message,
				raw: issue.path.join('.'),
			})),
		)
	}

	if (strict && issues.length > 0) {
		throw new MessageParseError('Unable to parse WhatsApp export', issues)
	}

	return parsed.success ? parsed.data : messages
}

function normalizeInput(input: unknown): { messages: ParsedMessage[]; issues: ParseIssue[] } {
	if (typeof input === 'string') {
		return parseStringInput(input)
	}

	if (Array.isArray(input) || isPlainObject(input)) {
		return parseStructuredInput(input)
	}

	return {
		messages: [],
		issues: [{ line: 0, message: 'Unsupported input type for message parsing' }],
	}
}

function parseStringInput(input: string): { messages: ParsedMessage[]; issues: ParseIssue[] } {
	const trimmed = input.trim()
	if (!trimmed) {
		return { messages: [], issues: [{ line: 0, message: 'Input is empty' }] }
	}

	const parsedJson = tryParseJson(trimmed)
	if (parsedJson.ok) {
		return parseStructuredInput(parsedJson.value)
	}

	return parseTextInput(trimmed)
}

function parseStructuredInput(input: unknown): { messages: ParsedMessage[]; issues: ParseIssue[] } {
	const records = extractRecords(input)
	if (!records) {
		return {
			messages: [],
			issues: [{ line: 0, message: 'Structured input does not contain a parsable message array' }],
		}
	}

	const messages: ParsedMessage[] = []
	const issues: ParseIssue[] = []

	records.forEach((record, index) => {
		const normalized = normalizeStructuredRecord(record)
		if (normalized.message) {
			messages.push(normalized.message)
		}
		if (normalized.issue) {
			issues.push({
				line: index + 1,
				message: normalized.issue,
				raw: safePreview(record),
			})
		}
	})

	return { messages, issues }
}

function parseTextInput(text: string): { messages: ParsedMessage[]; issues: ParseIssue[] } {
	const lines = text.replace(/\r\n/g, '\n').split('\n')
	const messages: ParsedMessage[] = []
	const issues: ParseIssue[] = []
	let current: ParsedMessage | null = null

	lines.forEach((rawLine, index) => {
		const line = rawLine.trimEnd()
		const lineNumber = index + 1
		if (!line.trim()) {
			return
		}

		if (isBoilerplateLine(line)) {
			return
		}

		const parsed = parseTextLine(line)
		if (parsed) {
			if (current) {
				messages.push(current)
			}

			current = parsed
			return
		}

		if (current) {
			current = {
				...current,
				content: current.content ? `${current.content}\n${line.trim()}` : line.trim(),
			}
			return
		}

		issues.push({
			line: lineNumber,
			message: 'Unrecognized WhatsApp export line',
			raw: line,
		})
	})

	if (current) {
		messages.push(current)
	}

	return { messages, issues }
}

function parseTextLine(line: string): ParsedMessage | null {
	for (const pattern of TEXT_PATTERNS) {
		const match = line.match(pattern)
		if (!match?.groups) continue

		const { date, time, rest } = match.groups as Record<string, string>
		const separatorIndex = rest.indexOf(':')
		if (separatorIndex === -1) {
			return null
		}

		const sender = rest.slice(0, separatorIndex).trim()
		const content = rest.slice(separatorIndex + 1).trimStart()
		if (!sender) {
			return null
		}

		const timestamp = normalizeTimestamp(date, time)
		if (!timestamp) {
			return null
		}

		return {
			timestamp,
			sender,
			content,
		}
	}

	return null
}

function normalizeStructuredRecord(record: unknown): { message?: ParsedMessage; issue?: string } {
	if (!isPlainObject(record)) {
		return { issue: 'Record is not an object' }
	}

	const timestampRaw = firstDefinedValue(record, STRUCTURED_TIMESTAMP_KEYS)
	const senderRaw = firstDefinedValue(record, STRUCTURED_SENDER_KEYS)
	const contentRaw = firstDefinedValue(record, STRUCTURED_TEXT_KEYS)
	const nestedContent = extractNestedContent(record)
	const timestamp = normalizeTimestampValue(timestampRaw)
	const sender = typeof senderRaw === 'string' ? senderRaw.trim() : ''
	const content = typeof contentRaw === 'string'
		? contentRaw
		: typeof nestedContent === 'string'
			? nestedContent
			: ''

	if (!timestamp) {
		return { issue: 'Missing or invalid timestamp' }
	}

	if (!sender) {
		return { issue: 'Missing sender' }
	}

	return {
		message: {
			timestamp,
			sender,
			content,
		},
	}
}

function extractRecords(input: unknown): unknown[] | null {
	if (Array.isArray(input)) {
		return input
	}

	if (!isPlainObject(input)) {
		return null
	}

	for (const key of ['messages', 'data', 'records', 'items', 'chats']) {
		const value = (input as Record<string, unknown>)[key]
		if (Array.isArray(value)) {
			return value
		}
	}

	if (looksLikeMessageRecord(input)) {
		return [input]
	}

	return null
}

function looksLikeMessageRecord(value: unknown): value is Record<string, unknown> {
	if (!isPlainObject(value)) {
		return false
	}

	return [
		...STRUCTURED_TIMESTAMP_KEYS,
		...STRUCTURED_SENDER_KEYS,
		...STRUCTURED_TEXT_KEYS,
	].some((key) => key in value)
}

function normalizeTimestampValue(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null
	}

	const trimmed = value.trim()
	if (!trimmed) {
		return null
	}

	if (trimmed.includes('T') || /\d{4}-\d{2}-\d{2}/.test(trimmed)) {
		const date = new Date(trimmed)
		return Number.isNaN(date.getTime()) ? null : date.toISOString()
	}

	const dateMatch = trimmed.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?))?$/i)
	if (!dateMatch) {
		return null
	}

	return normalizeTimestamp(dateMatch[1], dateMatch[2] || '00:00')
}

function normalizeTimestamp(dateText: string, timeText: string): string | null {
	const dateParts = dateText.split(/[/-]/).map((part) => Number(part))
	if (dateParts.length !== 3 || dateParts.some((part) => Number.isNaN(part))) {
		return null
	}

	let [day, month, year] = dateParts
	if (year < 100) {
		year += year >= 70 ? 1900 : 2000
	}

	const timeMatch = timeText.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i)
	if (!timeMatch) {
		return null
	}

	let hours = Number(timeMatch[1])
	const minutes = Number(timeMatch[2])
	const seconds = Number(timeMatch[3] || 0)
	const meridiem = timeMatch[4]?.toLowerCase()

	if (meridiem === 'am' && hours === 12) {
		hours = 0
	} else if (meridiem === 'pm' && hours < 12) {
		hours += 12
	}

	const date = new Date(year, month - 1, day, hours, minutes, seconds, 0)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function firstDefinedValue(record: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		const value = record[key]
		if (value !== undefined && value !== null && value !== '') {
			return value
		}
	}

	return undefined
}

function extractNestedContent(record: Record<string, unknown>): string | null {
	const message = record.message
	if (!isPlainObject(message)) {
		return null
	}

	if (typeof message.conversation === 'string') return message.conversation
	if (typeof message.text === 'string') return message.text
	if (typeof message.body === 'string') return message.body
	if (typeof message.caption === 'string') return message.caption
	if (isPlainObject(message.extendedTextMessage) && typeof message.extendedTextMessage.text === 'string') {
		return message.extendedTextMessage.text
	}
	if (isPlainObject(message.imageMessage) && typeof message.imageMessage.caption === 'string') {
		return message.imageMessage.caption
	}

	return null
}

function isBoilerplateLine(line: string): boolean {
	return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line))
}

function safePreview(value: unknown): string {
	try {
		return JSON.stringify(value).slice(0, 160)
	} catch {
		return String(value)
	}
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(value) }
	} catch {
		return { ok: false }
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
