import axios, { AxiosInstance } from 'axios';
import { aiService } from './aiService';

type BrowserToolResult = {
    message: string;
    data?: Record<string, unknown>;
};

type CamofoxTabResponse = {
    tabId?: string;
    targetId?: string;
    url?: string;
};

type CamofoxSnapshotResponse = {
    url?: string;
    snapshot?: string;
};

type CamofoxLink = {
    url?: string;
    text?: string;
};

type PreferredSite = {
    canonicalName: string;
    url: string;
    aliases: string[];
    category: 'portal' | 'rera' | 'search' | 'maps' | 'social' | 'classifieds' | 'builder';
};

const PREFERRED_REAL_ESTATE_SITES: PreferredSite[] = [
    { canonicalName: 'MahaRERA', url: 'https://maharera.maharashtra.gov.in/', aliases: ['maharera', 'maha rera', 'rera maharashtra'], category: 'rera' },
    { canonicalName: 'MagicBricks', url: 'https://www.magicbricks.com/', aliases: ['magicbricks', 'magic bricks', 'mb'], category: 'portal' },
    { canonicalName: '99acres', url: 'https://www.99acres.com/', aliases: ['99acres', '99 acres'], category: 'portal' },
    { canonicalName: 'Housing.com', url: 'https://housing.com/', aliases: ['housing', 'housing.com'], category: 'portal' },
    { canonicalName: 'NoBroker', url: 'https://www.nobroker.in/', aliases: ['nobroker', 'no broker'], category: 'portal' },
    { canonicalName: 'CommonFloor', url: 'https://www.commonfloor.com/', aliases: ['commonfloor', 'common floor'], category: 'portal' },
    { canonicalName: 'PropTiger', url: 'https://www.proptiger.com/', aliases: ['proptiger', 'prop tiger'], category: 'portal' },
    { canonicalName: 'Square Yards', url: 'https://www.squareyards.com/', aliases: ['squareyards', 'square yards'], category: 'portal' },
    { canonicalName: 'Indian Property', url: 'https://www.indianproperty.com/', aliases: ['indianproperty', 'indian property'], category: 'portal' },
    { canonicalName: 'RealEstateIndia', url: 'https://www.realestateindia.com/', aliases: ['realestateindia', 'real estate india'], category: 'portal' },
    { canonicalName: 'Google Maps', url: 'https://maps.google.com/', aliases: ['google maps', 'maps', 'gmap', 'location map'], category: 'maps' },
    { canonicalName: 'Google Search', url: 'https://www.google.com/', aliases: ['google', 'search'], category: 'search' },
    { canonicalName: 'YouTube', url: 'https://www.youtube.com/', aliases: ['youtube', 'yt'], category: 'social' },
    { canonicalName: 'Facebook', url: 'https://www.facebook.com/', aliases: ['facebook', 'fb'], category: 'social' },
    { canonicalName: 'Instagram', url: 'https://www.instagram.com/', aliases: ['instagram', 'insta'], category: 'social' },
    { canonicalName: 'LinkedIn', url: 'https://www.linkedin.com/', aliases: ['linkedin'], category: 'social' },
    { canonicalName: 'X', url: 'https://x.com/', aliases: ['twitter', 'x.com', 'x app'], category: 'social' },
    { canonicalName: 'OLX', url: 'https://www.olx.in/', aliases: ['olx'], category: 'classifieds' },
    { canonicalName: 'QuikrHomes', url: 'https://www.quikr.com/homes', aliases: ['quikr homes', 'quikrhomes', 'quikr'], category: 'classifieds' },
];

function stripHtml(value: string) {
    // Remove HTML tags
    let result = '';
    let inTag = false;
    for (const c of value) {
        if (c === '<') {
            inTag = true;
            result += ' ';
        } else if (c === '>') {
            inTag = false;
        } else if (!inTag) {
            result += c;
        }
    }
    
    // Decode HTML entities
    result = result.split('&amp;').join('&');
    result = result.split('&quot;').join('"');
    result = result.split('&#39;').join("'");
    result = result.split('&lt;').join('<');
    result = result.split('&gt;').join('>');
    
    // Normalize whitespace
    return result.split(' ').filter(Boolean).join(' ').trim();
}

