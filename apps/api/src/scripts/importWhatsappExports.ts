/// <reference types="node" />
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parsePrice } from '@propai/price-parser';
import { LOCALITY_DATA, findLocality } from '../data/mumbai-localities';
declare const process: any;

type ParsedTextMessage = {
  sender: string;
  text: string;
  timestamp: string;
};

type ChatExport = {
  filePath: string;
  fileName: string;
  chatName: string;
  messages: ParsedTextMessage[];
  modifiedAtMs: number;
};

type RecordType = 'listing' | 'requirement' | 'junk';
type DealType = 'rent' | 'sale' | 'lease' | 'unknown';
type PropertyCategory = 'residential' | 'commercial' | 'land' | 'unknown';
type PublishState = 'accepted' | 'review' | 'rejected';

type LocalityCandidate = {
  name: string;
  score: number;
  source: 'text' | 'chat' | 'both';
  kind: 'locality' | 'belt';
};

type ExportRecord = {
  chat_name: string;
  source_file: string;
  source_files: string[];
  message_index: number;
  segment_index: number;
  segment_count: number;
  timestamp: string;
  sender: string;
  sender_phone: string | null;
  contact_phone: string | null;
  text: string;
  text_normalized: string;
  record_type: RecordType;
  deal_type: DealType;
  property_category: PropertyCategory;
  property_use: string | null;
  locality: string | null;
  locality_candidates: string[];
  building_name: string | null;
  bhk: string | null;
  area_sqft: number | null;
  price_numeric: number | null;
  price_label: string;
  price_basis: string;
  price_confidence: string;
  title: string | null;
  confidence_score: number;
  publish_state: PublishState;
  rejection_reason: string | null;
  record_hash: string;
};

type Summary = {
  generated_at: string;
  input_paths: string[];
  source_files: number;
  chats: number;
  messages: number;
  accepted: number;
  review: number;
  rejected: number;
  accepted_by_type: Record<RecordType, number>;
  rejected_reasons: Array<{ reason: string; count: number }>;
  top_localities: Array<{ locality: string; count: number }>;
  top_chats: Array<{ chat_name: string; count: number }>;
};

type CliOptions = {
  inputPaths: string[];
  outputDir: string;
  limit: number | null;
  dryRun: boolean;
};

type ExportFile = {
  path: string;
  fileName: string;
  chatName: string;
  modifiedAtMs: number;
  text: string;
};

const START_PATTERNS = [
  /^\s*\[(?<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}),\s+(?<time>\d{1,2}:\d{2}(?:\s?[APap][Mm])?)\]\s+(?<body>.+)$/,
  /^\s*(?<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4}),\s+(?<time>\d{1,2}:\d{2}(?:\s?[APap][Mm])?)\s+-\s+(?<body>.+)$/,
];

const MEDIA_MARKERS = [
  '<media omitted>',
  'image omitted',
  'video omitted',
  'audio omitted',
  'document omitted',
  'gif omitted',
  'sticker omitted',
  'this message was deleted',
  'deleted this message',
];

const REQ_HINTS = [
  'requirement',
  'wanted',
  'need',
  'required',
  'looking for',
  'searching for',
  'seeking',
  'urgent requirement',
  'requirements',
  'my client',
  'client requirement',
  'client wants',
  'sourcing',
  'request for',
];

const LISTING_HINTS = [
  'available',
  'for rent',
  'on rent',
  'for sale',
  'on sale',
  'lease',
  'leave and license',
  'leave & license',
  'outright',
  'resale',
  'sale',
  'rent',
];

const COMMERCIAL_KEYWORDS = [
  'office',
  'shop',
  'showroom',
  'warehouse',
  'godown',
  'retail',
  'commercial',
  'factory',
  'shed',
  'industrial',
  'restaurant',
  'clinic',
  'bare shell',
  'barea shell',
  'bareshell',
];

