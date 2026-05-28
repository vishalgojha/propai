import crypto from 'node:crypto';
import axios, { AxiosInstance } from 'axios';
import { supabaseAdmin } from '../config/supabase';

type LiveIgrFetchInput = {
    buildingName?: string | null;
    locality?: string | null;
};

type LiveIgrExtraction = {
    doc_number?: string | null;
    building_name?: string | null;
    locality?: string | null;
    registration_date?: string | null;
    consideration?: number | null;
    area_sqft?: number | null;
    district?: string | null;
    sro_office?: string | null;
    article_type?: string | null;
    transaction_type?: string | null;
};

type LiveIgrFetchResult = {
    success: boolean;
    searchQuery?: string;
    extracted?: LiveIgrExtraction | null;
    saved?: boolean;
    docNumber?: string | null;
    error?: string | null;
};

const IGR_PORTAL_URL = 'https://freesearchigrservice.maharashtra.gov.in/';
const IGR_PORTAL_URLS = [
    IGR_PORTAL_URL,
    'https://igrmaharashtra.gov.in/',
];
const CAMOUFOX_BASE_URL = (process.env.CAMOFOX_URL || process.env.CAMOUFOX_URL || '').replace(/\/$/, '') || 'http://127.0.0.1:9377';
const CAMOUFOX_USER_ID = 'propai-igr';
const NAVIGATE_TIMEOUT_MS = 30_000;
const FORM_FILL_DELAY_MS = 2_000;
const RESULTS_WAIT_MS = 5_000;
const MAX_RETRY_ATTEMPTS = 2;

function normalize(value?: string | null): string {
    return String(value || '').trim();
}

function uniqueSessionKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class CamoufoxIgrClient {
    private client: AxiosInstance;
    private _healthy: boolean | null = null;
    private _lastHealthCheck = 0;
    private readonly HEALTH_CHECK_CACHE_MS = 30_000;

    constructor() {
        this.client = axios.create({
            baseURL: CAMOUFOX_BASE_URL,
            timeout: 10_000,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    async health(): Promise<boolean> {
        const now = Date.now();
        if (this._healthy !== null && now - this._lastHealthCheck < this.HEALTH_CHECK_CACHE_MS) {
            return this._healthy;
        }

        try {
            const resp = await this.client.get('/health');
            this._healthy = resp.data?.ok === true && resp.data?.browserConnected === true;
            this._lastHealthCheck = now;
            return this._healthy;
        } catch {
            this._healthy = false;
            this._lastHealthCheck = now;
            return false;
        }
    }

    async createTab(url: string): Promise<string> {
        const resp = await this.client.post('/tabs', {
            userId: CAMOUFOX_USER_ID,
            sessionKey: uniqueSessionKey('igr'),
            url,
        });
        return resp.data?.tabId || resp.data?.targetId;
    }

    async closeTab(tabId: string): Promise<void> {
        try {
            await this.client.delete(`/tabs/${tabId}`, {
                params: { userId: CAMOUFOX_USER_ID },
            });
        } catch {
            // Ignore cleanup errors
        }
    }

    async navigate(tabId: string, url: string): Promise<void> {
        await this.client.post(`/tabs/${tabId}/navigate`, {
            userId: CAMOUFOX_USER_ID,
            url,
        });
    }

    async evaluate<T>(tabId: string, expression: string): Promise<T | null> {
        const resp = await this.client.post(`/tabs/${tabId}/evaluate`, {
            userId: CAMOUFOX_USER_ID,
            expression,
        });
        return resp.data?.result ?? null;
    }

    async waitForPageLoad(tabId: string, pollMs = 1000, timeoutMs = 30_000): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const snapshot = await this.evaluate<string>(tabId, 'document.body?.innerText?.slice(0, 50) || ""');
                if (snapshot && snapshot.length > 0) return true;
            } catch {
                // Page not ready yet
            }
            await new Promise((r) => setTimeout(r, pollMs));
        }
        return false;
    }
}

function buildSearchQuery(input: LiveIgrFetchInput): string {
    const buildingName = normalize(input.buildingName);
    const locality = normalize(input.locality);
    return [buildingName, locality].filter(Boolean).join(', ') || 'unknown';
}

