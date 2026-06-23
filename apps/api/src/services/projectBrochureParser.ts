import { aiService } from './aiService';
import { decodeBase64Payload, extractPdfText } from '../utils/fileTextExtraction';

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_LLM_INPUT_CHARS = 24_000;

export type ParsedProjectBrochure = {
  name?: string;
  developer_name?: string;
  description?: string;
  locality?: string;
  city?: string;
  status?: 'upcoming' | 'ongoing' | 'ready-possession' | 'completed';
  rera_number?: string;
  possession_date?: string | null;
  configurations?: string[];
  amenities?: string[];
  total_towers?: number | null;
  total_floors?: number | null;
  total_units?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  floor_plans?: Array<{ bhk: string; area: number; image?: string | null }>;
  contacts?: Array<{
    name: string;
    role?: string;
    phone?: string;
    email?: string;
    whatsapp_phone?: string;
  }>;
  parse_notes?: string | null;
};

function parseJsonBlock(raw: string): ParsedProjectBrochure | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as ParsedProjectBrochure;
  } catch {
    return null;
  }
}

function normalizeStatus(value: unknown): ParsedProjectBrochure['status'] | undefined {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'upcoming' || status === 'ongoing' || status === 'ready-possession' || status === 'completed') {
    return status;
  }
  if (status.includes('ready')) return 'ready-possession';
  if (status.includes('complete')) return 'completed';
  if (status.includes('ongoing') || status.includes('under construction')) return 'ongoing';
  return undefined;
}

function normalizeParsed(input: ParsedProjectBrochure | null): ParsedProjectBrochure {
  if (!input) return { parse_notes: 'Could not parse brochure structure.' };

  return {
    name: String(input.name || '').trim() || undefined,
    developer_name: String(input.developer_name || '').trim() || undefined,
    description: String(input.description || '').trim() || undefined,
    locality: String(input.locality || '').trim() || undefined,
    city: String(input.city || 'Mumbai').trim() || 'Mumbai',
    status: normalizeStatus(input.status),
    rera_number: String(input.rera_number || '').trim() || undefined,
    possession_date: input.possession_date ? String(input.possession_date).trim() : undefined,
    configurations: Array.isArray(input.configurations)
      ? input.configurations.map((item) => String(item || '').trim()).filter(Boolean)
      : undefined,
    amenities: Array.isArray(input.amenities)
      ? input.amenities.map((item) => String(item || '').trim()).filter(Boolean)
      : undefined,
    total_towers: Number.isFinite(Number(input.total_towers)) ? Number(input.total_towers) : undefined,
    total_floors: Number.isFinite(Number(input.total_floors)) ? Number(input.total_floors) : undefined,
    total_units: Number.isFinite(Number(input.total_units)) ? Number(input.total_units) : undefined,
    latitude: Number.isFinite(Number(input.latitude)) ? Number(input.latitude) : undefined,
    longitude: Number.isFinite(Number(input.longitude)) ? Number(input.longitude) : undefined,
    floor_plans: Array.isArray(input.floor_plans)
      ? input.floor_plans
          .map((plan) => ({
            bhk: String(plan?.bhk || '').trim(),
            area: Number(plan?.area),
            image: plan?.image ? String(plan.image).trim() : undefined,
          }))
          .filter((plan) => plan.bhk && Number.isFinite(plan.area) && plan.area > 0)
      : undefined,
    contacts: Array.isArray(input.contacts)
      ? input.contacts
          .map((contact) => ({
            name: String(contact?.name || '').trim(),
            role: String(contact?.role || 'Sales Manager').trim(),
            phone: String(contact?.phone || '').trim() || undefined,
            email: String(contact?.email || '').trim() || undefined,
            whatsapp_phone: String(contact?.whatsapp_phone || contact?.phone || '').trim() || undefined,
          }))
          .filter((contact) => contact.name)
      : undefined,
    parse_notes: input.parse_notes ? String(input.parse_notes).trim() : undefined,
  };
}

export async function parseProjectBrochurePdf(input: {
  base64: string;
  fileName?: string;
  tenantId?: string;
}) {
  const buffer = decodeBase64Payload(input.base64);
  if (!buffer.length) {
    throw new Error('Empty PDF payload');
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error('PDF is too large. Please upload a brochure under 12 MB.');
  }

  const extractedText = await extractPdfText(buffer);
  if (!extractedText) {
    throw new Error('Could not extract text from this PDF. Try a text-based brochure or a smaller file.');
  }

  const brochureText = extractedText.length > MAX_LLM_INPUT_CHARS
    ? `${extractedText.slice(0, MAX_LLM_INPUT_CHARS)}\n\n[Truncated for parsing]`
    : extractedText;

  const systemPrompt = `You extract structured real estate project data from developer brochures.
Return valid JSON only. No markdown. Use null for unknown fields.`;

  const userPrompt = `Extract project details from this brochure text for a Mumbai/India real estate project hub.

Return ONLY this JSON:
{
  "name": "string or null",
  "developer_name": "string or null",
  "description": "string or null",
  "locality": "string or null",
  "city": "string or null",
  "status": "upcoming | ongoing | ready-possession | completed | null",
  "rera_number": "string or null",
  "possession_date": "YYYY-MM-DD or null",
  "configurations": ["2 BHK", "3 BHK"],
  "amenities": ["Swimming Pool", "Gym"],
  "total_towers": number or null,
  "total_floors": number or null,
  "total_units": number or null,
  "latitude": number or null,
  "longitude": number or null,
  "floor_plans": [{"bhk": "3 BHK", "area": 1200}],
  "contacts": [{"name": "string", "role": "string", "phone": "string", "email": "string", "whatsapp_phone": "string"}],
  "parse_notes": "string or null"
}

Brochure file: ${input.fileName || 'brochure.pdf'}

Brochure text:
"""
${brochureText}
"""`;

  const response = await aiService.chat(
    userPrompt,
    'Auto',
    'listing_parsing',
    input.tenantId,
    systemPrompt,
  );

  const parsed = normalizeParsed(parseJsonBlock(response.text));

  return {
    project: parsed,
    extractedChars: extractedText.length,
    model: response.model,
    usage: response.usage || null,
  };
}