const LAND_KEYWORDS = ['plot', 'land', 'acre', 'acres', 'gunta', 'joint venture', 'jv'];
const RESIDENTIAL_KEYWORDS = [
  'flat',
  'apartment',
  'studio',
  'penthouse',
  'duplex',
  'villa',
  'bungalow',
  'pg',
  '1 rk',
  '1bhk',
  '2bhk',
  '3bhk',
  '4bhk',
];

const NOISE_PATTERNS = [
  /https?:\/\/chat\.whatsapp\.com/i,
  /follow this link to join/i,
  /messages and calls are end-to-end encrypted/i,
  /^group creator created group/i,
];

const AMBIGUOUS_DEFAULTS: Array<{ token: string; target: string }> = [
  { token: 'bandra', target: 'Bandra West' },
  { token: 'khar', target: 'Khar West' },
  { token: 'santacruz', target: 'Santacruz West' },
  { token: 'andheri', target: 'Andheri West' },
  { token: 'powai', target: 'Powai' },
  { token: 'juhu', target: 'Juhu' },
  { token: 'versova', target: 'Versova' },
  { token: 'borivali', target: 'Borivali West' },
  { token: 'malad', target: 'Malad West' },
  { token: 'goregaon', target: 'Goregaon West' },
  { token: 'kandivali', target: 'Kandivali West' },
  { token: 'dahisar', target: 'Dahisar West' },
  { token: 'mulund', target: 'Mulund West' },
  { token: 'ghatkopar', target: 'Ghatkopar West' },
  { token: 'thane', target: 'Thane West' },
  { token: 'vile parle', target: 'Vile Parle West' },
];

const BELT_ALIASES: Array<{ name: string; tokens: string[] }> = [
  { name: 'BKC', tokens: ['bkc', 'bandra kurla complex'] },
  { name: 'South Mumbai', tokens: ['south mumbai', 'sobo'] },
  { name: 'Western Suburbs', tokens: ['western suburbs'] },
  { name: 'Central Mumbai', tokens: ['central mumbai'] },
  { name: 'Navi Mumbai', tokens: ['navi mumbai'] },
];

const LOCALITY_TOKENS = LOCALITY_DATA.flatMap((locality) =>
  locality.colloquials.map((token) => ({
    locality: locality.name,
    token: normalizeText(token),
  })),
).sort((a, b) => b.token.length - a.token.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseDateTime(datePart: string, timePart: string): string {
  const dateTokens = datePart.split(/[/-]/).map((token) => Number(token));
  if (dateTokens.length !== 3 || dateTokens.some((token) => Number.isNaN(token))) {
    return new Date().toISOString();
  }

  let day: number;
  let month: number;
  let year: number;

  if (dateTokens[0] > 12) {
    [day, month, year] = dateTokens;
  } else if (dateTokens[1] > 12) {
    [month, day, year] = dateTokens;
  } else {
    [day, month, year] = dateTokens;
  }

  if (year < 100) year += 2000;

  const timeMatch = timePart.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([APap][Mm]))?$/);
  if (!timeMatch) return new Date().toISOString();

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const meridiem = timeMatch[3]?.toLowerCase() || null;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

function parseLine(line: string): { timestamp: string; body: string } | null {
  for (const pattern of START_PATTERNS) {
    const match = line.match(pattern);
    if (!match?.groups?.date || !match.groups.time || !match.groups.body) continue;
    return {
      timestamp: parseDateTime(match.groups.date, match.groups.time),
      body: match.groups.body.trim(),
    };
  }
  return null;
}

