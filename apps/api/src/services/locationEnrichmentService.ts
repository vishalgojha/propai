import axios from 'axios';
import { aiService } from './aiService';
import { supabaseAdmin } from '../config/supabase';

type LocationCacheRow = {
  building_name: string;
  locality: string;
  city: string;
  pincode: string | null;
  source: string;
  created_at: string;
};

type EnrichLocationInput = {
  buildingName: string;
  rawHint?: string | null;
};

type EnrichedLocation = {
  locality: string;
  city: string;
  pincode?: string | null;
  source?: string | null;
  cached: boolean;
};

type LocationEnrichmentResult = {
  success: boolean;
  locality: string | null;
  city: string | null;
  pincode?: string | null;
  source?: string | null;
  cached?: boolean;
  saved?: boolean;
  error?: string | null;
};

type ProviderName = 'Google' | 'Groq' | 'Doubleword' | 'OpenRouter';

const GOOGLE_MODEL = process.env.GOOGLE_MODEL || 'gemini-2.5-flash';
const GOOGLE_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

function normalizeBuildingName(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s,.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeParseJson(text: string): { locality: string; city: string; pincode?: string | null } | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    const locality = String(parsed.locality || '').trim();
    const city = String(parsed.city || '').trim();
    const pincode = parsed.pincode == null ? null : String(parsed.pincode).trim() || null;
    if (!locality || !city) return null;
    return { locality, city, pincode };
  } catch {
    return null;
  }
}

function extractGeminiText(payload: any) {
  const candidate = payload?.candidates?.[0];
  if (!candidate) return '';

  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const joined = parts
    .map((part: any) => String(part?.text || ''))
    .join('\n')
    .trim();

  if (joined) {
    return joined;
  }

  const text = String(candidate?.content?.text || '').trim();
  return text;
}

function getService() {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for location enrichment');
  }
  return supabaseAdmin;
}

export class LocationEnrichmentService {
  async detectLocality(text: string): Promise<string | null> {
    const normalizedText = normalizeSearchText(text);
    if (!normalizedText) {
      return null;
    }

    const rows = await this.loadCacheRows();
    for (const row of rows) {
      const locality = String(row.locality || '').trim();
      if (!locality) {
        continue;
      }

      const normalizedLocality = normalizeSearchText(locality);
      if (!normalizedLocality) {
        continue;
      }

      const aliasMatch =
        normalizedText === normalizedLocality ||
        normalizedText.includes(normalizedLocality) ||
        normalizedLocality.includes(normalizedText);

      if (aliasMatch) {
        return locality;
      }
    }

    return null;
  }

  async enrichLocation(input: EnrichLocationInput): Promise<LocationEnrichmentResult> {
    const buildingName = normalizeBuildingName(input.buildingName);
    const rawHint = String(input.rawHint || '').trim();

    if (!buildingName) {
      return {
        success: false,
        locality: null,
        city: null,
        error: 'buildingName is required',
      };
    }

    const cachedBuilding = await this.findByBuildingName(buildingName);
    if (cachedBuilding) {
      return {
        success: true,
        locality: cachedBuilding.locality,
        city: cachedBuilding.city,
        pincode: cachedBuilding.pincode,
        source: cachedBuilding.source,
        cached: true,
      };
    }

    const knownLocality = await this.detectLocality(rawHint || buildingName);
    if (knownLocality) {
      const cachedByLocality = await this.findByLocality(knownLocality);
      if (cachedByLocality) {
        return {
          success: true,
          locality: cachedByLocality.locality,
          city: cachedByLocality.city,
          pincode: cachedByLocality.pincode,
          source: cachedByLocality.source,
          cached: true,
        };
      }
    }

    const prompt = [
      `What locality in Mumbai is '${buildingName}' in?`,
      'JSON only, no markdown.',
      'Return exactly this shape:',
      '{locality, city, pincode}',
      rawHint ? `Raw hint: ${rawHint}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const systemPrompt = [
      'You resolve building and landmark names to Mumbai locality data.',
      'Return valid JSON only.',
      'If unsure, still return your best locality and city guess, or null strings if nothing sensible can be inferred.',
    ].join(' ');

    const providers: ProviderName[] = ['Google', 'Groq', 'Doubleword', 'OpenRouter'];
    const attempted: Array<{ provider: ProviderName; error: string }> = [];

    for (const provider of providers) {
      try {
        const extracted = provider === 'Google'
          ? await this.callGemini(prompt, systemPrompt)
          : await this.callModel(prompt, provider, systemPrompt);

        if (!extracted) {
          throw new Error('No JSON response');
        }

        const saved = await this.saveLocationCache({
          buildingName,
          locality: extracted.locality,
          city: extracted.city,
          pincode: extracted.pincode || null,
          source: provider.toLowerCase(),
        });

        return {
          success: true,
          locality: extracted.locality,
          city: extracted.city,
          pincode: extracted.pincode || null,
          source: provider.toLowerCase(),
          cached: false,
          saved,
        };
      } catch (error) {
        attempted.push({
          provider,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: false,
      locality: null,
      city: null,
      error: attempted.map((entry) => `${entry.provider}: ${entry.error}`).join(' | ') || 'Unable to enrich location',
    };
  }

  private async callGemini(prompt: string, systemPrompt?: string) {
    if (!GOOGLE_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        systemInstruction: systemPrompt
          ? { parts: [{ text: systemPrompt }] }
          : undefined,
        tools: [{ googleSearch: {} }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      },
      {
        timeout: 30000,
      },
    );

    const text = extractGeminiText(response.data);
    return safeParseJson(text);
  }

  private async callModel(prompt: string, provider: ProviderName, systemPrompt?: string) {
    const response = await aiService.chat(prompt, provider, 'listing_parsing', undefined, systemPrompt);
    return safeParseJson(response.text);
  }

  private async loadCacheRows(): Promise<LocationCacheRow[]> {
    const { data, error } = await getService()
      .from('location_cache')
      .select('building_name, locality, city, pincode, source, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      throw new Error(error.message);
    }

    return (data || []) as LocationCacheRow[];
  }

  private async findByBuildingName(buildingName: string): Promise<LocationCacheRow | null> {
    const { data, error } = await getService()
      .from('location_cache')
      .select('building_name, locality, city, pincode, source, created_at')
      .eq('building_name', buildingName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }

    return (data as LocationCacheRow | null) || null;
  }

  private async findByLocality(locality: string): Promise<LocationCacheRow | null> {
    const { data, error } = await getService()
      .from('location_cache')
      .select('building_name, locality, city, pincode, source, created_at')
      .ilike('locality', locality)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(error.message);
    }

    return (data as LocationCacheRow | null) || null;
  }

  private async saveLocationCache(input: {
    buildingName: string;
    locality: string;
    city: string;
    pincode?: string | null;
    source: string;
  }): Promise<boolean> {
    const row = {
      building_name: input.buildingName,
      locality: input.locality,
      city: input.city,
      pincode: input.pincode || null,
      source: input.source,
    };

    const existing = await this.findByBuildingName(input.buildingName);
    if (existing) {
      const { error } = await getService()
        .from('location_cache')
        .update(row)
        .eq('building_name', input.buildingName);

      if (error) {
        throw new Error(error.message);
      }
      return true;
    }

    const { error } = await getService()
      .from('location_cache')
      .insert(row);

    if (error) {
      throw new Error(error.message);
    }

    return true;
  }
}

export const locationEnrichmentService = new LocationEnrichmentService();
