const BHK_START_PATTERN = /^\s*\d+(?:\.\d+)?\s*[- ]?\s*bhk\b|^\s*\d+(?:\.\d+)?bhk\b/i;

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

function isBhkStart(line: string) {
  return BHK_START_PATTERN.test(line.trim());
}

export function splitMultiListing(rawText: string): string[] {
  const source = String(rawText || '');
  if (!source.trim()) {
    return [source];
  }

  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const firstBhkIndex = lines.findIndex((line) => isBhkStart(line));

  if (firstBhkIndex === -1) {
    return [rawText];
  }

  const headerLines = trimTrailingBlankLines(lines.slice(0, firstBhkIndex));
  const listingLines = trimLeadingBlankLines(lines.slice(firstBhkIndex));
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of listingLines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      continue;
    }

    if (isBhkStart(line) && currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [];
    }

    currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  if (blocks.length <= 1) {
    return [rawText];
  }

  return blocks.map((block) => {
    const parts = [...headerLines, ...headerLines.length ? [''] : [], ...block];
    return `${parts.join('\n').trim()}\n`;
  });
}
