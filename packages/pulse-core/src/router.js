export function chooseModel(text) {
  const source = text || '';
  const numberMatches = source.match(/\d+/g) || [];

  if (source.length > 200 || numberMatches.length > 5) {
    return 'qwen3:14b';
  }

  return 'qwen3:14b';
}
