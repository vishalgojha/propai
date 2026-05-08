import crypto from 'crypto';
import { historyBatchService } from './historyBatchService';

type ParsedTextMessage = {
  sender: string;
  text: string;
  timestamp: string;
};

type ImportOptions = {
  tenantId: string;
  rawText: string;
  fileName?: string | null;
  sessionLabel?: string | null;
  forceProcess?: boolean;
  onProgress?: (progress: {
    total: number;
    processed: number;
    listings: number;
    leads: number;
    parsed: number;
    skipped: number;
    failed: number;
  }) => void;
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

function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'history-import';
}

function parseDateTime(datePart: string, timePart: string) {
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

  if (year < 100) {
    year += 2000;
  }

  const timeMatch = timePart.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([APap][Mm]))?$/);
  if (!timeMatch) {
    return new Date().toISOString();
  }

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const meridiem = timeMatch[3]?.toLowerCase() || null;

  if (meridiem === 'pm' && hours < 12) {
    hours += 12;
  } else if (meridiem === 'am' && hours === 12) {
    hours = 0;
  }

  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

function parseLine(line: string): { timestamp: string; body: string } | null {
  for (const pattern of START_PATTERNS) {
    const match = line.match(pattern);
    if (!match?.groups?.date || !match.groups.time || !match.groups.body) {
      continue;
    }

    return {
      timestamp: parseDateTime(match.groups.date, match.groups.time),
      body: match.groups.body.trim(),
    };
  }

  return null;
}

function isSkippableText(text: string) {
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
      if (colonIndex <= 0) {
        continue;
      }

      const sender = parsed.body.slice(0, colonIndex).trim();
      const text = parsed.body.slice(colonIndex + 2).trim();
      if (!sender || !text || isSkippableText(text)) {
        continue;
      }

      current = {
        sender,
        text,
        timestamp: parsed.timestamp,
      };
      continue;
    }

    if (current && line.trim()) {
      current.text = `${current.text}\n${line.trim()}`.trim();
    }
  }

  flush();
  return messages;
}

function buildRemoteJid(fileName: string | null | undefined, messages: ParsedTextMessage[]) {
  const senderCount = new Set(messages.map((message) => message.sender.toLowerCase())).size;
  const isGroupLike = senderCount > 1;
  const suffix = isGroupLike ? '@g.us' : '@s.whatsapp.net';
  const base = slugify(fileName || 'history-import');
  return `history-${base}${suffix}`;
}

export class HistoryTextImportService {
  async importTxt(options: ImportOptions) {
    const { tenantId, rawText, fileName, sessionLabel, onProgress, forceProcess = false } = options;
    const messages = parseMessages(rawText);

    if (!messages.length) {
      throw new Error('No WhatsApp messages were found in that TXT file.');
    }

    const remoteJid = buildRemoteJid(fileName, messages);
    const sourceLabel = sessionLabel || fileName || 'txt-import';
    const historyMessages = messages.map((message, index) => ({
      id: crypto.createHash('sha1').update(`${remoteJid}:${message.timestamp}:${index}:${message.sender}:${message.text}`).digest('hex'),
      remoteJid,
      sender: message.sender,
      messageTimestamp: message.timestamp,
      message: {
        conversation: message.text,
      },
    }));

    return historyBatchService.processHistoryBatch({
      tenantId,
      sessionLabel: String(sourceLabel),
      messages: historyMessages,
      forceProcess,
      onProgress,
    });
  }
}

export const historyTextImportService = new HistoryTextImportService();
