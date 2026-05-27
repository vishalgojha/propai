import { supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ParsedQuery {
    bhk: string | null;
    type: 'Rent' | 'Sale' | 'Requirement' | 'Pre-leased' | null;
    minPrice: number | null;
    maxPrice: number | null;
    minArea: number | null;
    maxArea: number | null;
    furnishing: string | null;
    locality: string | null;
    building: string | null;
    tags: string[];
    rawTerms: string[];
}

export interface FuzzySuggestion {
    suggestion: string;
    termType: string;
    similarity: number;
}

export interface SearchFilters {
    assetClass: 'residential' | 'commercial';
    parsed: ParsedQuery;
    suggestions: FuzzySuggestion[];
    limit: number;
    offset: number;
}

export interface SearchResult {
    items: Record<string, unknown>[];
    total: number;
    suggestions: FuzzySuggestion[];
}

// ── Price normalization ────────────────────────────────────────────────────

const parsePriceValue = (num: number, unit: string): number | null => {
    const u = unit.toLowerCase();
    if (u.includes('cr') || u.includes('crore')) return num * 10000000;
    if (u.includes('lac') || u.includes('lakh')) return num * 100000;
    if (u.includes('k') || u.includes('thousand')) return num * 1000;
    if (u.includes('month') || u.includes('mo')) return num;
    return num;
};

// ── Regex Query Parser ─────────────────────────────────────────────────────

export function parseSearchQuery(query: string): ParsedQuery {
    const text = query.trim();
    const lower = text.toLowerCase();
    const result: ParsedQuery = {
        bhk: null,
        type: null,
        minPrice: null,
        maxPrice: null,
        minArea: null,
        maxArea: null,
        furnishing: null,
        locality: null,
        building: null,
        tags: [],
        rawTerms: [],
    };

    // BHK: "3bhk", "3 bhk", "3bed", "4+ bhk"
    const bhkMatch = lower.match(/(\d[\+]?)\s*(?:bhk|bed|bedroom|bhk)/i);
    if (bhkMatch) result.bhk = bhkMatch[1].replace('+', '+ ');

    // Type
    if (/\b(rent|lease|rental)\b/i.test(lower) && !/\b(outright|sale|buy)\b/i.test(lower)) {
        result.type = 'Rent';
    } else if (/\b(sale|outright|buy|purchase)\b/i.test(lower)) {
        result.type = 'Sale';
    } else if (/\b(pre[- ]leased|preleased)\b/i.test(lower)) {
        result.type = 'Pre-leased';
    } else if (/\b(require|want|looking|search|need|client)\b/i.test(lower)) {
        result.type = 'Requirement';
    }

    // Price: "under 1.5L", "upto 2cr", "above 50k", "between 1cr and 2cr", "1.5L"
    const pricePatterns = [
        { regex: /(?:under|below|upto|up to|max)\s*([\d.]+)\s*(cr|lac|lakh|k|thousand|crore|month|mo)/i, type: 'max' as const },
        { regex: /(?:above|over|min|from|starting)\s*([\d.]+)\s*(cr|lac|lakh|k|thousand|crore|month|mo)/i, type: 'min' as const },
        { regex: /between\s*([\d.]+)\s*(cr|lac|lakh|k|thousand|crore)\s*(?:and|to|[-–—])\s*([\d.]+)\s*(cr|lac|lakh|k|thousand|crore)/i, type: 'range' as const },
        { regex: /([\d.]+)\s*(cr|lac|lakh|k|thousand|crore)\s*(?:rent|price|budget|cost)/i, type: 'exact' as const },
    ];

    for (const pattern of pricePatterns) {
        const match = lower.match(pattern.regex);
        if (match) {
            if (pattern.type === 'max') {
                result.maxPrice = parsePriceValue(parseFloat(match[1]), match[2]);
            } else if (pattern.type === 'min') {
                result.minPrice = parsePriceValue(parseFloat(match[1]), match[2]);
            } else if (pattern.type === 'range') {
                result.minPrice = parsePriceValue(parseFloat(match[1]), match[2]);
                result.maxPrice = parsePriceValue(parseFloat(match[3]), match[4]);
            } else if (pattern.type === 'exact') {
                const price = parsePriceValue(parseFloat(match[1]), match[2]);
                result.maxPrice = price;
                result.minPrice = price ? price * 0.8 : null;
            }
            break;
        }
    }

    // Area: "1000 sqft", "above 800 sq ft", "under 1500 sqft"
    const areaMax = lower.match(/(?:under|below|upto|up to|max)\s*([\d,]+)\s*(?:sqft|sq\.?ft|sq\s*feet|square\s*feet)/i);
    const areaMin = lower.match(/(?:above|over|min|from|starting)\s*([\d,]+)\s*(?:sqft|sq\.?ft|sq\s*feet|square\s*feet)/i);
    const areaExact = lower.match(/([\d,]+)\s*(?:sqft|sq\.?ft|sq\s*feet|square\s*feet)/i);
    if (areaMax) result.maxArea = parseFloat(areaMax[1].replace(/,/g, ''));
    else if (areaMin) result.minArea = parseFloat(areaMin[1].replace(/,/g, ''));
    else if (areaExact) result.minArea = parseFloat(areaExact[1].replace(/,/g, '')) * 0.8;

    // Furnishing
    if (/\b(unfurnished|semi[- ]?furnished|fully[- ]?furnished|furnished|bare[- ]?shell|bare shell|turnkey)\b/i.test(lower)) {
        const furnMatch = lower.match(/\b(unfurnished|semi[- ]?furnished|fully[- ]?furnished|furnished|bare[- ]?shell|bare shell|turnkey)\b/i);
        if (furnMatch) result.furnishing = furnMatch[1].replace(/[- ]/g, '-');
    }

    // Tags
    const tagPatterns = [
        { regex: /\b(ready\s*to\s*move|ready\s*possession|immediate)\b/i, tag: 'ready_to_move' },
        { regex: /\b(new\s*launch|under\s*construction)\b/i, tag: 'new_launch' },
        { regex: /\b(redevelop|redevelopment)\b/i, tag: 'redevelopment' },
        { regex: /\b(loan|home\s*loan|finance)\b/i, tag: 'loan_available' },
        { regex: /\b(vastu)\b/i, tag: 'vastu' },
        { regex: /\b(parking)\b/i, tag: 'parking' },
        { regex: /\b(balcony)\b/i, tag: 'balcony' },
    ];
    for (const { regex, tag } of tagPatterns) {
        if (regex.test(lower)) result.tags.push(tag);
    }

    // Remaining text after extracting structured terms = raw search terms
    const stripped = text
        .replace(/\b(rent|lease|rental|sale|outright|buy|purchase|pre[- ]leased|preleased|require|want|looking|search|need|client)\b/gi, '')
        .replace(/\b(under|below|upto|up to|above|over|min|from|starting|between|and|to)\b/gi, '')
        .replace(/\b(unfurnished|semi[- ]?furnished|fully[- ]?furnished|furnished|bare[- ]?shell|turnkey)\b/gi, '')
        .replace(/\b(ready\s*to\s*move|ready\s*possession|immediate|new\s*launch|under\s*construction|redevelop|redevelopment|loan|home\s*loan|finance|vastu|parking|balcony)\b/gi, '')
        .replace(/[\d.]+\s*(?:cr|lac|lakh|k|thousand|crore|bhk|bed|bedroom|sqft|sq\.?ft|sq\s*feet)/gi, '')
        .replace(/[^\p{L}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (stripped.length > 1) {
        result.rawTerms = stripped.split(' ').filter(t => t.length >= 2);
    }

    return result;
}

// ── Fuzzy Matching ─────────────────────────────────────────────────────────

export async function getFuzzySuggestions(query: string, maxResults = 3): Promise<FuzzySuggestion[]> {
    if (!db) return [];

    const terms = query.trim().split(/\s+/).filter(t => t.length >= 3);
    const suggestions: FuzzySuggestion[] = [];

    for (const term of terms.slice(0, 3)) {
        try {
            const { data } = await db
                .rpc('fuzzy_search_suggestions', {
                    search_term: term,
                    min_similarity: 0.3,
                    max_results: maxResults,
                });

            if (data) {
                for (const row of data) {
                    suggestions.push({
                        suggestion: row.suggestion,
                        termType: row.term_type,
                        similarity: row.similarity_score,
                    });
                }
            }
        } catch {
            // Fuzzy matching is optional, continue without suggestions
        }
    }

    // Deduplicate by suggestion text
    const seen = new Set<string>();
    return suggestions.filter(s => {
        if (seen.has(s.suggestion)) return false;
        seen.add(s.suggestion);
        return true;
    }).slice(0, maxResults);
}

// ── SQL Query Builder ──────────────────────────────────────────────────────

function buildWhereClause(filters: SearchFilters): { sql: string; params: Record<string, unknown> } {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    const { assetClass, parsed } = filters;

    // BHK
    if (parsed.bhk) {
        conditions.push(`bhk ILIKE $bhk`);
        params.bhk = `%${parsed.bhk.replace('+', '%')}%`;
    }

    // Type
    if (parsed.type) {
        conditions.push(`type = $type`);
        params.type = parsed.type;
    }

    // Price range
    if (parsed.maxPrice != null) {
        conditions.push(`price_numeric <= $maxPrice`);
        params.maxPrice = parsed.maxPrice;
    }
    if (parsed.minPrice != null) {
        conditions.push(`price_numeric >= $minPrice`);
        params.minPrice = parsed.minPrice;
    }

    // Area range
    if (parsed.maxArea != null) {
        conditions.push(`area_sqft <= $maxArea`);
        params.maxArea = parsed.maxArea;
    }
    if (parsed.minArea != null) {
        conditions.push(`area_sqft >= $minArea`);
        params.minArea = parsed.minArea;
    }

    // Furnishing
    if (parsed.furnishing) {
        conditions.push(`furnishing ILIKE $furnishing`);
        params.furnishing = `%${parsed.furnishing}%`;
    }

    // Locality (exact + trigram)
    if (parsed.locality) {
        conditions.push(`(locality ILIKE $locality OR similarity(locality, $locality) > 0.3)`);
        params.locality = `%${parsed.locality}%`;
    }

    // Building
    if (parsed.building) {
        conditions.push(`(building_name ILIKE $building OR similarity(building_name, $building) > 0.3)`);
        params.building = `%${parsed.building}%`;
    }

    // Raw terms (search in raw_text)
    if (parsed.rawTerms.length > 0) {
        const termConditions = parsed.rawTerms.map((term, i) => {
            const key = `rawTerm${i}`;
            params[key] = term;
            return `(raw_text ILIKE $${key} OR similarity(raw_text, $${key}) > 0.15)`;
        });
        conditions.push(`(${termConditions.join(' AND ')})`);
    }

    // Commercial-specific filters
    if (assetClass === 'commercial') {
        // For commercial, also search in property_use
        if (parsed.rawTerms.length > 0) {
            const termConditions = parsed.rawTerms.map((term, i) => {
                const key = `rawTerm${i}`;
                return `(property_use ILIKE $${key} OR commercial_type ILIKE $${key})`;
            });
            conditions.push(`(${termConditions.join(' OR ')})`);
        }
    }

    return {
        sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
        params,
    };
}

// ── Main Search ────────────────────────────────────────────────────────────

export async function executeSearch(tenantId: string, filters: SearchFilters): Promise<SearchResult> {
    if (!db) {
        return { items: [], total: 0, suggestions: filters.suggestions };
    }

    const table = filters.assetClass === 'commercial'
        ? 'stream_items_commercial'
        : 'stream_items_residential';

    const { sql: whereClause, params } = buildWhereClause(filters);

    // Count query
    const countQuery = `
        SELECT COUNT(*) as total
        FROM ${table}
        WHERE tenant_id = $tenantId
          AND ingestion_status = 'accepted'
          ${whereClause.replace('WHERE', '').replace(/\$tenantId/g, `$tenantId`)}
    `;

    // Data query
    const dataQuery = `
        SELECT id, type, record_type, locality, city, bhk, price_label, price_numeric,
               deal_type, asset_class, property_category, area_sqft, furnishing,
               floor_number, total_floors, property_use, building_name, micro_location,
               commercial_type, fitout_status, workstations_count, cabins_count,
               confidence_score, raw_text, parsed_payload, broker_wa_me_links,
               source_phone, source_group_name, created_at
        FROM ${table}
        WHERE tenant_id = $tenantId
          AND ingestion_status = 'accepted'
          ${whereClause.replace('WHERE', '').replace(/\$tenantId/g, `$tenantId`)}
        ORDER BY created_at DESC
        LIMIT $limit OFFSET $offset
    `;

    const queryParams = {
        ...params,
        tenantId,
        limit: filters.limit,
        offset: filters.offset,
    };

    // Use Supabase query builder for safety
    let query = db
        .from(table)
        .select('*', { count: 'exact', head: false })
        .eq('tenant_id', tenantId)
        .eq('ingestion_status', 'accepted');

    // Apply filters
    if (filters.parsed.bhk) {
        query = query.ilike('bhk', `%${filters.parsed.bhk.replace('+', '%')}%`);
    }
    if (filters.parsed.type) {
        query = query.eq('type', filters.parsed.type);
    }
    if (filters.parsed.maxPrice != null) {
        query = query.lte('price_numeric', filters.parsed.maxPrice);
    }
    if (filters.parsed.minPrice != null) {
        query = query.gte('price_numeric', filters.parsed.minPrice);
    }
    if (filters.parsed.maxArea != null) {
        query = query.lte('area_sqft', filters.parsed.maxArea);
    }
    if (filters.parsed.minArea != null) {
        query = query.gte('area_sqft', filters.parsed.minArea);
    }
    if (filters.parsed.furnishing) {
        query = query.ilike('furnishing', `%${filters.parsed.furnishing}%`);
    }
    if (filters.parsed.locality) {
        query = query.or(`locality.ilike.%${filters.parsed.locality}%,building_name.ilike.%${filters.parsed.locality}%`);
    }
    if (filters.parsed.building) {
        query = query.or(`building_name.ilike.%${filters.parsed.building}%,micro_location.ilike.%${filters.parsed.building}%`);
    }
    if (filters.parsed.rawTerms.length > 0) {
        const rawConditions = filters.parsed.rawTerms.map(term =>
            `raw_text.ilike.%${term}%,locality.ilike.%${term}%,building_name.ilike.%${term}%`
        );
        query = query.or(rawConditions.join(','));
    }

    const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(filters.offset, filters.offset + filters.limit - 1);

    if (error) {
        throw new Error(`Search query failed: ${error.message}`);
    }

    return {
        items: data || [],
        total: count || 0,
        suggestions: filters.suggestions,
    };
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function unifiedSearch(
    tenantId: string,
    assetClass: 'residential' | 'commercial',
    queryString: string,
    limit = 50,
    offset = 0,
): Promise<SearchResult> {
    const parsed = parseSearchQuery(queryString);
    const suggestions = await getFuzzySuggestions(queryString);

    // Try to extract locality/building from raw terms using reference table
    if (parsed.rawTerms.length > 0 && suggestions.length > 0) {
        const topSuggestion = suggestions[0];
        if (topSuggestion.similarity > 0.5) {
            if (topSuggestion.termType === 'locality') {
                parsed.locality = topSuggestion.suggestion;
            } else if (topSuggestion.termType === 'building') {
                parsed.building = topSuggestion.suggestion;
            }
        }
    }

    const filters: SearchFilters = {
        assetClass,
        parsed,
        suggestions,
        limit,
        offset,
    };

    return executeSearch(tenantId, filters);
}