function isSkippableText(text: string): boolean {
  const lower = normalizeText(text);
  if (!lower) return true;
  if (MEDIA_MARKERS.some((marker) => lower.includes(marker))) return true;
  if (NOISE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return false;
}

function parseMessages(rawText: string): ParsedTextMessage[] {
  const normalized = String(rawText || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const messages: ParsedTextMessage[] = [];
  let current: ParsedTextMessage | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.text.trim();
    if (current.sender && text && !isSkippableText(text)) {
      messages.push({ ...current, text });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const parsed = parseLine(line);

    if (parsed) {
      flush();
      const colonIndex = parsed.body.indexOf(': ');
      if (colonIndex <= 0) continue;

      const sender = parsed.body.slice(0, colonIndex).trim();
      const text = parsed.body.slice(colonIndex + 2).trim();
      if (!sender || !text || isSkippableText(text)) continue;

      current = { sender, text, timestamp: parsed.timestamp };
      continue;
    }

    if (current && line.trim()) {
      current.text = `${current.text}\n${line.trim()}`.trim();
    }
  }

  flush();
  return messages;
}

function deriveGroupName(fileName: string): string {
  return fileName
    .replace(/^WhatsApp Chat with\s+/i, '')
    .replace(/\.zip$/i, '')
    .replace(/\.txt$/i, '')
    .trim();
}

function readZipTextExport(filePath: string): string | null {
  try {
    const listing = execFileSync('unzip', ['-Z1', filePath], { encoding: 'utf8' });
    const textEntry = listing
      .split('\n')
      .map((line: string) => line.trim())
      .find((entry: string) => entry.toLowerCase().endsWith('.txt'));

    if (!textEntry) return null;

    return execFileSync('unzip', ['-p', filePath, textEntry], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function isSupportedExportFile(filePath: string): boolean {
  const lowerName = filePath.toLowerCase();
  return lowerName.endsWith('.txt') || lowerName.endsWith('.zip');
}

function collectExportFiles(inputPath: string): string[] {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) return [];

  const stats = fs.statSync(resolved);
  if (stats.isFile()) {
    return isSupportedExportFile(resolved) ? [resolved] : [];
  }

  if (!stats.isDirectory()) return [];

  const collected: string[] = [];
  const stack = [resolved];

  while (stack.length) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isSupportedExportFile(entryPath)) continue;
      collected.push(entryPath);
    }
  }

  return collected.sort((a, b) => a.localeCompare(b));
}

function mergeMessages(messages: ParsedTextMessage[]): ParsedTextMessage[] {
  const seen = new Set<string>();
  const merged: ParsedTextMessage[] = [];

  for (const message of messages) {
    const key = `${message.timestamp}\u0000${message.sender}\u0000${message.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(message);
  }

  return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sender.localeCompare(b.sender));
}

function readExports(inputPaths: string[]): ChatExport[] {
  const filePaths = Array.from(new Set(inputPaths.flatMap((inputPath) => collectExportFiles(inputPath))));
  const exportsByChat = new Map<string, ChatExport>();

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    const rawText = fileName.toLowerCase().endsWith('.txt')
      ? fs.readFileSync(filePath, 'utf8')
      : readZipTextExport(filePath);

    if (!rawText) continue;

    const chatExport: ChatExport = {
      filePath,
      fileName,
      chatName: deriveGroupName(fileName),
      messages: parseMessages(rawText),
      modifiedAtMs: stats.mtimeMs,
    };

    if (!chatExport.messages.length) continue;

    const existing = exportsByChat.get(chatExport.chatName);
    if (!existing) {
      exportsByChat.set(chatExport.chatName, chatExport);
      continue;
    }

    const primary =
      chatExport.modifiedAtMs > existing.modifiedAtMs ||
      (chatExport.modifiedAtMs === existing.modifiedAtMs && chatExport.messages.length >= existing.messages.length)
        ? chatExport
        : existing;

    exportsByChat.set(chatExport.chatName, {
      ...primary,
      messages: mergeMessages([...existing.messages, ...chatExport.messages]),
      modifiedAtMs: Math.max(existing.modifiedAtMs, chatExport.modifiedAtMs),
    });
  }

  return Array.from(exportsByChat.values()).sort((a, b) => a.chatName.localeCompare(b.chatName));
}

function normalizePhone(value: string | null | undefined): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith('91')) {
    const tail = digits.slice(2);
    return /^[6-9]\d{9}$/.test(tail) ? tail : null;
  }
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return digits;
  if (digits.length > 10) {
    const tail = digits.slice(-10);
    return /^[6-9]\d{9}$/.test(tail) ? tail : null;
  }
  return null;
}

function extractPhones(text: string): string[] {
  const matches = String(text || '').match(/(?:\+?\d[\d\s().-]{8,}\d)/g) || [];
  const phones = new Set<string>();
  for (const match of matches) {
    const normalized = normalizePhone(match);
    if (normalized) phones.add(normalized);
  }
  return Array.from(phones);
}

function scoreToken(token: string): number {
  if (token.length >= 18) return 9;
  if (token.length >= 12) return 7;
  if (token.length >= 8) return 5;
  if (token.length >= 5) return 3;
  return 1;
}

function resolveLocalityCandidates(text: string, chatName: string): LocalityCandidate[] {
  const textHaystack = normalizeText(text);
  const chatHaystack = normalizeText(chatName);
  const scores = new Map<string, LocalityCandidate>();

  const addScore = (name: string, delta: number, source: 'text' | 'chat', kind: 'locality' | 'belt') => {
    const existing = scores.get(name);
    if (!existing) {
      scores.set(name, { name, score: delta, source, kind });
      return;
    }

    existing.score += delta;
    if (existing.source !== source) {
      existing.source = 'both';
    }
  };

  for (const entry of LOCALITY_TOKENS) {
    if (textHaystack.includes(entry.token)) {
      addScore(entry.locality, scoreToken(entry.token), 'text', 'locality');
    }
    if (chatHaystack.includes(entry.token)) {
      addScore(entry.locality, Math.max(1, Math.floor(scoreToken(entry.token) / 3)), 'chat', 'locality');
    }
  }

  for (const belt of BELT_ALIASES) {
    for (const token of belt.tokens) {
      const normalizedToken = normalizeText(token);
      if (!normalizedToken) continue;
      if (textHaystack.includes(normalizedToken)) {
        addScore(belt.name, Math.max(2, scoreToken(normalizedToken) - 2), 'text', 'belt');
      }
      if (chatHaystack.includes(normalizedToken)) {
        addScore(belt.name, 1, 'chat', 'belt');
      }
    }
  }

  for (const entry of AMBIGUOUS_DEFAULTS) {
    if (!textHaystack.includes(entry.token)) continue;
    const exactMatch = LOCALITY_DATA.some((locality) =>
      locality.name.toLowerCase() === entry.target.toLowerCase() &&
      locality.colloquials.some((colloquial) => textHaystack.includes(normalizeText(colloquial)) && normalizeText(colloquial).includes(entry.token)),
    );
    if (!exactMatch) {
      addScore(entry.target, 2, 'text', 'locality');
    }
  }

  const fallbackLocality = findLocality(`${chatName} ${text}`);
  if (fallbackLocality) {
    addScore(fallbackLocality.name, 2, 'text', 'locality');
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .filter((candidate) => candidate.score >= 2)
    .slice(0, 5);
}

function extractBhk(text: string): string | null {
  const match = text.match(/\b(\d+(?:\s*\/\s*\d+)?)\s*bhk\b/i);
  if (!match?.[1]) return null;
  return `${match[1].replace(/\s+/g, '')} BHK`.replace(/\//g, '/');
}

function extractAreaSqft(text: string): number | null {
  const match = text.match(/\b(\d{2,5})(?:\s*[-/]\s*\d{2,5})?\s*(?:sq\.?\s*ft|sqft|sq ft|carpet|built[\s-]?up)\b/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractBuildingName(text: string): string | null {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const patterns = [
    /(?:building name|bldg(?:ing)?(?: name)?|tower|project|society)\s*[:\-]\s*(.+)$/i,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match?.[1]) continue;
      const value = match[1].replace(/[*_]/g, '').trim();
      if (value.length < 3 || value.length > 60) continue;
      if (/^(rent|sale|requirement|budget|call|contact)$/i.test(value)) continue;
      if (/^\d+$/.test(value)) continue;
      if (/[|`°]{2,}/.test(value)) continue;
      return value;
    }
  }

  return null;
}

