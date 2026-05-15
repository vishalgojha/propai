import { supabase, supabaseAdmin } from '../config/supabase';

type PropertyResult = {
    id: string;
    title: string;
    location: string;
    price: string;
    details: string;
    match: number;
};

type SearchResponse = {
    response: string;
    properties: PropertyResult[];
};

function tokenize(message: string): string[] {
    return String(message)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length >= 3);
}

export async function searchProperties(tenantId: string, message: string): Promise<SearchResponse> {
    const db = supabaseAdmin ?? supabase;
    const normalizedTokens = tokenize(message);

    const { data: listings, error } = await db
        .from('listings')
        .select('id, raw_text, structured_data')
        .eq('status', 'Active')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) throw error;

    const ranked = (listings || [])
        .map((listing: Record<string, unknown>) => {
            const haystack = JSON.stringify(listing.structured_data || {}).toLowerCase();
            const score = normalizedTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
            return { listing, score };
        })
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    const properties = ranked.map(({ listing, score }) => {
        const sd = listing.structured_data as Record<string, unknown> | undefined;
        return {
            id: String(listing.id || ''),
            title: String(sd?.title || sd?.building_name || 'Property listing'),
            location: String(sd?.location || sd?.locality || 'Location unavailable'),
            price: String(sd?.price || sd?.budget || 'Price unavailable'),
            details: String(listing.raw_text || ''),
            match: Math.max(50, Math.min(99, score * 20)),
        };
    });

    const response = properties.length > 0
        ? `I found ${properties.length} matching ${properties.length === 1 ? 'listing' : 'listings'} from your workspace data.`
        : 'I could not find any trustworthy listing match for that query in your workspace right now.';

    return { response, properties };
}