function normalizeDetectedUrl(value: string) {
    let trimmed = value.trim();
    // Remove trailing characters: ), >, ., ,
    while (trimmed.length > 0) {
        const last = trimmed[trimmed.length - 1];
        if (last === ')' || last === '>' || last === '.' || last === ',') {
            trimmed = trimmed.slice(0, -1);
        } else {
            break;
        }
    }
    
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
        return trimmed;
    }
    if (lower.startsWith('www.')) {
        return `https://${trimmed}`;
    }
    return trimmed;
}

function extractUrl(text: string) {
    // Look for http:// or https:// URLs
    const lower = text.toLowerCase();
    const httpIndex = lower.indexOf('http://');
    const httpsIndex = lower.indexOf('https://');
    
    let urlStart = -1;
    if (httpIndex >= 0 && (httpsIndex < 0 || httpIndex < httpsIndex)) {
        urlStart = httpIndex;
    } else if (httpsIndex >= 0) {
        urlStart = httpsIndex;
    }
    
    if (urlStart >= 0) {
        // Extract until whitespace or end
        let urlEnd = urlStart;
        while (urlEnd < text.length && text[urlEnd] !== ' ' && text[urlEnd] !== '\t' && text[urlEnd] !== '\n' && text[urlEnd] !== '\r') {
            urlEnd++;
        }
        const url = text.slice(urlStart, urlEnd);
        return normalizeDetectedUrl(url);
    }
    
    // Look for bare domains (simple check for www.something or something.something)
    const words = text.split(' ').filter(Boolean);
    for (const word of words) {
        const cleaned = word.toLowerCase();
        if (cleaned.includes('.')) {
            // Check if it looks like a domain (starts with www. or has pattern like something.something)
            if (cleaned.startsWith('www.') || (cleaned.indexOf('.') > 0 && cleaned.indexOf('.') < cleaned.length - 1)) {
                // Check if characters are valid for domain
                let isValid = true;
                for (const c of cleaned) {
                    if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '-' || c === '.')) {
                        isValid = false;
                        break;
                    }
                }
                if (isValid) {
                    return normalizeDetectedUrl(word);
                }
            }
        }
    }
    
    return null;
}

function excerptSnapshot(snapshot: string, maxChars = 1500) {
    return snapshot
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 14)
        .join('\n')
        .slice(0, maxChars)
        .trim();
}

function uniqueSessionKey(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value: string) {
    const lower = value.toLowerCase();
    let result = '';
    for (const c of lower) {
        if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
            result += c;
        } else {
            if (result.length > 0 && !result.endsWith(' ')) {
                result += ' ';
            }
        }
    }
    return result.trim();
}

function findPreferredSite(query: string) {
    const normalizedQuery = normalizeText(query);
    return PREFERRED_REAL_ESTATE_SITES.find((site) =>
        site.aliases.some((alias) => normalizedQuery.includes(normalizeText(alias)))
    );
}

export class BrowserToolService {
    private readonly camofoxBaseUrl = (process.env.CAMOFOX_URL || '').endsWith('/') ? (process.env.CAMOFOX_URL || '').slice(0, -1) : (process.env.CAMOFOX_URL || '');
    private readonly camofoxUserId = 'propai-browser';
    private readonly camofoxClient: AxiosInstance | null = this.camofoxBaseUrl
        ? axios.create({
            baseURL: this.camofoxBaseUrl,
            timeout: 30000,
            headers: {
                'User-Agent': 'PropAI Pulse Browser/1.0',
            },
        })
        : null;

    async execute(tool: string, args: Record<string, any>): Promise<BrowserToolResult> {
        switch (tool) {
            case 'web_fetch':
                return this.webFetch(args.url, args.query);
            case 'search_web':
                return this.searchWeb(args.query);
            case 'verify_rera':
                return this.verifyRera(args.project_name || args.query || '', args.state || 'Maharashtra');
            case 'fetch_property_listing':
                return this.fetchPropertyListing(args.url);
            default:
                throw new Error('Unknown tool');
        }
    }