function inferRecordType(text: string): RecordType {
  const lower = normalizeText(text);
  if (!lower) return 'junk';
  if (REQ_HINTS.some((hint) => lower.includes(hint))) return 'requirement';
  if (LISTING_HINTS.some((hint) => lower.includes(hint))) return 'listing';
  if (
    /\b\d+(?:\s*\/\s*\d+)?\s*bhk\b/i.test(lower) ||
    /\b\d{2,5}\s*(?:sq\.?\s*ft|sqft|sq ft|carpet|built[\s-]?up)\b/i.test(lower) ||
    COMMERCIAL_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    LAND_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    RESIDENTIAL_KEYWORDS.some((keyword) => lower.includes(keyword))
  ) {
    return 'listing';
  }
  return 'junk';
}

function inferDealType(text: string, recordType: RecordType): DealType {
  const lower = normalizeText(text);
  if (recordType === 'requirement') {
    const hasRent = lower.includes('rent') || lower.includes('lease') || lower.includes('leave and license') || lower.includes('leave & license');
    const hasSale = lower.includes('sale') || lower.includes('buy') || lower.includes('purchase') || lower.includes('outright') || lower.includes('resale');
    if (hasRent && hasSale) return 'unknown';
    if (hasRent) {
      return lower.includes('lease') && !lower.includes('rent') ? 'lease' : 'rent';
    }
    if (hasSale) {
      return 'sale';
    }
    return 'unknown';
  }

  const hasRent = lower.includes('rent') || lower.includes('monthly') || lower.includes('per month') || lower.includes('/mo') || lower.includes('/month');
  const hasSale = lower.includes('sale') || lower.includes('outright') || lower.includes('resale') || lower.includes('for sale');
  const hasLease = lower.includes('leave and license') || lower.includes('leave & license') || lower.includes('lease');

  if ((hasRent && hasSale) || (hasLease && hasSale) || (hasRent && hasLease)) return 'unknown';
  if (hasLease) return 'lease';
  if (hasRent) return 'rent';
  if (hasSale) return 'sale';
  return 'unknown';
}

