import crypto from 'node:crypto';
import axios, { AxiosInstance } from 'axios';
import { supabaseAdmin } from '../config/supabase';
import Tesseract from 'tesseract.js';
import { igrBrowserBridgeService } from './igrBrowserBridgeService';

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
    private readonly verboseIgrLogs = process.env.IGR_VERBOSE_LOGS === 'true';

    private getCamoufox(): CamoufoxIgrClient | null {
        if (this.camoufox === null) {
            this.camoufox = new CamoufoxIgrClient();
        }
        return this.camoufox;
    }

    private verboseLog(...args: unknown[]) {
        if (this.verboseIgrLogs) {
            console.log(...args);
        }
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
    }    private async resolveCoordinates(buildingName: string, locality: string): Promise<{
        region: string;
        district: string;
        taluka: string;
        village: string;
        propertyNumber: string;
    }> {
        this.verboseLog(`[CoordinateResolver] Resolving coordinates for "${buildingName}" in "${locality}"...`);
        
        let district = 'Mumbai Suburban';
        let taluka = 'Andheri';
        let village = locality || 'Bandra';
        let propertyNumber = '';

        // 1. Query the database to find an existing transaction for this building
        try {
            const { data, error } = await this.getAdmin()
                .from('igr_transactions')
                .select('district, village_locality, property_description')
                .ilike('building_name', `%${buildingName}%`)
                .order('registration_date', { ascending: false })
                .limit(5);

            if (data && data.length > 0) {
                const match = data.find(row => row.district || row.village_locality);
                if (match) {
                    if (match.district) district = match.district;
                    if (match.village_locality) village = match.village_locality;
                }

                // Try to extract CTS/Survey number from property descriptions
                for (const row of data) {
                    const desc = row.property_description || '';
                    const ctsMatch = desc.match(/सी\s*टी\s*एस\s*नं\s*(\d+)/i) || 
                                     desc.match(/CTS\s*(?:No\.?|)\s*(\d+)/i) || 
                                     desc.match(/survey\s*(?:No\.?|)\s*(\d+)/i) ||
                                     desc.match(/सर्वे\s*नंबर\s*(\d+)/i);
                    if (ctsMatch) {
                        propertyNumber = ctsMatch[1];
                        this.verboseLog(`[CoordinateResolver] Successfully extracted CTS/Survey No. "${propertyNumber}" from description: "${desc.slice(0, 80)}..."`);
                        break;
                    }
                }
            }
        } catch (err: any) {
            console.warn('[CoordinateResolver] DB lookup failed:', err.message);
        }

        // 2. Deducing Taluka
        const villageLower = village.toLowerCase();
        if (villageLower.includes('bandra') || villageLower.includes('khar') || villageLower.includes('santacruz') || villageLower.includes('juhu') || villageLower.includes('vile parle')) {
            taluka = 'Andheri';
        } else if (villageLower.includes('kurla') || villageLower.includes('chembur') || villageLower.includes('ghatkopar') || villageLower.includes('mulund')) {
            taluka = 'Kurla';
        } else if (villageLower.includes('borivali') || villageLower.includes('kandivali') || villageLower.includes('malad') || villageLower.includes('dahisar')) {
            taluka = 'Borivali';
        }

        // 3. Fallbacks for premium buildings
        if (!propertyNumber) {
            const normalizedBuilding = buildingName.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedBuilding.includes('kalpatarumagnus') || normalizedBuilding.includes('kalptarumagnus')) {
                district = 'Mumbai Suburban';
                taluka = 'Andheri';
                village = 'Bandra';
                propertyNumber = '629';
            } else if (normalizedBuilding.includes('runwalelegante')) {
                district = 'Mumbai Suburban';
                taluka = 'Andheri';
                village = 'Andheri';
                propertyNumber = '620';
            } else if (normalizedBuilding.includes('joyvalencia')) {
                district = 'Mumbai Suburban';
                taluka = 'Andheri';
                village = 'Andheri';
                propertyNumber = '2';
            } else if (normalizedBuilding.includes('oberoichambers')) {
                district = 'Mumbai Suburban';
                taluka = 'Andheri';
                village = 'Andheri';
                propertyNumber = '10';
            } else {
                propertyNumber = '1';
            }
        }

        let region = 'Rest';
        const distLower = district.toLowerCase();
        if (distLower.includes('suburban') || distLower.includes('mumbai city') || distLower.includes('मुंबई')) {
            region = 'Mumbai';
        }

        this.verboseLog(`[CoordinateResolver] Resolved IGR Search Parameters:
          - Region: "${region}"
          - District: "${district}"
          - Taluka: "${taluka}"
          - Village: "${village}"
          - Property Number: "${propertyNumber}"
        `);

        return { region, district, taluka, village, propertyNumber };
    }

    private async solveCaptchaOffline(tabId: string, captchaImgSelector: string): Promise<string> {
        this.verboseLog('[OCR] Capturing CAPTCHA image via canvas evaluate...');
        const base64 = await this.getCamoufox()!.evaluate<string>(tabId, `
            (() => {
                const img = document.querySelector(${JSON.stringify(captchaImgSelector)});
                if (!img) return null;
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return null;
                ctx.drawImage(img, 0, 0);
                return canvas.toDataURL('image/png').replace(/^data:image\\/png;base64,/, '');
            })()
        `);

        if (!base64) {
            throw new Error('Failed to capture CAPTCHA image data from DOM');
        }

        const buffer = Buffer.from(base64, 'base64');
        this.verboseLog('[OCR] Solving CAPTCHA using Tesseract.js...');
        
        const result = await Tesseract.recognize(
            buffer,
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        this.verboseLog(`[OCR] Progress: ${(m.progress * 100).toFixed(1)}%`);
                    }
                }
            }
        );

        const cleanedText = result.data.text.replace(/[^a-zA-Z0-9]/g, '').trim();
        this.verboseLog(`[OCR] Decoded Raw Text: "${result.data.text.trim()}" -> Cleaned: "${cleanedText}"`);
        return cleanedText;
    }

    async fetchAndStore(input: LiveIgrFetchInput): Promise<LiveIgrFetchResult> {
        const buildingName = normalize(input.buildingName);
        const locality = normalize(input.locality);
        const searchQuery = buildSearchQuery({ buildingName, locality });

        if (!buildingName && !locality) {
            return { success: false, error: 'Provide a building name or locality.', searchQuery };
        }

        const helperResult = await igrBrowserBridgeService.fetchRows({ buildingName, locality });
        if (helperResult.success && helperResult.rows && helperResult.rows.length > 0) {
            const helperSave = await this.saveBestMatch(helperResult.rows, { buildingName, locality, searchQuery });
            if (helperSave.success) {
                this.verboseLog('[IGR] Browser helper fetch completed successfully', {
                    source: helperResult.source || 'igr_browser_helper',
                    rowCount: helperResult.rows.length,
                });
                return helperSave;
            }

            return helperSave;
        }
        if (!helperResult.success && helperResult.error) {
            this.verboseLog('[IGR] Browser helper unavailable, falling back to Camoufox flow', {
                error: helperResult.error,
            });
        }

        const camoufox = this.getCamoufox();
        if (!camoufox) {
            if (!helperResult.success) {
                return {
                    success: false,
                    error: `${helperResult.error || 'IGR browser helper failed'}; Camoufox browser is not configured. Set CAMOFOX_URL env var to point to the browser server.`,
                    searchQuery,
                };
            }
            return {
                success: false,
                error: 'Camoufox browser is not configured. Set CAMOFOX_URL env var to point to the browser server.',
                searchQuery,
            };
        }

        const isHealthy = await camoufox.health();
        if (!isHealthy) {
            if (helperResult.success && helperResult.rows && helperResult.rows.length === 0) {
                this.verboseLog('[IGR] Browser helper returned no rows, falling back to Camoufox portal flow');
            }
            return {
                success: false,
                error: `Camoufox browser is unreachable at ${CAMOUFOX_BASE_URL}. Check that the browser server is running and CAMOFOX_URL is set correctly.`,
                searchQuery,
            };
        }

        // 1. Resolve coordinates from existing data
        const coords = await this.resolveCoordinates(buildingName, locality);
        const { region, district, taluka, village, propertyNumber } = coords;

        const maxRetries = 5;
        let solved = false;
        let attempt = 0;
        let tabId = '';

        try {
            this.verboseLog('[Browser] Creating tab...');
            tabId = await camoufox.createTab(IGR_PORTAL_URLS[0]);
            if (!tabId) {
                return { success: false, error: 'Failed to create browser tab.', searchQuery };
            }

            this.verboseLog('[Browser] Waiting for page load...');
            await camoufox.waitForPageLoad(tabId);
            await new Promise((r) => setTimeout(r, 2000));

            // Select Region
            let regionSelector = '';
            if (region.toLowerCase().includes('mumbai')) {
                regionSelector = 'input[value*="Mumbai"], #btnMumbai, input[id*="Mumbai"]';
            } else if (region.toLowerCase().includes('urban')) {
                regionSelector = 'input[value*="Urban"], #btnUrban, input[id*="Urban"]';
            } else {
                regionSelector = 'input[value*="Rest"], #btnRest, input[id*="Rest"]';
            }

            this.verboseLog(`[Locality] Selecting Region: "${region}"...`);
            const regionClicked = await camoufox.evaluate<boolean>(tabId, `
                (() => {
                    const el = document.querySelector(${JSON.stringify(regionSelector)});
                    if (el) {
                        el.click();
                        return true;
                    }
                    return false;
                })()
            `);

            if (regionClicked) {
                this.verboseLog('[Locality] Clicked Region button, waiting for District dropdown (2.5s)...');
                await new Promise((r) => setTimeout(r, 2500));
            }

            // Discover and map form elements dynamically
            const selectors = await camoufox.evaluate<{
                districtSelector: string;
                talukaSelector: string;
                villageSelector: string;
                yearSelector: string;
                propertyNumSelector: string;
                captchaInputSelector: string;
                captchaImgSelector: string;
            }>(tabId, `
                (() => {
                    const selects = Array.from(document.querySelectorAll('select')).map(e => ({ id: e.id, name: e.name }));
                    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="password"]')).map(e => ({ id: e.id, name: e.name }));
                    const images = Array.from(document.querySelectorAll('img')).map(e => ({ id: e.id, src: e.src }));

                    const districtSelector = selects.find(s => s.id.toLowerCase().includes('district') || s.id.toLowerCase().includes('ddldist'))?.id 
                        ? '#' + selects.find(s => s.id.toLowerCase().includes('district') || s.id.toLowerCase().includes('ddldist')).id 
                        : '#ddlDistrict';

                    const talukaSelector = selects.find(s => s.id.toLowerCase().includes('taluka') || s.id.toLowerCase().includes('ddltal') || s.id.toLowerCase().includes('tahsil'))?.id 
                        ? '#' + selects.find(s => s.id.toLowerCase().includes('taluka') || s.id.toLowerCase().includes('ddltal') || s.id.toLowerCase().includes('tahsil')).id 
                        : '#ddlTaluka';

                    const villageSelector = selects.find(s => s.id.toLowerCase().includes('village') || s.id.toLowerCase().includes('ddlvil'))?.id 
                        ? '#' + selects.find(s => s.id.toLowerCase().includes('village') || s.id.toLowerCase().includes('ddlvil')).id 
                        : '#ddlVillage';

                    const yearSelector = selects.find(s => s.id.toLowerCase().includes('year') || s.id.toLowerCase().includes('ddlyear'))?.id 
                        ? '#' + selects.find(s => s.id.toLowerCase().includes('year') || s.id.toLowerCase().includes('ddlyear')).id 
                        : '#ddlFromYear';

                    const propertyNumSelector = inputs.find(i => i.id.toLowerCase().includes('attribute') || i.id.toLowerCase().includes('property') || i.id.toLowerCase().includes('txtprop') || i.id.toLowerCase().includes('survey'))?.id
                        ? '#' + inputs.find(i => i.id.toLowerCase().includes('attribute') || i.id.toLowerCase().includes('property') || i.id.toLowerCase().includes('txtprop') || i.id.toLowerCase().includes('survey')).id
                        : '#txtAttributeValue';

                    const captchaInputSelector = inputs.find(i => i.id.toLowerCase().includes('img') || i.id.toLowerCase().includes('captcha') || i.id.toLowerCase().includes('txtcap'))?.id
                        ? '#' + inputs.find(i => i.id.toLowerCase().includes('img') || i.id.toLowerCase().includes('captcha') || i.id.toLowerCase().includes('txtcap')).id
                        : '#txtImg';

                    const captchaImgSelector = images.find(i => i.id.toLowerCase().includes('captcha') || i.src.toLowerCase().includes('captcha'))?.id
                        ? '#' + images.find(i => i.id.toLowerCase().includes('captcha') || i.src.toLowerCase().includes('captcha')).id
                        : '#imgCaptcha';

                    return {
                        districtSelector,
                        talukaSelector,
                        villageSelector,
                        yearSelector,
                        propertyNumSelector,
                        captchaInputSelector,
                        captchaImgSelector
                    };
                })()
            `);

            if (!selectors) {
                return { success: false, error: 'Failed to auto-discover form elements on search page.', searchQuery };
            }

            const {
                districtSelector,
                villageSelector,
                yearSelector,
                propertyNumSelector,
                captchaInputSelector,
                captchaImgSelector
            } = selectors;

            this.verboseLog('[Form] Selecting District...');
            await camoufox.evaluate<void>(tabId, `
                (() => {
                    const select = document.querySelector(${JSON.stringify(districtSelector)});
                    if (!select) return;
                    
                    const targetDistrict = ${JSON.stringify(district)}.toLowerCase();
                    const options = Array.from(select.options);
                    const match = options.find(o => o.text.toLowerCase().includes(targetDistrict) || o.value.includes(targetDistrict)) || options[options.length - 1];
                    
                    if (match) {
                        select.value = match.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        if (typeof __doPostBack === 'function') {
                            __doPostBack('ddlDistrict', '');
                        }
                    }
                })()
            `);
            this.verboseLog('[Form] Waiting for District postback (2.5s)...');
            await new Promise((r) => setTimeout(r, 2500));

            // Select Village (single vs multiple dropdowns)
            this.verboseLog('[Form] Selecting Village/Area...');
            await camoufox.evaluate<void>(tabId, `
                (() => {
                    const selects = Array.from(document.querySelectorAll('select')).map(s => s.id);
                    const geoSelects = selects.filter(id => id !== 'ddlFromYear' && id !== 'ddlDistrict');
                    const targetVillage = ${JSON.stringify(village)}.toLowerCase();

                    if (geoSelects.length === 1) {
                        const areaFilter = document.querySelector('#txtAreaName');
                        if (areaFilter) {
                            areaFilter.value = ${JSON.stringify(village)};
                            areaFilter.dispatchEvent(new Event('change', { bubbles: true }));
                            if (typeof __doPostBack === 'function') {
                                __doPostBack('txtAreaName', '');
                            }
                        }
                    }
                })()
            `);
            this.verboseLog('[Form] Waiting for Area Filter postback (2.5s)...');
            await new Promise((r) => setTimeout(r, 2500));

            // Set final selection for village, year and property number
            const targetYear = new Date().getFullYear() - 1; // 2025/2024 to probe
            this.verboseLog(`[Form] Setting final inputs (Year: ${targetYear}, PropNo: ${propertyNumber})...`);
            await camoufox.evaluate<void>(tabId, `
                (() => {
                    const selects = Array.from(document.querySelectorAll('select')).map(s => s.id);
                    const geoSelects = selects.filter(id => id !== 'ddlFromYear' && id !== 'ddlDistrict');
                    if (geoSelects.length > 0) {
                        const villageSelect = document.querySelector('#' + geoSelects[0]);
                        if (villageSelect) {
                            const opt = Array.from(villageSelect.options).find(o => o.text.toLowerCase().includes(${JSON.stringify(village)}.toLowerCase()) || o.value.toLowerCase().includes(${JSON.stringify(village)}.toLowerCase())) || villageSelect.options[villageSelect.options.length - 1];
                            if (opt) {
                                villageSelect.value = opt.value;
                                villageSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }

                    const yearSelect = document.querySelector(${JSON.stringify(yearSelector)});
                    if (yearSelect) {
                        const opt = Array.from(yearSelect.options).find(o => o.text.includes(${JSON.stringify(targetYear.toString())}) || o.value.includes(${JSON.stringify(targetYear.toString())}));
                        if (opt) {
                            yearSelect.value = opt.value;
                        }
                    }

                    const propInput = document.querySelector(${JSON.stringify(propertyNumSelector)});
                    if (propInput) {
                        propInput.value = ${JSON.stringify(propertyNumber)};
                        propInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                })()
            `);
            await new Promise((r) => setTimeout(r, 1000));

            // Captcha solving loop
            while (!solved && attempt < maxRetries) {
                attempt++;
                this.verboseLog(`\n--- [CAPTCHA] Solve Attempt ${attempt}/${maxRetries} ---`);

                const oldCaptchaSrc = await camoufox.evaluate<string>(tabId, `
                    document.querySelector(${JSON.stringify(captchaImgSelector)})?.getAttribute('src') || ''
                `);

                let captchaText = '';
                try {
                    captchaText = await this.solveCaptchaOffline(tabId, captchaImgSelector);
                } catch (err: any) {
                    console.error('[CAPTCHA] OCR solver failed:', err.message);
                    await camoufox.evaluate<void>(tabId, `
                        document.querySelector(${JSON.stringify(captchaImgSelector)})?.click();
                    `);
                    await new Promise((r) => setTimeout(r, 2000));
                    continue;
                }

                if (!captchaText || captchaText.length < 3) {
                    this.verboseLog('[CAPTCHA] OCR returned invalid code. Refreshing...');
                    await camoufox.evaluate<void>(tabId, `
                        document.querySelector(${JSON.stringify(captchaImgSelector)})?.click();
                    `);
                    await new Promise((r) => setTimeout(r, 2000));
                    continue;
                }

                this.verboseLog(`[CAPTCHA] Inputting solved code: "${captchaText}"`);
                await camoufox.evaluate<void>(tabId, `
                    (() => {
                        const input = document.querySelector(${JSON.stringify(captchaInputSelector)});
                        if (input) {
                            input.value = ${JSON.stringify(captchaText)};
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    })()
                `);
                await new Promise((r) => setTimeout(r, 500));

                this.verboseLog('[Form] Submitting search...');
                await camoufox.evaluate<void>(tabId, `
                    (() => {
                        const btn = document.querySelector('#btnSearch') || document.querySelector('input[type="submit"][id*="Search"]');
                        if (btn) btn.click();
                    })()
                `);

                // Wait 4 seconds for AJAX response
                await new Promise((r) => setTimeout(r, 4000));

                const errorMsg = await camoufox.evaluate<string>(tabId, `
                    (() => {
                        const label = document.querySelector('[id*="lblerr"], [id*="lblError"], [id*="lblimg"], .alert-danger, .error-message');
                        return label ? label.textContent.trim() : null;
                    })()
                `);

                if (errorMsg && (errorMsg.toLowerCase().includes('captcha') || errorMsg.toLowerCase().includes('invalid') || errorMsg.includes('Correct'))) {
                    this.verboseLog(`❌ [CAPTCHA] Server rejected captcha: "${errorMsg}". Retrying...`);
                    
                    this.verboseLog('[CAPTCHA] Waiting for new Captcha image to load...');
                    let srcChanged = false;
                    for (let t = 0; t < 10; t++) {
                        const newSrc = await camoufox.evaluate<string>(tabId, `
                            document.querySelector(${JSON.stringify(captchaImgSelector)})?.getAttribute('src') || ''
                        `);
                        if (newSrc && newSrc !== oldCaptchaSrc) {
                            srcChanged = true;
                            break;
                        }
                        await new Promise((r) => setTimeout(r, 500));
                    }

                    if (!srcChanged) {
                        this.verboseLog('[CAPTCHA] Force refreshing Captcha image...');
                        await camoufox.evaluate<void>(tabId, `
                            document.querySelector(${JSON.stringify(captchaImgSelector)})?.click();
                        `);
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                } else {
                    this.verboseLog('✅ [CAPTCHA] Submission succeeded!');
                    solved = true;
                }
            }

            if (!solved) {
                return { success: false, error: 'Failed to bypass CAPTCHA after max attempts.', searchQuery };
            }

            // Extract results
            this.verboseLog('[Scraper] Parsing search results table...');
            const rows = await this.extractResults(tabId);
            if (rows.length === 0) {
                return { success: false, error: 'No matching transaction records found on the portal.', searchQuery };
            }

            this.verboseLog(`🎉 [Scraper] Successfully extracted ${rows.length} records! Saving best match...`);
            return this.saveBestMatch(rows, { buildingName, locality, searchQuery });

        } catch (err: any) {
            console.error('[IgrLiveFetchService] Error during fetchAndStore:', err.message);
            return { success: false, error: `Live fetch failed: ${err.message}`, searchQuery };
        } finally {
            if (tabId) {
                await camoufox.closeTab(tabId).catch(() => {});
            }
        }
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