    private containsWord(text: string, words: string[]): boolean {
        const lower = text.toLowerCase();
        return words.some(w => {
            const word = w.toLowerCase();
            // Check for word boundary by checking surrounding characters
            const index = lower.indexOf(word);
            if (index < 0) return false;
            // Check character before
            if (index > 0) {
                const before = lower[index - 1];
                if ((before >= 'a' && before <= 'z') || (before >= '0' && before <= '9')) {
                    return false;
                }
            }
            // Check character after
            const afterIndex = index + word.length;
            if (afterIndex < lower.length) {
                const after = lower[afterIndex];
                if ((after >= 'a' && after <= 'z') || (after >= '0' && after <= '9')) {
                    return false;
                }
            }
            return true;
        });
    }
    
    private startsWithPhrase(text: string, phrases: string[]): string | null {
        const lower = text.toLowerCase();
        for (const phrase of phrases) {
            if (lower.startsWith(phrase.toLowerCase())) {
                return phrase;
            }
        }
        return null;
    }
    
    private removeWords(text: string, words: string[]): string {
        // Normalize text first
        const normalized = text.split(' ').filter(Boolean).join(' ');
        // For each word, replace it with empty string only if it's a whole word
        let result = ' ' + normalized.toLowerCase() + ' ';
        for (const word of words) {
            const lowerWord = word.toLowerCase();
            // Simple replacement - add spaces around to handle word boundaries
            result = result.split(' ' + lowerWord + ' ').join(' ');
        }
        return result.split(' ').filter(Boolean).join(' ').trim();
    }
    
    detectPrompt(prompt: string): { tool: string; args: Record<string, unknown> } | null {
        const normalized = prompt.trim();
        const lowered = normalized.toLowerCase();
        const url = extractUrl(normalized);
        
        const urlTargetWords = ['url', 'link', 'website', 'webpage', 'page', 'site'];
        const readPageWords = ['fetch', 'open', 'read', 'visit', 'crawl', 'scrape', 'inspect', 'check', 'review'];
        const extractWords = ['extract', 'parse', 'summarize', 'analyse', 'analyze', 'structured', 'details', 'listing', 'property'];
        
        const mentionsUrlTarget = this.containsWord(normalized, urlTargetWords);
        const asksToReadPage = this.containsWord(normalized, readPageWords);
        const asksToExtract = this.containsWord(normalized, extractWords);

        const webFetchPhrases = ['web fetch', 'fetch web', 'open web', 'read url'];
        const webFetchPrefix = this.startsWithPhrase(normalized, webFetchPhrases);
        if (webFetchPrefix) {
            const query = normalized.slice(webFetchPrefix.length)
                .split(' ').filter(Boolean).join(' ')
                .trim();

            return { tool: 'web_fetch', args: url ? { url } : query ? { query } : {} };
        }

        const webSearchPhrases = ['web search', 'search web', 'websearch', 'look up', 'lookup', 'google'];
        const webSearchPrefix = this.startsWithPhrase(normalized, webSearchPhrases);
        if (webSearchPrefix) {
            const query = normalized.slice(webSearchPrefix.length)
                .split(' ').filter(Boolean).join(' ')
                .trim();

            return { tool: 'search_web', args: query ? { query } : {} };
        }

        if (url && (lowered.includes('listing') || lowered.includes('property') || lowered.includes('extract'))) {
            return { tool: 'fetch_property_listing', args: { url } };
        }

        if (url && asksToExtract) {
            return { tool: 'fetch_property_listing', args: { url } };
        }

        if (url && (mentionsUrlTarget || asksToReadPage)) {
            return { tool: 'web_fetch', args: { url } };
        }

        if (url && (lowered.includes('fetch') || lowered.includes('read') || lowered.includes('open'))) {
            return { tool: 'web_fetch', args: { url } };
        }

        if (!url && mentionsUrlTarget && asksToExtract) {
            const query = this.removeWords(normalized, [...urlTargetWords, ...extractWords]);
            return { tool: 'search_web', args: { query: query || normalized } };
        }

        if (lowered.includes('maharera') || lowered.includes('rera')) {
            let cleaned = normalized;
            // Remove common prefixes
            const prefixesToRemove = ['do ', 'please ', 'a ', 'web ', 'search ', 'on ', 'for ', 'verify ', 'check '];
            for (const prefix of prefixesToRemove) {
                if (cleaned.toLowerCase().startsWith(prefix)) {
                    cleaned = cleaned.slice(prefix.length);
                }
            }
            cleaned = cleaned.trim();

            if (lowered.includes('verify') || lowered.includes('registration')) {
                return { tool: 'verify_rera', args: { query: cleaned || normalized, state: 'Maharashtra' } };
            }

            return { tool: 'search_web', args: { query: cleaned || normalized } };
        }

        const webSearchWords = ['websearch', 'web search', 'search web', 'search online', 'look up', 'lookup', 'google'];
        if (this.containsWord(normalized, webSearchWords)) {
            let query = normalized;
            // Remove common prefixes
            const prefixesToRemove = ['do ', 'please '];
            for (const prefix of prefixesToRemove) {
                if (query.toLowerCase().startsWith(prefix)) {
                    query = query.slice(prefix.length);
                }
            }
            query = this.removeWords(query, webSearchWords);
            query = query.split(' ').filter(Boolean).join(' ').trim();

            return { tool: 'search_web', args: { query: query || normalized } };
        }

        return null;
    }

