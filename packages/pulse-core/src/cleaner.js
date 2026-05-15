export function cleanMessage(text) {
  const original = typeof text === 'string' ? text : '';
  const normalized = original
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    original,
    cleaned: normalized,
    lowercase: normalized.toLowerCase(),
  };
}
