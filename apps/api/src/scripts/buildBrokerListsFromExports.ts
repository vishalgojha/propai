import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MUMBAI_LOCALITIES } from '../data/mumbai-localities';

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

type PhoneStats = {
  phone: string;
  displayName: string | null;
  senderAliases: Set<string>;
  agencyNames: Set<string>;
  sourceGroups: Set<string>;
  messageCount: number;
  senderMessageCount: number;
  explicitAreaHits: number;
  bodyMentions: number;
  brokerDetailHits: number;
  areaScores: Map<string, number>;
  areaMessageCounts: Map<string, number>;
  evidence: string[];
};

type ScriptOptions = {
  inputPaths: string[];
  outputDir: string;
  tenantId: string | null;
  upsertDb: boolean;
  dryRun: boolean;
  minAreaScore: number;
  minMessages: number;
  topAreas: number;
  strongAreaMessages: number;
};

type SerializableContact = {
  phone: string;
  display_name: string | null;
  agency_names: string[];
  inferred_areas: string[];
  source_groups: string[];
  message_count: number;
  sender_message_count: number;
  explicit_area_hits: number;
  body_mentions: number;
  broker_detail_hits: number;
  confidence: 'strong' | 'review';
  top_area_scores: Array<{ area: string; score: number }>;
  top_area_message_counts: Array<{ area: string; count: number }>;
  evidence: string[];
};