function parseAmount(text: string): number | null {
    if (!text) return null;
    const cleaned = text.replace(/[,\s₹Rs.]/g, '').toLowerCase();
    let multiplier = 1;
    if (cleaned.includes('cr') || cleaned.includes('crore')) {
        multiplier = 10_000_000;
    } else if (cleaned.includes('l') || cleaned.includes('lac') || cleaned.includes('lakh')) {
        multiplier = 100_000;
    } else if (cleaned.includes('k') || cleaned.includes('thousand')) {
        multiplier = 1_000;
    }
    const num = parseFloat(cleaned.replace(/[^0-9.]/g, ''));
    return Number.isNaN(num) ? null : num * multiplier;
}

export class IgrLiveFetchService {
    private camoufox: CamoufoxIgrClient | null = null;

    private getCamoufox(): CamoufoxIgrClient | null {
        if (this.camoufox === null) {
            this.camoufox = new CamoufoxIgrClient();
        }
        return this.camoufox;
    }

    private getAdmin() {
        if (!supabaseAdmin) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for live IGR saves');
        }
        return supabaseAdmin;
    }

    private async extractResults(tabId: string): Promise<Array<Record<string, string>>> {
        const result = await this.getCamoufox()!.evaluate<string>(tabId, `
            (() => {
                const rows = [];
                const tables = document.querySelectorAll('table');
                let targetTable = null;

                for (const t of tables) {
                    const trs = t.querySelectorAll('tr');
                    let numCount = 0;
                    for (const tr of trs) {
                        const firstTd = tr.querySelector('td');
                        if (firstTd && /^\\d+$/.test(firstTd.textContent.trim())) {
                            numCount++;
                        }
                    }
                    if (numCount > 2) { targetTable = t; break; }
                }

                if (!targetTable) return JSON.stringify({error: 'no results table'});

                const trs = targetTable.querySelectorAll('tr');
                for (const tr of trs) {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length < 3) continue;
                    const docNo = tds[0]?.textContent.trim();
                    if (!docNo || !/^\\d+$/.test(docNo)) continue;
                    rows.push({
                        doc_no: docNo,
                        reg_date: tds[1]?.textContent.trim() || '',
                        consideration: tds[2]?.textContent.trim() || '',
                        stamp_duty: tds[3]?.textContent.trim() || '',
                        property_type: tds[4]?.textContent.trim() || '',
                        village: tds[5]?.textContent.trim() || '',
                        buyer: tds[6]?.textContent.trim() || '',
                        seller: tds[7]?.textContent.trim() || '',
                    });
                }

                return JSON.stringify({ rows, count: rows.length });
            })()
        `);

        if (!result) return [];
        try {
            const parsed = JSON.parse(result);
            if (parsed.error) return [];
            return Array.isArray(parsed.rows) ? parsed.rows : [];
        } catch {
            return [];
        }
    }

    private async fillAndSearch(tabId: string, searchTerm: string, year: number): Promise<{ triggered: boolean; reason: string }> {
        const camoufox = this.getCamoufox()!;

        const result = await camoufox.evaluate<string>(tabId, `
            (() => {
                const searchTerm = ${JSON.stringify(searchTerm)};
                const year = ${year};
                const lower = (value) => String(value || '').toLowerCase();
                const candidates = Array.from(document.querySelectorAll('select, input, textarea, button, a'));
                const haystack = (el) => [
                    el.id,
                    el.name,
                    el.getAttribute('placeholder'),
                    el.getAttribute('aria-label'),
                    el.getAttribute('title'),
                    el.textContent,
                    el.className,
                ].filter(Boolean).join(' ').toLowerCase();
                const dispatch = (el) => {
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                };
                const setValue = (el, value) => {
                    if (!el) return false;
                    if (el.tagName === 'SELECT') {
                        const hasExact = Array.from(el.options || []).some((opt) => lower(opt.value) === lower(value) || lower(opt.text) === lower(value));
                        if (hasExact) {
                            el.value = String(value);
                        } else if (Array.from(el.options || []).length > 0) {
                            const matchingOption = Array.from(el.options || []).find((opt) => lower(opt.text).includes(String(value).toLowerCase()) || lower(opt.value).includes(String(value).toLowerCase()));
                            if (matchingOption) {
                                el.value = matchingOption.value;
                            } else {
                                el.value = String(value);
                            }
                        } else {
                            el.value = String(value);
                        }
                        dispatch(el);
                        return true;
                    }
                    if ('value' in el) {
                        el.value = String(value);
                        dispatch(el);
                        return true;
                    }
                    return false;
                };
                const click = (el) => {
                    if (!el) return false;
                    try {
                        el.click();
                        return true;
                    } catch {
                        return false;
                    }
                };

                const yearField = candidates.find((el) => {
                    if (el.tagName !== 'SELECT') return false;
                    const hay = haystack(el);
                    return hay.includes('year') || hay.includes('fromyear') || Array.from(el.options || []).some((opt) => lower(opt.value).includes(String(year)) || lower(opt.text).includes(String(year)));
                });
                if (yearField) {
                    setValue(yearField, String(year));
                }

                const textField = candidates.find((el) => {
                    if (!['INPUT', 'TEXTAREA'].includes(el.tagName)) return false;
                    const hay = haystack(el);
                    return ['area', 'locality', 'building', 'property', 'village', 'search', 'sro', 'name'].some((token) => hay.includes(token));
                }) || candidates.find((el) => ['INPUT', 'TEXTAREA'].includes(el.tagName) && !el.type);
                if (textField) {
                    setValue(textField, searchTerm);
                }

                const searchButton = candidates.find((el) => {
                    const hay = haystack(el);
                    return (
                        (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && ['submit', 'button'].includes(String(el.type || '').toLowerCase())))
                        && ['search', 'find', 'submit', 'go'].some((token) => hay.includes(token))
                    );
                });
                if (searchButton && click(searchButton)) {
                    return JSON.stringify({ triggered: true, reason: 'button' });
                }

                const form = document.querySelector('form');
                if (form) {
                    const submit = form.querySelector("button,input[type='submit'],input[type='button']");
                    if (submit && click(submit)) {
                        return JSON.stringify({ triggered: true, reason: 'form-submit' });
                    }
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    return JSON.stringify({ triggered: true, reason: 'form-event' });
                }

                return JSON.stringify({
                    triggered: Boolean(yearField || textField),
                    reason: yearField || textField ? 'filled-only' : 'no-match',
                });
            })()
        `);

        try {
            const parsed = JSON.parse(result || '{}') as { triggered?: boolean; reason?: string };
            return {
                triggered: Boolean(parsed.triggered),
                reason: String(parsed.reason || 'unknown'),
            };
        } catch {
            return {
                triggered: false,
                reason: 'unparseable',
            };
        }
    }

    private async tryPortalPath(tabId: string, searchTerm: string, year: number): Promise<{ rows: Array<Record<string, string>>; reason: string }> {
        const camoufox = this.getCamoufox()!;
        await camoufox.waitForPageLoad(tabId);
        await new Promise((r) => setTimeout(r, FORM_FILL_DELAY_MS));

        const status = await this.fillAndSearch(tabId, searchTerm, year);
        if (!status.triggered) {
            return { rows: [], reason: status.reason };
        }

        await new Promise((r) => setTimeout(r, RESULTS_WAIT_MS));
        return { rows: await this.extractResults(tabId), reason: status.reason };
    }

    async fetchAndStore(input: LiveIgrFetchInput): Promise<LiveIgrFetchResult> {
        const buildingName = normalize(input.buildingName);
        const locality = normalize(input.locality);
        const searchQuery = buildSearchQuery({ buildingName, locality });

        if (!buildingName && !locality) {
            return { success: false, error: 'Provide a building name or locality.', searchQuery };
        }

        const camoufox = this.getCamoufox();
        if (!camoufox) {
            return {
                success: false,
                error: 'Camoufox browser is not configured. Set CAMOFOX_URL env var to point to the browser server.',
                searchQuery,
            };
        }

        const isHealthy = await camoufox.health();
        if (!isHealthy) {
            return {
                success: false,
                error: `Camoufox browser is unreachable at ${CAMOUFOX_BASE_URL}. Check that the browser server is running and CAMOFOX_URL is set correctly.`,
                searchQuery,
            };
        }

        const currentYear = new Date().getFullYear();
        const searchYears = [currentYear, currentYear - 1, currentYear - 2];

        for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
            const tabId = await camoufox.createTab(IGR_PORTAL_URLS[0]);
            if (!tabId) {
                return { success: false, error: 'Failed to create browser tab.', searchQuery };
            }

            try {
                await camoufox.waitForPageLoad(tabId);
                await new Promise((r) => setTimeout(r, 2000));

                for (const year of searchYears) {
                    for (const portalUrl of IGR_PORTAL_URLS) {
                        await camoufox.navigate(tabId, portalUrl);
                        await camoufox.waitForPageLoad(tabId);
                        await new Promise((r) => setTimeout(r, 1500));

                        const attemptResult = await this.tryPortalPath(tabId, buildingName || locality || '', year);
                        if (attemptResult.rows.length > 0) {
                            return this.saveBestMatch(attemptResult.rows, { buildingName, locality, searchQuery });
                        }
                    }
                }
            } catch (error: unknown) {
                console.error('[IgrLiveFetchService] Browser automation error:', error);
                if (attempt === MAX_RETRY_ATTEMPTS - 1) {
                    return {
                        success: false,
                        error: `Browser automation failed after ${MAX_RETRY_ATTEMPTS} attempts: ${(error as Error).message}`,
                        searchQuery,
                    };
                }
            } finally {
                await camoufox.closeTab(tabId);
            }

            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }

        return {
            success: false,
            error: 'No matching IGR transactions found for the specified building/locality.',
            searchQuery,
            extracted: null,
        };
    }

    private async saveBestMatch(
        rows: Array<Record<string, string>>,
        context: { buildingName: string; locality: string; searchQuery: string },
    ): Promise<LiveIgrFetchResult> {
        const { buildingName, locality, searchQuery } = context;
        const buildingLower = buildingName.toLowerCase();
        const localityLower = locality.toLowerCase();

        // Score rows by relevance
        let bestRow: Record<string, string> | null = null;
        let bestScore = 0;

        for (const row of rows) {
            let score = 0;
            const propertyType = (row.property_type || '').toLowerCase();
            const village = (row.village || '').toLowerCase();
            const buyer = (row.buyer || '').toLowerCase();
            const seller = (row.seller || '').toLowerCase();

            if (buildingLower && (propertyType.includes(buildingLower) || village.includes(buildingLower))) {
                score += 10;
            }
            if (localityLower && (village.includes(localityLower) || propertyType.includes(localityLower))) {
                score += 5;
            }
            if (buyer && buildingLower && buyer.includes(buildingLower)) score += 3;
            if (seller && buildingLower && seller.includes(buildingLower)) score += 3;

            if (score > bestScore) {
                bestScore = score;
                bestRow = row;
            }
        }

        if (!bestRow) {
            bestRow = rows[0];
        }

        const docNumber = bestRow.doc_no || `live:${crypto.createHash('sha256')
            .update([buildingName, locality, bestRow.reg_date || '', bestRow.consideration || ''].join('|'))
            .digest('hex')
            .slice(0, 20)}`;

        const extracted: LiveIgrExtraction = {
            doc_number: docNumber,
            building_name: buildingName || null,
            locality: bestRow.village || locality || null,
            registration_date: bestRow.reg_date || null,
            consideration: parseAmount(bestRow.consideration || ''),
            area_sqft: null,
            district: null,
            sro_office: null,
            article_type: '25',
            transaction_type: 'sale',
        };

        const rowToUpsert = {
            doc_number: docNumber,
            registration_date: extracted.registration_date || null,
            sro_office: extracted.sro_office || null,
            district: extracted.district || null,
            article_type: extracted.article_type || '25',
            consideration_amount: extracted.consideration ?? null,
            rent_amount: null,
            deposit_amount: null,
            lease_duration: null,
            property_description: bestRow?.property_type || null,
            building_name: buildingName || null,
            buyer_name: bestRow?.buyer || null,
            seller_name: bestRow?.seller || null,
            village_locality: extracted.locality || null,
            area_sqft: extracted.area_sqft ?? null,
            source: 'igr_live_browser',
            scraped_at: new Date().toISOString(),
        };

        const { error } = await this.getAdmin()
            .from('igr_transactions')
            .upsert(rowToUpsert, { onConflict: 'doc_number' });

        if (error) {
            return {
                success: false,
                error: error.message,
                searchQuery,
                extracted,
                docNumber,
            };
        }

        return {
            success: true,
            searchQuery,
            extracted,
            saved: true,
            docNumber,
        };
    }
}

export const igrLiveFetchService = new IgrLiveFetchService();
