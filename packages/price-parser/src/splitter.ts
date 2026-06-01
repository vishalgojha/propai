const BHK_PATTERN = /\b\d+(?:\.\d+)?\s*[- ]?\s*bhk\b|\b\d+(?:\.\d+)?bhk\b/i;
const BHK_PATTERN_GLOBAL = /\b\d+(?:\.\d+)?\s*[- ]?\s*bhk\b|\b\d+(?:\.\d+)?bhk\b/gi;
const PRICE_PATTERN_GLOBAL = /(?:₹|rs\.?|inr)?\s*\d+(?:\.\d+)?\s*(?:cr|crore|crores|lakh|lakhs|lac|lacs|l|k|thousand)\b/gi;
const NUMBERED_PATTERN = /^\s*(?:\d+[\.\)]|[•▪►➜➤])\s*/i;
const FLOOR_BHK_PATTERN = /\b\d{1,2}(?:st|nd|rd|th)?\s+floor\b.*\b\d+(?:\.\d+)?\s*bhk\b/i;
const OPTIONS_PATTERN = /\b(?:multiple options|various options)\b/i;
const RENT_MARKER_PATTERN = /\b(?:rent|lease|leave and license|leave & license|l&l|ll)\b/i;
const SALE_MARKER_PATTERN = /\b(?:sale|outright)\b/i;
const DEAL_MARKER_PATTERN = /\b(?:rent|lease|leave and license|leave & license|l&l|ll|sale|outright)\b/i;

function normalizeText(text: string) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function trimTrailingBlankLines(lines: string[]) {
  const result = [...lines];
  while (result.length > 0 && !result[result.length - 1].trim()) {
    result.pop();
  }
  return result;
}

function trimLeadingBlankLines(lines: string[]) {
  const result = [...lines];
  while (result.length > 0 && !result[0].trim()) {
    result.shift();
  }
  return result;
}

function countMatches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length;
}

function hasMultipleDistinctPrices(text: string) {
  const matches = [...text.matchAll(PRICE_PATTERN_GLOBAL)].map((match) => match[0].trim().toLowerCase());
  return new Set(matches).size >= 2;
}

function isMultiListing(text: string) {
  const hasPipeSeparator = text.includes('|') && (countMatches(text, BHK_PATTERN_GLOBAL) >= 2 || hasMultipleDistinctPrices(text));
  const hasCommaSeparator = text.includes(',') && (() => {
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    return parts.filter((p) => BHK_PATTERN.test(p)).length >= 2;
  })();
  return (
    countMatches(text, BHK_PATTERN_GLOBAL) >= 2 ||
    hasMultipleDistinctPrices(text) ||
    NUMBERED_PATTERN.test(text) ||
    hasPipeSeparator ||
    hasCommaSeparator ||
    OPTIONS_PATTERN.test(text)
  );
}

function stripNumberPrefix(line: string) {
  return line.replace(NUMBERED_PATTERN, '').trim();
}

function isListingStart(line: string) {
  const cleaned = stripNumberPrefix(line);
  if (FLOOR_BHK_PATTERN.test(cleaned)) return true;
  if (BHK_PATTERN.test(cleaned)) return true;
  return false;
}

function splitInlineUnits(line: string) {
  if (line.includes('|')) {
    const bhkCount = countMatches(line, BHK_PATTERN_GLOBAL);
    if (bhkCount >= 2 || FLOOR_BHK_PATTERN.test(line)) {
      return line
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }

  if (line.includes(',')) {
    const parts = line.split(',').map((part) => part.trim()).filter(Boolean);
    const bhkParts = parts.filter((part) => BHK_PATTERN.test(part));
    if (bhkParts.length >= 2) {
      return bhkParts;
    }
  }

  const bhkMatches = [...line.matchAll(BHK_PATTERN_GLOBAL)];
  if (bhkMatches.length >= 2) {
    const repeatedBhkChunks = bhkMatches
      .map((match, index) => {
        const start = match.index ?? 0;
        const end = bhkMatches[index + 1]?.index ?? line.length;
        return line.slice(start, end).trim();
      })
      .filter(Boolean);

    if (repeatedBhkChunks.length >= 2) {
      return repeatedBhkChunks;
    }
  }

  return [line];
}

function buildListingBlocks(listingLines: string[]) {
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const rawLine of listingLines) {
    const line = rawLine.trim();

    if (!line) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      continue;
    }

    const unitParts = splitInlineUnits(line);
    for (const part of unitParts) {
      const cleanedPart = stripNumberPrefix(part);
      if (isListingStart(cleanedPart) && currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      currentBlock.push(cleanedPart);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function withHeader(headerLines: string[], bodyLines: string[]) {
  const parts = [...headerLines, ...headerLines.length ? [''] : [], ...bodyLines];
  return `${parts.join('\n').trim()}\n`;
}

function inferSharedPrefix(chunk: string) {
  const dealIndex = chunk.search(DEAL_MARKER_PATTERN);
  if (dealIndex <= 0) {
    return '';
  }

  const prefix = chunk.slice(0, dealIndex).trim();
  return BHK_PATTERN.test(prefix) || FLOOR_BHK_PATTERN.test(prefix) ? prefix : '';
}

function expandDealVariants(text: string) {
  const lines = normalizeText(text).split('\n');
  const expandedVariants: string[] = [];
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes('|')) {
      continue;
    }

    if (!RENT_MARKER_PATTERN.test(line) || !SALE_MARKER_PATTERN.test(line) || countMatches(line, BHK_PATTERN_GLOBAL) > 1) {
      continue;
    }

    const chunks = line.split('|').map((part) => part.trim()).filter(Boolean);
    if (chunks.length < 2) {
      continue;
    }

    const sharedPrefix = inferSharedPrefix(chunks[0]);
    const variants = chunks.map((chunk, index) => {
      if (index === 0) {
        return chunk;
      }
      if (!BHK_PATTERN.test(chunk) && !FLOOR_BHK_PATTERN.test(chunk) && sharedPrefix) {
        return `${sharedPrefix} ${chunk}`.trim();
      }
      return chunk;
    });

    const header = lines.slice(0, i);
    const footer = lines.slice(i + 1);
    for (const variant of variants) {
      expandedVariants.push([...header, variant, ...footer].join('\n').trim() + '\n');
    }
    changed = true;
    break;
  }

  return changed ? expandedVariants : [text];
}

export function splitMultiListing(rawText: string): string[] {
  const source = normalizeText(rawText);
  if (!source.trim()) {
    return [source];
  }

  if (!isMultiListing(source)) {
    return [rawText];
  }

  const lines = source.split('\n');
  const firstListingIndex = lines.findIndex((line) => isListingStart(line) || splitInlineUnits(line).some((part) => isListingStart(part)));

  if (firstListingIndex === -1) {
    return [rawText];
  }

  const headerLines = trimTrailingBlankLines(lines.slice(0, firstListingIndex));
  const listingLines = trimLeadingBlankLines(lines.slice(firstListingIndex));
  const blocks = buildListingBlocks(listingLines);

  if (blocks.length <= 1) {
    return expandDealVariants(withHeader(headerLines, listingLines));
  }

  return blocks.flatMap((block) => expandDealVariants(withHeader(headerLines, block)));
}