type SerializableRawContact = {
  phone: string;
  display_name: string | null;
  agency_names: string[];
  source_groups: string[];
  message_count: number;
  sender_message_count: number;
  body_mentions: number;
  broker_detail_hits: number;
  top_area_scores: Array<{ area: string; score: number }>;
  top_area_message_counts: Array<{ area: string; count: number }>;
  evidence: string[];
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

const REAL_ESTATE_KEYWORDS = [
  'available',
  'requirement',
  'rent',
  'lease',
  'sale',
  'resale',
  'bhk',
  'carpet',
  'sq ft',
  'sqft',
  'deposit',
  'possession',
  'office',
  'shop',
  'showroom',
  'commercial',
  'furnished',
  'unfurnished',
  'flat',
  'building',
  'tower',
  'client',
  'inspection',
  'exclusive',
];

const BROKER_DETAIL_KEYWORDS = [
  'call',
  'contact',
  'broker',
  'agent',
  'realtor',
  'realty',
  'estate',
  'properties',
  'property',
  'developers',
  'developer',
  'consultant',
  'channel partner',
  'cp',
  'whatsapp',
  'for more details',
  'for details',
  'if any client',
  'pls call',
  'please call',
  'dm',
];

const EXTRA_AREA_ALIASES: Array<{ needle: string; areas: string[] }> = [
  { needle: 'sobo', areas: ['South Mumbai'] },
  { needle: 'south mumbai', areas: ['South Mumbai'] },
  { needle: 'bkc', areas: ['BKC'] },
  { needle: 'western suburbs', areas: ['Western Suburbs'] },
  { needle: 'central mumbai', areas: ['Central Mumbai'] },
  { needle: 'navi mumbai', areas: ['Navi Mumbai'] },
];

const LOCALITY_INDEX = [...MUMBAI_LOCALITIES]
  .sort((a, b) => b.length - a.length)
  .map((locality) => ({
    locality,
    pattern: new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizeText(locality))}([^a-z0-9]|$)`, 'i'),
  }));

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
  if (!timeMatch) {
    return new Date().toISOString();
  }

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
  const lower = text.trim().toLowerCase();
  return MEDIA_MARKERS.some((marker) => lower.includes(marker));
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
      .map((line) => line.trim())
      .find((entry) => entry.toLowerCase().endsWith('.txt'));

    if (!textEntry) return null;

    return execFileSync('unzip', ['-p', filePath, textEntry], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function extractAreas(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const matches = new Set<string>();

  for (const entry of LOCALITY_INDEX) {
    if (entry.pattern.test(normalized)) {
      matches.add(entry.locality);
    }
  }

  for (const alias of EXTRA_AREA_ALIASES) {
    if (normalized.includes(alias.needle)) {
      for (const area of alias.areas) matches.add(area);
    }
  }

  return Array.from(matches);
}

function normalizePhone(phone: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  if (digits.length === 10) {
    return digits;
  }

  if (digits.length > 10 && digits.endsWith(digits.slice(-10))) {
    const tail = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(tail)) return tail;
  }

  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
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

function looksLikeRealEstateMessage(text: string): boolean {
  const normalized = normalizeText(text);
  return REAL_ESTATE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function countBrokerDetailHits(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) return 0;

  let hits = 0;
  for (const keyword of BROKER_DETAIL_KEYWORDS) {
    if (normalized.includes(keyword)) hits += 1;
  }

  const lineBreaks = String(text || '').split('\n').length > 1 ? 1 : 0;
  const phoneCount = extractPhones(text).length >= 1 ? 1 : 0;
  return hits + lineBreaks + phoneCount;
}

function extractAgencyNames(text: string): string[] {
  const source = String(text || '');
  if (!source) return [];

  const matches = new Set<string>();
  const patterns = [
    /\b([A-Z][A-Za-z&.\s]{2,40}\s+(?:Realty|Properties|Property|Estate|Estates|Realtors|Consultants|Developers|Homes|Infra))\b/g,
    /\b((?:M\/s\.?\s+)?[A-Z][A-Za-z&.\s]{2,40})\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1]?.replace(/\s+/g, ' ').trim();
      if (!value) continue;
      if (value.length < 4 || value.length > 48) continue;
      if (!/[A-Za-z]{3,}/.test(value)) continue;
      if (/^(Call|Contact|Requirement|Available|Rent|Lease|Sale)$/i.test(value)) continue;
      matches.add(value);
    }
  }

  return Array.from(matches).slice(0, 4);
}

function inferDisplayNameFromMessage(text: string, phone: string): string | null {
  const source = String(text || '');
  if (!source) return null;

  const normalizedPhone = phone.replace(/\D/g, '');
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!normalizePhone(line)?.endsWith(normalizedPhone) && !line.replace(/\D/g, '').includes(normalizedPhone)) {
      continue;
    }

    const previous = lines[index - 1] || '';
    const next = lines[index + 1] || '';
    for (const candidate of [previous, next]) {
      if (!candidate) continue;
      if (candidate.length > 48) continue;
      if (!/[A-Za-z]{3,}/.test(candidate)) continue;
      if (extractPhones(candidate).length > 0) continue;
      return candidate.replace(/\s+/g, ' ').trim();
    }
  }

  return null;
}

function incrementScore(stats: PhoneStats, area: string, points: number) {
  stats.areaScores.set(area, (stats.areaScores.get(area) || 0) + points);
}

function ensurePhoneStats(index: Map<string, PhoneStats>, phone: string): PhoneStats {
  const existing = index.get(phone);
  if (existing) return existing;

  const next: PhoneStats = {
    phone,
    displayName: null,
    senderAliases: new Set<string>(),
    agencyNames: new Set<string>(),
    sourceGroups: new Set<string>(),
    messageCount: 0,
    senderMessageCount: 0,
    explicitAreaHits: 0,
    bodyMentions: 0,
    brokerDetailHits: 0,
    areaScores: new Map<string, number>(),
    areaMessageCounts: new Map<string, number>(),
    evidence: [],
  };
  index.set(phone, next);
  return next;
}

function maybePushEvidence(stats: PhoneStats, value: string) {
  if (stats.evidence.length >= 5) return;
  stats.evidence.push(value.slice(0, 280));
}

function incrementAreaMessageCount(stats: PhoneStats, area: string) {
  stats.areaMessageCounts.set(area, (stats.areaMessageCounts.get(area) || 0) + 1);
}

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    inputPaths: [path.resolve('/home/vishal/Downloads/wadata')],
    outputDir: path.resolve(process.cwd(), 'reports', 'broker-context'),
    tenantId: null,
    upsertDb: false,
    dryRun: false,
    minAreaScore: 3,
    minMessages: 2,
    topAreas: 6,
    strongAreaMessages: 3,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--input' && next) {
      const values = next
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => path.resolve(value));
      if (values.length) {
        options.inputPaths = Array.from(new Set([...options.inputPaths, ...values]));
      }
      index += 1;
    } else if (arg === '--output' && next) {
      options.outputDir = path.resolve(next);
      index += 1;
    } else if (arg === '--tenant' && next) {
      options.tenantId = next.trim();
      index += 1;
    } else if (arg === '--min-area-score' && next) {
      options.minAreaScore = Math.max(1, Number(next) || 3);
      index += 1;
    } else if (arg === '--min-messages' && next) {
      options.minMessages = Math.max(1, Number(next) || 2);
      index += 1;
    } else if (arg === '--top-areas' && next) {
      options.topAreas = Math.max(1, Number(next) || 6);
      index += 1;
    } else if (arg === '--strong-area-messages' && next) {
      options.strongAreaMessages = Math.max(1, Number(next) || 3);
      index += 1;
    } else if (arg === '--upsert-db') {
      options.upsertDb = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  if (options.upsertDb && !options.tenantId) {
    throw new Error('--tenant is required when using --upsert-db');
  }

  return options;
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
    const lowerName = fileName.toLowerCase();
    const stats = fs.statSync(filePath);
    const rawText = lowerName.endsWith('.txt')
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

function buildPhoneIndex(chatExports: ChatExport[]): Map<string, PhoneStats> {
  const phoneIndex = new Map<string, PhoneStats>();

  for (const chatExport of chatExports) {
    const chatAreas = extractAreas(chatExport.chatName);
    const chatNamePhones = extractPhones(chatExport.chatName);

    for (const message of chatExport.messages) {
      const messageAreas = extractAreas(message.text);
      const combinedAreas = Array.from(new Set([...chatAreas, ...messageAreas]));
      const brokerDetailHits = countBrokerDetailHits(message.text);
      const agencyNames = extractAgencyNames(message.text);
      const isRealEstate =
        looksLikeRealEstateMessage(message.text) || combinedAreas.length > 0 || brokerDetailHits >= 2;
      if (!isRealEstate) continue;

      const senderPhone = normalizePhone(message.sender);
      const bodyPhones = extractPhones(message.text);
      const candidatePhones = new Set<string>([...chatNamePhones, ...bodyPhones]);
      if (senderPhone) candidatePhones.add(senderPhone);

      for (const phone of candidatePhones) {
        const stats = ensurePhoneStats(phoneIndex, phone);
        stats.sourceGroups.add(chatExport.chatName);
        stats.messageCount += 1;

        if (senderPhone === phone) {
          stats.senderMessageCount += 1;
          const alias = message.sender.trim();
          if (alias && !extractPhones(alias).length) {
            stats.senderAliases.add(alias);
            if (!stats.displayName) stats.displayName = alias;
          }
        } else {
          stats.bodyMentions += 1;
          const inferredName = inferDisplayNameFromMessage(message.text, phone);
          if (inferredName && !stats.displayName) stats.displayName = inferredName;
        }

        stats.brokerDetailHits += brokerDetailHits;
        for (const agencyName of agencyNames) stats.agencyNames.add(agencyName);

        for (const area of chatAreas) incrementScore(stats, area, 1);
        for (const area of messageAreas) incrementScore(stats, area, 4);
        if (brokerDetailHits >= 2) {
          for (const area of combinedAreas) incrementScore(stats, area, 2);
        }
        for (const area of combinedAreas) incrementAreaMessageCount(stats, area);
        stats.explicitAreaHits += messageAreas.length;

        if (combinedAreas.length) {
          maybePushEvidence(
            stats,
            `[${chatExport.chatName}] ${combinedAreas.join(', ')} :: ${message.text.replace(/\s+/g, ' ').trim()}`
          );
        }
      }
    }
  }

  return phoneIndex;
}

function toSerializableContacts(phoneIndex: Map<string, PhoneStats>, options: ScriptOptions): SerializableContact[] {
  return Array.from(phoneIndex.values())
    .map((stats) => {
      const topAreaScores = Array.from(stats.areaScores.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, options.topAreas)
        .map(([area, score]) => ({ area, score }));

      const topAreaMessageCounts = Array.from(stats.areaMessageCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, options.topAreas)
        .map(([area, count]) => ({ area, count }));

      const strongAreas = topAreaScores
        .filter((entry) => entry.score >= options.minAreaScore)
        .filter((entry) => (stats.areaMessageCounts.get(entry.area) || 0) >= options.strongAreaMessages);

      const reviewAreas = topAreaScores
        .filter((entry) => entry.score >= options.minAreaScore)
        .filter((entry) => (stats.areaMessageCounts.get(entry.area) || 0) >= 1);

      const inferredAreas = strongAreas.length
        ? strongAreas.map((entry) => entry.area)
        : reviewAreas.map((entry) => entry.area);

      const confidence: 'strong' | 'review' = strongAreas.length ? 'strong' : 'review';

      return {
        phone: stats.phone,
        display_name: stats.displayName,
        agency_names: Array.from(stats.agencyNames).sort(),
        inferred_areas: inferredAreas,
        source_groups: Array.from(stats.sourceGroups).sort(),
        message_count: stats.messageCount,
        sender_message_count: stats.senderMessageCount,
        explicit_area_hits: stats.explicitAreaHits,
        body_mentions: stats.bodyMentions,
        broker_detail_hits: stats.brokerDetailHits,
        confidence,
        top_area_scores: topAreaScores,
        top_area_message_counts: topAreaMessageCounts,
        evidence: stats.evidence,
      };
    })
    .filter((contact) => contact.message_count >= options.minMessages && contact.inferred_areas.length > 0)
    .sort((a, b) => {
      const areaScoreA = a.top_area_scores.reduce((sum, entry) => sum + entry.score, 0);
      const areaScoreB = b.top_area_scores.reduce((sum, entry) => sum + entry.score, 0);
      return areaScoreB - areaScoreA || b.message_count - a.message_count || a.phone.localeCompare(b.phone);
    });
}

function toSerializableRawContacts(phoneIndex: Map<string, PhoneStats>, options: ScriptOptions): SerializableRawContact[] {
  return Array.from(phoneIndex.values())
    .map((stats) => ({
      phone: stats.phone,
      display_name: stats.displayName,
      agency_names: Array.from(stats.agencyNames).sort(),
      source_groups: Array.from(stats.sourceGroups).sort(),
      message_count: stats.messageCount,
      sender_message_count: stats.senderMessageCount,
      body_mentions: stats.bodyMentions,
      broker_detail_hits: stats.brokerDetailHits,
      top_area_scores: Array.from(stats.areaScores.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, options.topAreas)
        .map(([area, score]) => ({ area, score })),
      top_area_message_counts: Array.from(stats.areaMessageCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, options.topAreas)
        .map(([area, count]) => ({ area, count })),
      evidence: stats.evidence,
    }))
    .sort((a, b) => {
      const areaScoreA = a.top_area_scores.reduce((sum, entry) => sum + entry.score, 0);
      const areaScoreB = b.top_area_scores.reduce((sum, entry) => sum + entry.score, 0);
      return areaScoreB - areaScoreA || b.message_count - a.message_count || a.phone.localeCompare(b.phone);
    });
}

function writeOutputs(outputDir: string, contacts: SerializableContact[], rawContacts: SerializableRawContact[]) {
  fs.mkdirSync(outputDir, { recursive: true });
  const listsDir = path.join(outputDir, 'lists');
  const reviewDir = path.join(outputDir, 'review');
  const rawDir = path.join(outputDir, 'raw');
  fs.mkdirSync(listsDir, { recursive: true });
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });

  const areaMap = new Map<string, SerializableContact[]>();
  const strongContacts = contacts.filter((contact) => contact.confidence === 'strong');
  const reviewContacts = contacts.filter((contact) => contact.confidence === 'review');

  for (const contact of strongContacts) {
    for (const area of contact.inferred_areas) {
      const current = areaMap.get(area) || [];
      current.push(contact);
      areaMap.set(area, current);
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    raw_unique_numbers: rawContacts.length,
    unique_contacts: contacts.length,
    strong_contacts: strongContacts.length,
    review_contacts: reviewContacts.length,
    lists: Array.from(areaMap.entries())
      .map(([area, areaContacts]) => ({
        area,
        count: areaContacts.length,
      }))
      .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area)),
  };

  fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outputDir, 'contacts.json'), JSON.stringify(contacts, null, 2));
  fs.writeFileSync(path.join(reviewDir, 'contacts-review.json'), JSON.stringify(reviewContacts, null, 2));
  fs.writeFileSync(path.join(rawDir, 'all-numbers.json'), JSON.stringify(rawContacts, null, 2));

  for (const [area, areaContacts] of areaMap.entries()) {
    const payload = {
      list_name: `${area} Brokers`,
      source: 'whatsapp_export_context',
      contacts: areaContacts.map((contact) => ({
        name: contact.display_name || contact.phone,
        phone: contact.phone,
        locality: area,
      })),
    };

    const safeName = area.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    fs.writeFileSync(path.join(listsDir, `${safeName || 'unknown-area'}.json`), JSON.stringify(payload, null, 2));
  }
}

async function upsertToDb(tenantId: string, contacts: SerializableContact[]) {
  const [{ supabaseAdmin }, { generateBroadcastLists }] = await Promise.all([
    import('../config/supabase'),
    import('../services/broadcastListGenerator'),
  ]);

  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for --upsert-db');
  }

  for (const contact of contacts.filter((entry) => entry.confidence === 'strong')) {
    const { data: existing } = await supabaseAdmin
      .from('broker_contacts')
      .select('id, inferred_areas, source_groups, group_count, display_name')
      .eq('tenant_id', tenantId)
      .eq('phone', contact.phone)
      .maybeSingle();

    const mergedAreas = Array.from(
      new Set([...(existing?.inferred_areas || []), ...contact.inferred_areas]),
    );
    const mergedGroups = Array.from(
      new Set([...(existing?.source_groups || []), ...contact.source_groups]),
    );

    const payload = {
      tenant_id: tenantId,
      phone: contact.phone,
      display_name: existing?.display_name || contact.display_name || null,
      inferred_areas: mergedAreas,
      source_groups: mergedGroups,
      group_count: mergedGroups.length,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('broker_contacts')
      .upsert(payload, { onConflict: 'tenant_id,phone' });
  }

  await generateBroadcastLists(tenantId);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chatExports = readExports(options.inputPaths);
  if (!chatExports.length) {
    throw new Error(`No WhatsApp export files found in ${options.inputPaths.join(', ')}`);
  }

  const phoneIndex = buildPhoneIndex(chatExports);
  const contacts = toSerializableContacts(phoneIndex, options);
  const rawContacts = toSerializableRawContacts(phoneIndex, options);

  writeOutputs(options.outputDir, contacts, rawContacts);

  console.log(`Scanned ${chatExports.length} chats from ${options.inputPaths.length} input path(s)`);
  console.log(`Detected ${rawContacts.length} raw numbers`);
  console.log(`Detected ${contacts.length} contextual broker contacts`);
  console.log(`Wrote summary and area lists to ${options.outputDir}`);

  if (options.upsertDb && !options.dryRun && options.tenantId) {
    await upsertToDb(options.tenantId, contacts);
    console.log(`Upserted contacts and regenerated broadcast lists for tenant ${options.tenantId}`);
  } else if (options.upsertDb && options.dryRun) {
    console.log('Skipped DB upsert because --dry-run was provided');
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
