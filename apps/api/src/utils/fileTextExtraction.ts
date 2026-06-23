const MAX_EXTRACTED_TEXT_CHARS = 120_000;

export async function extractPdfText(buffer: Buffer) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    const text = String(result?.text || '').trim();
    if (!text) return null;
    return text.length > MAX_EXTRACTED_TEXT_CHARS
      ? `${text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n[Truncated]`
      : text;
  } catch {
    return null;
  }
}

export function decodeBase64Payload(payload: string) {
  const cleaned = payload.includes(',') ? payload.slice(payload.indexOf(',') + 1) : payload;
  return Buffer.from(cleaned, 'base64');
}