function inferPropertyCategory(text: string, bhk: string | null): PropertyCategory {
  const lower = normalizeText(text);
  const hasWord = (keyword: string) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(lower);
  if (LAND_KEYWORDS.some((keyword) => hasWord(keyword))) return 'land';
  if (COMMERCIAL_KEYWORDS.some((keyword) => hasWord(keyword))) return 'commercial';
  if (RESIDENTIAL_KEYWORDS.some((keyword) => hasWord(keyword)) || Boolean(bhk)) return 'residential';
  return 'unknown';
}

function inferPropertyUse(text: string, bhk: string | null): string | null {
  const lower = normalizeText(text);
  const hasWord = (keyword: string) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(lower);
  if (LAND_KEYWORDS.some((keyword) => hasWord(keyword))) return 'land';
  for (const keyword of COMMERCIAL_KEYWORDS) {
    if (hasWord(keyword)) {
      if (keyword === 'bare shell' || keyword === 'barea shell' || keyword === 'bareshell') return 'office';
      return keyword;
    }
  }
  if (RESIDENTIAL_KEYWORDS.some((keyword) => hasWord(keyword)) || bhk) return 'flat';
  return null;
}

function priceFields(text: string, dealType: DealType): { priceLabel: string; priceNumeric: number | null; priceBasis: string; priceConfidence: string } {
  const parsed = parsePrice(text, dealType === 'unknown' ? undefined : dealType);
  return {
    priceLabel: parsed.label || 'Price on Request',
    priceNumeric: parsed.numeric,
    priceBasis: parsed.basis,
    priceConfidence: parsed.confidence,
  };
}

function hasUrlNoise(text: string): boolean {
  return /https?:\/\/|www\./i.test(text);
}

