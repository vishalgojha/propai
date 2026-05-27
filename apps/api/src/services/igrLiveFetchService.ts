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

    private async fillAndSearch(tabId: string, buildingName: string, year: number): Promise<string> {
        const camoufox = this.getCamoufox()!;

        // Set year dropdown
        await camoufox.evaluate(tabId, `
            (() => {
                const y = document.getElementById('ddlFromYear');
                if (!y) return 'no_year_select';
                y.value = '${year}';
                y.dispatchEvent(new Event('change', { bubbles: true }));
                return 'year_set=' + y.value;
            })()
        `);

        // Type building name into area text field
        await camoufox.evaluate(tabId, `
            (() => {
                const t = document.getElementById('txtAreaName');
                if (!t) return 'no_area_field';
                t.value = '${buildingName.replace(/'/g, "\\'")}';
                t.dispatchEvent(new Event('input', { bubbles: true }));
                t.dispatchEvent(new Event('change', { bubbles: true }));
                return 'area_set=' + t.value;
            })()
        `);

        // Try to click search button — try multiple selectors
        const searchSelectors = [
            "input[type='submit']",
            "button[type='submit']",
            "#btnSearch",
            "input[value='Search']",
            "input[value='search']",
        ];

        for (const selector of searchSelectors) {
            const clicked = await camoufox.evaluate<boolean>(tabId, `
                (() => {
                    const el = document.querySelector('${selector}');
                    if (el) { el.click(); return true; }
                    return false;
                })()
            `);
            if (clicked) break;
        }

        return 'search_triggered';
    }

    private async tryPortalPath(tabId: string, buildingName: string, year: number): Promise<Array<Record<string, string>>> {
        const camoufox = this.getCamoufox()!;

        await camoufox.navigate(tabId, IGR_PORTAL_URL);
        await camoufox.waitForPageLoad(tabId);
        await new Promise((r) => setTimeout(r, FORM_FILL_DELAY_MS));

        const status = await this.fillAndSearch(tabId, buildingName, year);
        if (status !== 'search_triggered') {
            return [];
        }

        await new Promise((r) => setTimeout(r, RESULTS_WAIT_MS));
        return this.extractResults(tabId);
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
            const tabId = await camoufox.createTab(IGR_PORTAL_URL);
            if (!tabId) {
                return { success: false, error: 'Failed to create browser tab.', searchQuery };
            }

            try {
                await camoufox.waitForPageLoad(tabId);
                await new Promise((r) => setTimeout(r, 2000));

                for (const year of searchYears) {
                    const rows = await this.tryPortalPath(tabId, buildingName || locality || '', year);
                    if (rows.length > 0) {
                        return this.saveBestMatch(rows, { buildingName, locality, searchQuery });
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
