import crypto from 'node:crypto';
import { aiService } from './aiService';
import { browserToolService } from './browserToolService';
import { supabaseAdmin } from '../config/supabase';

type LiveIgrFetchInput = {
    buildingName?: string | null;
    locality?: string | null;
};

type LiveIgrExtraction = {
    found?: boolean;
    doc_number?: string | null;
    building_name?: string | null;
    locality?: string | null;
    registration_date?: string | null;
    consideration?: number | null;
    rent_amount?: number | null;
    deposit_amount?: number | null;
    lease_duration?: number | null;
    area_sqft?: number | null;
    district?: string | null;
    sro_office?: string | null;
    article_type?: string | null;
    transaction_type?: string | null;
    summary?: string | null;
    confidence_note?: string | null;
};

type LiveIgrFetchResult = {
    success: boolean;
    sourceUrl?: string | null;
    searchQuery?: string;
    extracted?: LiveIgrExtraction | null;
    saved?: boolean;
    docNumber?: string | null;
    error?: string | null;
};

function normalize(value?: string | null) {
    return String(value || '').trim();
}

function safeParseJson(text: string): LiveIgrExtraction | null {
    const raw = String(text || '').trim();
    if (!raw) {
        return null;
    }

    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || raw;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) {
        return null;
    }

    try {
        return JSON.parse(candidate.slice(start, end + 1)) as LiveIgrExtraction;
    } catch {
        return null;
    }
}

function buildSearchQuery(input: LiveIgrFetchInput) {
    const buildingName = normalize(input.buildingName);
    const locality = normalize(input.locality);
    return [
        buildingName ? `"${buildingName}"` : '',
        locality,
        'Maharashtra IGR OR GRAS latest transaction sale rent registration',
    ].filter(Boolean).join(' ');
}

function normalizeSourceUrl(url: string) {
    return String(url || '').trim().toLowerCase();
}

function pickCandidateUrl(items: Array<Record<string, unknown>>) {
    const preferred = items.find((item) => {
        const url = normalizeSourceUrl(String(item.url || ''));
        return url.includes('igrmaharashtra') || url.includes('igrs.maharashtra') || url.includes('registration') || url.includes('freesearchigrservice');
    });

    const fallback = items[0];
    const candidate = preferred || fallback;
    const url = normalize(String(candidate?.url || ''));
    return url || null;
}

export class IgrLiveFetchService {
    private getAdmin() {
        if (!supabaseAdmin) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for live IGR saves');
        }

        return supabaseAdmin;
    }

    async fetchAndStore(input: LiveIgrFetchInput): Promise<LiveIgrFetchResult> {
        const buildingName = normalize(input.buildingName);
        const locality = normalize(input.locality);
        const searchQuery = buildSearchQuery({ buildingName, locality });

        if (!buildingName && !locality) {
            return {
                success: false,
                error: 'Provide a building name or locality.',
                searchQuery,
            };
        }

        const searchResult = await browserToolService.execute('search_web', { query: searchQuery });
        const searchItems = Array.isArray(searchResult.data?.items) ? searchResult.data.items as Array<Record<string, unknown>> : [];
        const sourceUrl = pickCandidateUrl(searchItems);

        if (!sourceUrl) {
            return {
                success: false,
                error: 'No live IGR source URL could be found.',
                searchQuery,
                extracted: null,
                sourceUrl: null,
            };
        }

        const pageResult = await browserToolService.execute('web_fetch', { url: sourceUrl });
        const pageText = String(pageResult.message || '').trim();
        if (!pageText) {
            return {
                success: false,
                error: 'Could not read any content from the live IGR page.',
                searchQuery,
                sourceUrl,
                extracted: null,
            };
        }

        const systemPrompt = [
            'You extract Maharashtra IGR / GRAS transaction data from a fetched web page.',
            'Return valid JSON only. No markdown.',
            'If the page does not clearly show a matching transaction, set found=false and keep other fields null.',
        ].join(' ');

        const userPrompt = `Extract the live Maharashtra IGR / GRAS transaction details from the fetched page.

Return ONLY this JSON shape:
{
  "found": true | false,
  "doc_number": "string or null",
  "building_name": "string or null",
  "locality": "string or null",
  "registration_date": "string or null",
  "consideration": number or null,
  "rent_amount": number or null,
  "deposit_amount": number or null,
  "lease_duration": number or null,
  "area_sqft": number or null,
  "district": "string or null",
  "sro_office": "string or null",
  "article_type": "string or null",
  "transaction_type": "sale | rent | leave_and_license | unknown",
  "summary": "short plain English summary or null",
  "confidence_note": "string or null"
}

Requested building: ${buildingName || 'unknown'}
Requested locality: ${locality || 'unknown'}
Source URL: ${sourceUrl}

Fetched page text:
"""
${pageText.slice(0, 8000)}
"""`;

        const extraction = await aiService.chat(userPrompt, 'Auto', 'listing_parsing', undefined, systemPrompt);
        const parsed = safeParseJson(extraction.text);

        if (!parsed || parsed.found !== true) {
            return {
                success: false,
                error: 'Live IGR source found, but extraction was not confident enough to save.',
                searchQuery,
                sourceUrl,
                extracted: parsed,
            };
        }

        const docNumber = normalize(parsed.doc_number) || `live:${crypto.createHash('sha256')
            .update([sourceUrl, buildingName, locality, parsed.registration_date || '', String(parsed.consideration || '')].join('|'))
            .digest('hex')
            .slice(0, 20)}`;

        const row = {
            doc_number: docNumber,
            registration_date: parsed.registration_date || null,
            sro_office: parsed.sro_office || null,
            district: parsed.district || null,
            article_type: parsed.article_type || '25',
            consideration_amount: parsed.consideration ?? null,
            rent_amount: parsed.rent_amount ?? null,
            deposit_amount: parsed.deposit_amount ?? null,
            lease_duration: parsed.lease_duration ?? null,
            property_description: parsed.summary || null,
            building_name: parsed.building_name || buildingName || null,
            buyer_name: null,
            seller_name: null,
            village_locality: parsed.locality || locality || null,
            area_sqft: parsed.area_sqft ?? null,
            source: 'igr_live',
            scraped_at: new Date().toISOString(),
        };

        const { error } = await this.getAdmin()
            .from('igr_transactions')
            .upsert(row, { onConflict: 'doc_number' });

        if (error) {
            return {
                success: false,
                error: error.message,
                searchQuery,
                sourceUrl,
                extracted: parsed,
                docNumber,
            };
        }

        return {
            success: true,
            searchQuery,
            sourceUrl,
            extracted: parsed,
            saved: true,
            docNumber,
        };
    }
}

export const igrLiveFetchService = new IgrLiveFetchService();