function splitMessageSegments(text: string): string[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const markerMatches = normalized.match(/(?:▶️|❄️|✔️|☑️|🔘|🔹|▪️|•)/g) || [];
  if (markerMatches.length < 2 || normalized.length < 280) {
    return [normalized];
  }

  const pieces = normalized
    .split(/(?=(?:▶️|❄️|✔️|☑️|🔘|🔹|▪️|•)\s*)/g)
    .map((piece) => piece.replace(/^[\s°•▪️🔹🔘☑️✔️▶️❄️\-_*`]+/g, '').trim())
    .filter((piece) => piece.length > 24);

  return pieces.length >= 2 ? pieces : [normalized];
}

function countStructuralSignals(record: {
  localityCandidates: LocalityCandidate[];
  bhk: string | null;
  areaSqft: number | null;
  priceNumeric: number | null;
  buildingName: string | null;
}): number {
  return [
    record.localityCandidates.length > 0,
    Boolean(record.bhk),
    Boolean(record.areaSqft),
    record.priceNumeric != null,
    Boolean(record.buildingName),
  ].filter(Boolean).length;
}

function buildTitle(record: {
  recordType: RecordType;
  dealType: DealType;
  locality: string | null;
  bhk: string | null;
  areaSqft: number | null;
  propertyCategory: PropertyCategory;
  propertyUse: string | null;
  buildingName: string | null;
}): string | null {
  const locality = record.locality || 'Mumbai';
  const dealLabel = record.dealType === 'sale' ? 'for sale' : record.dealType === 'lease' ? 'for lease' : 'for rent';

  if (record.recordType === 'requirement') {
    if (record.bhk && record.areaSqft) {
      return `${record.bhk} ${record.areaSqft.toLocaleString('en-IN')} sqft requirement in ${locality}`;
    }
    if (record.bhk) {
      return `${record.bhk} requirement in ${locality}`;
    }
    if (record.areaSqft) {
      return `${record.areaSqft.toLocaleString('en-IN')} sqft requirement in ${locality}`;
    }
    return `Requirement in ${locality}`;
  }

  if (record.buildingName) {
    return `${record.buildingName} ${dealLabel} in ${locality}`;
  }
  if (record.propertyCategory === 'commercial' && record.areaSqft) {
    return `${record.areaSqft.toLocaleString('en-IN')} sqft ${record.propertyUse || 'commercial space'} ${dealLabel} in ${locality}`;
  }
  if (record.bhk) {
    return `${record.bhk} ${dealLabel} in ${locality}`;
  }
  if (record.areaSqft) {
    return `${record.areaSqft.toLocaleString('en-IN')} sqft ${record.propertyUse || 'space'} ${dealLabel} in ${locality}`;
  }
  return null;
}

function computeConfidenceScore(input: {
  recordType: RecordType;
  localityCandidates: LocalityCandidate[];
  bhk: string | null;
  areaSqft: number | null;
  priceNumeric: number | null;
  buildingName: string | null;
  propertyCategory: PropertyCategory;
  dealType: DealType;
  text: string;
}): number {
  let score = 20;
  if (input.recordType === 'listing') score += 8;
  if (input.recordType === 'requirement') score += 6;
  score += Math.min(20, input.localityCandidates.length > 0 ? 14 + Math.min(6, input.localityCandidates[0].score) : 0);
  if (input.bhk) score += 12;
  if (input.areaSqft) score += 10;
  if (input.priceNumeric != null) score += 12;
  if (input.buildingName) score += 10;
  if (input.propertyCategory !== 'unknown') score += 4;
  if (input.dealType !== 'unknown') score += 4;
  if (normalizeText(input.text).includes('price on request')) score += 2;
  if (hasUrlNoise(input.text)) score -= 8;
  if (input.text.trim().length < 20) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function classifyRecord(input: {
  text: string;
  chatName: string;
  sender: string;
  timestamp: string;
  sourceFile: string;
  sourceFiles: string[];
  messageIndex: number;
  segmentIndex: number;
  segmentCount: number;
}): ExportRecord {
  const text = normalizeWhitespace(input.text);
  const textNormalized = normalizeText(text);
  const sender = normalizeWhitespace(input.sender);
  const senderPhone = normalizePhone(sender);
  const contactPhone = extractPhones(text)[0] || null;
  const recordType = inferRecordType(text);
  const dealType = inferDealType(text, recordType);
  const bhk = extractBhk(text);
  const areaSqft = extractAreaSqft(text);
  const localityCandidates = resolveLocalityCandidates(text, input.chatName);
  const locality = localityCandidates[0]?.name || null;
  const buildingName = extractBuildingName(text);
  const propertyCategory = inferPropertyCategory(text, bhk);
  const propertyUse = inferPropertyUse(text, bhk);
  const price = priceFields(text, dealType);
  const signalCount = countStructuralSignals({
    localityCandidates,
    bhk,
    areaSqft,
    priceNumeric: price.priceNumeric,
    buildingName,
  });

  let publishState: PublishState = 'rejected';
  let rejectionReason: string | null = null;

  if (recordType === 'junk') {
    publishState = 'rejected';
    rejectionReason = 'no_real_estate_intent';
  } else if (signalCount >= 3 && localityCandidates.length > 0) {
    publishState = 'accepted';
  } else if (recordType === 'requirement' && localityCandidates.length > 0 && signalCount >= 2) {
    publishState = 'accepted';
  } else if (signalCount >= 2) {
    publishState = 'review';
    rejectionReason = 'needs_more_structure';
  } else if (localityCandidates.length > 0) {
    publishState = 'review';
    rejectionReason = 'weak_title_signal';
  } else {
    publishState = 'rejected';
    rejectionReason = 'missing_locality_and_structure';
  }

  if (hasUrlNoise(text)) {
    if (publishState === 'accepted') {
      publishState = 'review';
      rejectionReason = 'contains_noise_or_link';
    } else if (!rejectionReason) {
      rejectionReason = 'contains_noise_or_link';
    }
  }

  const confidenceScore = computeConfidenceScore({
    recordType,
    localityCandidates,
    bhk,
    areaSqft,
    priceNumeric: price.priceNumeric,
    buildingName,
    propertyCategory,
    dealType,
    text,
  });

  if (publishState === 'accepted' && confidenceScore < 55) {
    publishState = 'review';
    rejectionReason = 'confidence_below_public_threshold';
  }

  const title =
    publishState === 'accepted'
      ? buildTitle({
          recordType,
          dealType,
          locality,
          bhk,
          areaSqft,
          propertyCategory,
          propertyUse,
          buildingName,
        })
      : null;

  if (publishState === 'accepted' && !title) {
    publishState = 'review';
    rejectionReason = 'could_not_build_title';
  }

  const hash = createHash('sha1')
    .update(`${input.chatName}\u0000${input.timestamp}\u0000${input.sender}\u0000${input.messageIndex}\u0000${input.segmentIndex}\u0000${text}`)
    .digest('hex')
    .slice(0, 16);

  return {
    chat_name: input.chatName,
    source_file: input.sourceFile,
    source_files: input.sourceFiles,
    message_index: input.messageIndex,
    segment_index: input.segmentIndex,
    segment_count: input.segmentCount,
    timestamp: input.timestamp,
    sender,
    sender_phone: senderPhone,
    contact_phone: contactPhone,
    text,
    text_normalized: textNormalized,
    record_type: recordType,
    deal_type: dealType,
    property_category: propertyCategory,
    property_use: propertyUse,
    locality,
    locality_candidates: localityCandidates.map((candidate) => candidate.name),
    building_name: buildingName,
    bhk,
    area_sqft: areaSqft,
    price_numeric: price.priceNumeric,
    price_label: price.priceLabel || 'Price on Request',
    price_basis: price.priceBasis,
    price_confidence: price.priceConfidence,
    title,
    confidence_score: confidenceScore,
    publish_state: publishState,
    rejection_reason: rejectionReason,
    record_hash: hash,
  };
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPaths: [path.resolve('/home/vishal/Downloads/wadata')],
    outputDir: path.resolve(process.cwd(), 'reports', 'wadata-import'),
    limit: null,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--') {
      continue;
    }

    if (arg === '--input' && next) {
      options.inputPaths = next
        .split(',')
        .map((value) => path.resolve(value.trim()))
        .filter(Boolean);
      index += 1;
    } else if (arg === '--output' && next) {
      options.outputDir = path.resolve(next);
      index += 1;
    } else if (arg === '--limit' && next) {
      const value = Number(next);
      options.limit = Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function writeJsonLine(stream: fs.WriteStream, value: unknown) {
  stream.write(`${JSON.stringify(value)}\n`);
}

async function closeStream(stream: fs.WriteStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on('error', reject);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chatExports = readExports(options.inputPaths);
  if (!chatExports.length) {
    throw new Error(`No WhatsApp export files found in ${options.inputPaths.join(', ')}`);
  }

  fs.mkdirSync(options.outputDir, { recursive: true });

  const recordsPath = path.join(options.outputDir, 'records.jsonl');
  const acceptedPath = path.join(options.outputDir, 'accepted.jsonl');
  const recordsStream = fs.createWriteStream(recordsPath, { encoding: 'utf8' });
  const acceptedStream = fs.createWriteStream(acceptedPath, { encoding: 'utf8' });

  const summary: Summary = {
    generated_at: new Date().toISOString(),
    input_paths: options.inputPaths,
    source_files: chatExports.length,
    chats: chatExports.length,
    messages: 0,
    accepted: 0,
    review: 0,
    rejected: 0,
    accepted_by_type: { listing: 0, requirement: 0, junk: 0 },
    rejected_reasons: [],
    top_localities: [],
    top_chats: [],
  };

  const localityCounts = new Map<string, number>();
  const chatCounts = new Map<string, number>();
  const reasonCounts = new Map<string, number>();

  let processedMessages = 0;

  for (const chatExport of chatExports) {
    for (const [messageIndex, message] of chatExport.messages.entries()) {
      if (options.limit != null && processedMessages >= options.limit) break;
      const segments = splitMessageSegments(message.text);
      for (const [segmentIndex, segment] of segments.entries()) {
        if (options.limit != null && processedMessages >= options.limit) break;
        const record = classifyRecord({
          text: segment,
          chatName: chatExport.chatName,
          sender: message.sender,
          timestamp: message.timestamp,
          sourceFile: chatExport.fileName,
          sourceFiles: [chatExport.fileName],
          messageIndex,
          segmentIndex,
          segmentCount: segments.length,
        });

        processedMessages += 1;
        summary.messages += 1;
        summary[record.publish_state] += 1;
        summary.accepted_by_type[record.record_type] += record.publish_state === 'accepted' ? 1 : 0;

        if (record.publish_state !== 'accepted' && record.rejection_reason) {
          reasonCounts.set(record.rejection_reason, (reasonCounts.get(record.rejection_reason) || 0) + 1);
        }

        if (record.publish_state === 'accepted' && record.locality) {
          localityCounts.set(record.locality, (localityCounts.get(record.locality) || 0) + 1);
        }
        chatCounts.set(record.chat_name, (chatCounts.get(record.chat_name) || 0) + 1);

        writeJsonLine(recordsStream, record);
        if (record.publish_state === 'accepted') {
          writeJsonLine(acceptedStream, record);
        }
      }
    }
    if (options.limit != null && processedMessages >= options.limit) break;
  }

  summary.rejected_reasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  summary.top_localities = Array.from(localityCounts.entries())
    .map(([locality, count]) => ({ locality, count }))
    .sort((a, b) => b.count - a.count || a.locality.localeCompare(b.locality))
    .slice(0, 25);
  summary.top_chats = Array.from(chatCounts.entries())
    .map(([chatName, count]) => ({ chat_name: chatName, count }))
    .sort((a, b) => b.count - a.count || a.chat_name.localeCompare(b.chat_name))
    .slice(0, 25);

  if (!options.dryRun) {
    fs.writeFileSync(path.join(options.outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  }

  await Promise.all([closeStream(recordsStream), closeStream(acceptedStream)]);

  console.log(
    JSON.stringify(
      {
        input_paths: summary.input_paths,
        chats: summary.chats,
        messages: summary.messages,
        accepted: summary.accepted,
        review: summary.review,
        rejected: summary.rejected,
        output_dir: options.outputDir,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