    isAvailable() {
        return true;
    }

    hasLiveBrowser() {
        return Boolean(this.camofoxClient);
    }

    private async webFetch(url?: string, query?: string): Promise<BrowserToolResult> {
        let resolvedUrl = url;
        let resolvedFromQuery: Record<string, unknown> | undefined;

        if (!resolvedUrl && query) {
            const resolved = await this.resolveUrlFromQuery(query);
            resolvedUrl = resolved.url;
            resolvedFromQuery = resolved.metadata;
        }

        if (!resolvedUrl) {
            return {
                message: 'Paste the property or project URL you want me to fetch, or say something like: web fetch MahaRERA official site.',
                data: { requires_url: true, tool: 'web_fetch' },
            };
        }

        if (this.camofoxClient) {
            try {
                const fetched = await this.webFetchWithCamofox(resolvedUrl);
                return {
                    ...fetched,
                    data: {
                        ...(fetched.data || {}),
                        ...(resolvedFromQuery || {}),
                    },
                };
            } catch (error: any) {
                console.warn('[BrowserToolService] CAMOFOX web fetch failed, falling back to HTTP fetch:', error?.message || error);
            }
        }

        const response = await axios.get(resolvedUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PropAI Pulse/1.0)',
            },
        });

        const text = typeof response.data === 'string'
            ? stripHtml(response.data).slice(0, 1500)
            : JSON.stringify(response.data).slice(0, 1500);

        return {
            message: text || `Fetched ${resolvedUrl}`,
            data: {
                url: resolvedUrl,
                source: 'http_fallback',
                ...(resolvedFromQuery || {}),
            },
        };
    }

    private async searchWeb(query?: string): Promise<BrowserToolResult> {
        if (!query) {
            return {
                message: 'Tell me what you want me to search on the web, for example: MahaRERA Lodha Amara or Andheri West real estate updates.',
                data: { requires_query: true, tool: 'search_web' },
            };
        }

        const preferredSite = findPreferredSite(query);
        const normalizedQuery = normalizeText(query);
        if (preferredSite && (
            normalizedQuery === normalizeText(preferredSite.canonicalName)
            || preferredSite.aliases.some((alias) => normalizedQuery === normalizeText(alias))
            || /(official site|official website|portal|website|site)$/.test(normalizedQuery)
        )) {
            return {
                message: `${preferredSite.canonicalName}\n${preferredSite.url}`,
                data: {
                    query,
                    items: [{
                        title: preferredSite.canonicalName,
                        url: preferredSite.url,
                        snippet: `${preferredSite.category} site`,
                    }],
                    source: 'preferred_site_map',
                },
            };
        }

        if (this.camofoxClient) {
            try {
                return await this.searchWebWithCamofox(query);
            } catch (error: any) {
                console.warn('[BrowserToolService] CAMOFOX web search failed, falling back to DuckDuckGo:', error?.message || error);
            }
        }

        const response = await axios.get('https://html.duckduckgo.com/html/', {
            params: { q: query },
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PropAI Pulse/1.0)',
            },
        });

        const html = String(response.data || '');
        const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/gi;
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const snippets: string[] = [];
        let snippetMatch: RegExpExecArray | null;

        while ((snippetMatch = snippetRegex.exec(html)) && snippets.length < 8) {
            const snippet = stripHtml(snippetMatch[1] || snippetMatch[2] || '');
            if (snippet) snippets.push(snippet);
        }

        let match: RegExpExecArray | null;
        let index = 0;
        while ((match = linkRegex.exec(html)) && results.length < 5) {
            const resultUrl = match[1];
            const title = stripHtml(match[2] || '');
            if (!title || !resultUrl) continue;
            results.push({
                title,
                url: resultUrl,
                snippet: snippets[index] || '',
            });
            index += 1;
        }

        if (!results.length) {
            return {
                message: `I could not find web results for ${query} right now.`,
                data: { query, items: [], source: 'duckduckgo_fallback' },
            };
        }

        const lines = results.map((result, resultIndex) => {
            const parts = [`${resultIndex + 1}. ${result.title}`, result.url];
            if (result.snippet) parts.push(result.snippet);
            return parts.join('\n');
        });

        return {
            message: lines.join('\n\n'),
            data: {
                query,
                items: results,
                source: 'duckduckgo_fallback',
            },
        };
    }

    private async verifyRera(projectName: string, state: string): Promise<BrowserToolResult> {
        const query = `${projectName || 'MahaRERA'} ${state} RERA`;
        const searchResult = await this.searchWeb(query);
        return {
            message: searchResult.message,
            data: {
                ...(searchResult.data || {}),
                state,
                project_name: projectName,
            },
        };
    }

    private async fetchPropertyListing(url?: string): Promise<BrowserToolResult> {
        const page = await this.webFetch(url);
        const pageText = String(page.message || '').trim();
        let structured: Record<string, unknown> | null = null;

        if (pageText) {
            try {
                const systemPrompt = `You are PropAI's property listing extractor.
Return valid JSON only. No markdown.`;
                const userPrompt = `Extract the structured property details from this fetched listing page content.

Return ONLY this JSON:
{
  "property_type": "string or null",
  "listing_type": "sale | rent | lease | pre-leased | null",
  "configuration": "string or null",
  "locality": "string or null",
  "city": "string or null",
  "building_or_project": "string or null",
  "area_sqft": number or null,
  "price_label": "string or null",
  "price_numeric_inr": number or null,
  "furnishing": "string or null",
  "parking": "string or null",
  "broker_name": "string or null",
  "broker_phone": "string or null",
  "parse_notes": "string or null"
}

Listing URL:
${url || page.data?.url || 'unknown'}

Fetched content:
"""
${pageText.slice(0, 6000)}
"""`;

                const response = await aiService.chat(userPrompt, 'Auto', 'listing_parsing', undefined, systemPrompt);
                // Remove markdown code block markers
                let cleaned = response.text;
                const jsonMarker = cleaned.indexOf('```json');
                if (jsonMarker >= 0) {
                    cleaned = cleaned.slice(0, jsonMarker) + cleaned.slice(jsonMarker + 7);
                }
                const backtickBlock = cleaned.indexOf('```');
                if (backtickBlock >= 0) {
                    cleaned = cleaned.slice(0, backtickBlock) + cleaned.slice(backtickBlock + 3);
                }
                structured = JSON.parse(cleaned.trim());
            } catch (error: any) {
                structured = {
                    parse_notes: `Structured extraction failed: ${error?.message || 'unknown error'}`,
                };
            }
        }

        return {
            message: structured
                ? JSON.stringify(structured, null, 2)
                : page.message,
            data: {
                ...(page.data || {}),
                source: url,
                extracted_listing: structured || undefined,
            },
        };
    }

    private async webFetchWithCamofox(url: string): Promise<BrowserToolResult> {
        const result = await this.withCamofoxTab(url, async (tabId) => {
            const snapshot = await this.getCamofoxSnapshot(tabId);
            const summary = excerptSnapshot(snapshot.snapshot || '');
            return {
                url: snapshot.url || url,
                summary,
                snapshot: snapshot.snapshot || '',
            };
        });

        return {
            message: result.summary || `Fetched ${result.url}`,
            data: {
                url: result.url,
                snapshot: result.snapshot,
                source: 'camofox',
            },
        };
    }

    private async searchWebWithCamofox(query: string): Promise<BrowserToolResult> {
        const result = await this.withCamofoxTab('https://www.google.com/', async (tabId) => {
            await this.camofoxClient!.post(`/tabs/${tabId}/navigate`, {
                userId: this.camofoxUserId,
                macro: '@google_search',
                query,
                sessionKey: uniqueSessionKey('propai-search'),
            });

            const [snapshot, linksResponse] = await Promise.all([
                this.getCamofoxSnapshot(tabId),
                this.camofoxClient!.get(`/tabs/${tabId}/links`, {
                    params: {
                        userId: this.camofoxUserId,
                        limit: 25,
                    },
                }),
            ]);

            const rawLinks = Array.isArray(linksResponse.data?.links) ? linksResponse.data.links as CamofoxLink[] : [];
            const items = rawLinks
                .filter((link) => {
                    const linkUrl = String(link.url || '');
                    return linkUrl.startsWith('http')
                        && !/google\./i.test(linkUrl)
                        && !/webcache|accounts\.google/i.test(linkUrl);
                })
                .slice(0, 5)
                .map((link) => ({
                    title: String(link.text || link.url || '').trim() || 'Untitled result',
                    url: String(link.url || '').trim(),
                }));

            return {
                url: snapshot.url || 'https://www.google.com/',
                snapshot: snapshot.snapshot || '',
                items,
            };
        });

        if (!result.items.length) {
            const summary = excerptSnapshot(result.snapshot);
            return {
                message: summary || `I could not extract clean web results for ${query} right now.`,
                data: {
                    query,
                    items: [],
                    snapshot: result.snapshot,
                    source: 'camofox',
                },
            };
        }

        const lines = result.items.map((item, index) => `${index + 1}. ${item.title}\n${item.url}`);
        return {
            message: lines.join('\n\n'),
            data: {
                query,
                items: result.items,
                snapshot: result.snapshot,
                source: 'camofox',
                page_url: result.url,
            },
        };
    }

    private async resolveUrlFromQuery(query: string): Promise<{ url?: string; metadata?: Record<string, unknown> }> {
        const preferredSite = findPreferredSite(query);
        if (preferredSite) {
            return {
                url: preferredSite.url,
                metadata: {
                    resolved_query: query,
                    resolved_url: preferredSite.url,
                    resolved_site: preferredSite.canonicalName,
                    resolved_category: preferredSite.category,
                    resolution_source: 'preferred_site_map',
                },
            };
        }

        const searchResult = await this.searchWeb(query);
        const items = Array.isArray(searchResult.data?.items) ? searchResult.data.items as Array<Record<string, unknown>> : [];
        const firstUrl = items.find((item) => typeof item.url === 'string' && item.url)?.url as string | undefined;

        if (!firstUrl) {
            return {
                metadata: {
                    resolved_query: query,
                    resolution_failed: true,
                },
            };
        }

        return {
            url: firstUrl,
            metadata: {
                resolved_query: query,
                resolved_url: firstUrl,
                resolution_source: 'search_result',
            },
        };
    }

    private async withCamofoxTab<T>(initialUrl: string, runner: (tabId: string) => Promise<T>): Promise<T> {
        if (!this.camofoxClient) {
            throw new Error('CAMOFOX_URL is not configured.');
        }

        await this.ensureCamofoxStarted();
        const sessionKey = uniqueSessionKey('propai-browser');
        const createResponse = await this.camofoxClient.post<CamofoxTabResponse>('/tabs', {
            userId: this.camofoxUserId,
            sessionKey,
            url: initialUrl,
        });

        const tabId = createResponse.data?.tabId || createResponse.data?.targetId;
        if (!tabId) {
            throw new Error('Camofox did not return a tab id.');
        }

        try {
            return await runner(tabId);
        } finally {
            try {
                await this.camofoxClient.delete(`/tabs/${tabId}`, {
                    params: { userId: this.camofoxUserId },
                });
            } catch (error: any) {
                console.warn('[BrowserToolService] Failed to close CAMOFOX tab:', error?.message || error);
            }
        }
    }

    private async ensureCamofoxStarted() {
        if (!this.camofoxClient) return;

        try {
            await this.camofoxClient.get('/health');
        } catch {
            await this.camofoxClient.post('/start');
        }
    }

    private async getCamofoxSnapshot(tabId: string) {
        const response = await this.camofoxClient!.get<CamofoxSnapshotResponse>(`/tabs/${tabId}/snapshot`, {
            params: {
                userId: this.camofoxUserId,
                format: 'text',
            },
        });

        return response.data || {};
    }
}

export const browserToolService = new BrowserToolService();
