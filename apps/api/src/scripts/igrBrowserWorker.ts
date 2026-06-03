// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { firefox } from 'playwright-core';
import { launchOptions } from 'camoufox-js';
import Tesseract from 'tesseract.js';

type ScrapeIgrOptions = {
  region?: string;
  district?: string;
  taluka?: string;
  village?: string;
  year?: string;
  propertyNumber?: string;
  headless?: boolean;
  maxRetries?: number;
};

const TRANSLATIONS: Record<string, string[]> = {
  'mumbai suburban': ['मुंबई उपनगर', 'suburban'],
  'mumbai city': ['मुंबई जिल्हा', 'mumbai city', 'mumbai'],
  'thane': ['ठाणे', 'thane'],
  'pune': ['पुणे', 'pune'],
  'raigad': ['रायगड', 'raigad'],
  'palghar': ['पालघर', 'palghar'],
  'andheri': ['अंधेरी', 'andheri'],
  'bandra': ['वांद्रे', 'बांद्रा', 'bandra'],
  'kurla': ['कुर्ला', 'kurla'],
  'worli': ['वरळी', 'worli'],
  'panvel': ['पनवेल', 'panvel'],
  'haveli': ['हवेली', 'haveli'],
  'andheri 1': ['अंधेरी १', 'अंधेरी 1', 'andheri 1'],
  'andheri 2': ['अंधेरी २', 'अंधेरी 2', 'andheri 2'],
  'andheri 3': ['अंधेरी ३', 'अंधेरी 3', 'andheri 3'],
  'andheri 4': ['अंधेरी ४', 'अंधेरी 4', 'andheri 4'],
  'bandra 1': ['वांद्रे १', 'बांद्रा १', 'bandra 1'],
  'kurla 1': ['कुर्ला १', 'kurla 1'],
  'mumbai city 2': ['मुंबई सिटी २', 'mumbai city 2'],
  'mumbai city 3': ['मुंबई सिटी ३', 'mumbai city 3'],
  'thane 1': ['ठाणे १', 'thane 1'],
  'thane 3': ['ठाणे ३', 'thane 3'],
  'thane 6': ['ठाणे ६', 'thane 6'],
  'panvel 1': ['पनवेल १', 'panvel 1'],
  'panvel 2': ['पनवेल २', 'panvel 2'],
  'haveli 4': ['हवेली ४', 'haveli 4'],
  'haveli 21': ['हवेली २१', 'haveli 21'],
  'haveli 22': ['हवेली २२', 'haveli 22'],
};

function normalize(value?: string | null): string {
  return String(value || '').trim();
}

function findMatchingOption(options: Array<{ text: string; value: string }>, queryText: string) {
  const queryLower = queryText.toLowerCase().trim();
  const searchTerms = TRANSLATIONS[queryLower] || [queryLower];
  return options.find((option) => {
    const textLower = option.text.toLowerCase().trim();
    const valueLower = option.value.toLowerCase().trim();
    return searchTerms.some((term) => textLower.includes(term.toLowerCase()) || valueLower.includes(term.toLowerCase()));
  }) || null;
}

function parseAmount(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,\s₹Rs.]/g, '').toLowerCase();
  let multiplier = 1;
  if (cleaned.includes('cr') || cleaned.includes('crore')) multiplier = 10_000_000;
  else if (cleaned.includes('l') || cleaned.includes('lac') || cleaned.includes('lakh')) multiplier = 100_000;
  else if (cleaned.includes('k') || cleaned.includes('thousand')) multiplier = 1_000;
  const num = parseFloat(cleaned.replace(/[^0-9.]/g, ''));
  return Number.isNaN(num) ? null : num * multiplier;
}

function buildOutputDir() {
  const dir = path.join(process.cwd(), 'igr-output');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function solveCaptcha(page: import('playwright-core').Page, captchaSelector: string) {
  const base64 = await page.evaluate((selector) => {
    const img = document.querySelector(selector) as HTMLImageElement | null;
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  }, captchaSelector);

  if (!base64) {
    throw new Error('Failed to capture CAPTCHA image');
  }

  const buffer = Buffer.from(base64, 'base64');
  const result = await Tesseract.recognize(buffer, 'eng');
  return result.data.text.replace(/[^a-zA-Z0-9]/g, '').trim();
}

async function extractResults(page: import('playwright-core').Page): Promise<Array<Record<string, string>>> {
  return await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    let targetTable: HTMLTableElement | null = null;

    for (const table of tables) {
      const trs = Array.from(table.querySelectorAll('tr'));
      let numCount = 0;
      for (const tr of trs) {
        const firstTd = tr.querySelector('td');
        if (firstTd && /^\d+$/.test((firstTd.textContent || '').trim())) {
          numCount += 1;
        }
      }
      if (numCount > 2) {
        targetTable = table as HTMLTableElement;
        break;
      }
    }

    if (!targetTable) return [];

    const rows = Array.from(targetTable.querySelectorAll('tr'));
    const output: Array<Record<string, string>> = [];

    for (let i = 1; i < rows.length; i++) {
      const cols = Array.from(rows[i].querySelectorAll('td')).map((el) => (el.textContent || '').trim());
      if (cols.length < 3) continue;
      const docNo = cols[0];
      if (!/^\d+$/.test(docNo)) continue;
      output.push({
        doc_no: docNo,
        reg_date: cols[1] || '',
        consideration: cols[2] || '',
        stamp_duty: cols[3] || '',
        property_type: cols[4] || '',
        village: cols[5] || '',
        buyer: cols[6] || '',
        seller: cols[7] || '',
      });
    }

    return output;
  });
}

export async function scrapeIGR(options: ScrapeIgrOptions = {}) {
  const {
    region = 'Mumbai',
    district = 'Mumbai Suburban',
    taluka = 'Andheri',
    village = 'Andheri 1',
    year = String(new Date().getFullYear()),
    propertyNumber = '',
    maxRetries = 5,
    headless = true,
  } = options;

  const outputDir = buildOutputDir();
  const hostOS = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const cOptions = await launchOptions({
    headless,
    os: hostOS,
    humanize: true,
    enable_cache: true,
  });

  const browser = await firefox.launch(cOptions);
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata',
  });
  const page = await context.newPage();

  try {
    await page.goto('https://freesearchigrservice.maharashtra.gov.in/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach((div) => {
        const style = window.getComputedStyle(div);
        if (style.zIndex && parseInt(style.zIndex, 10) > 1000 && (style.position === 'fixed' || style.position === 'absolute')) {
          div.remove();
        }
      });
    });

    let regionSelector = 'input[value*="Rest"], #btnRest, input[id*="Rest"]';
    if (region.toLowerCase().includes('mumbai')) {
      regionSelector = 'input[value*="Mumbai"], #btnMumbai, input[id*="Mumbai"]';
    } else if (region.toLowerCase().includes('urban')) {
      regionSelector = 'input[value*="Urban"], #btnUrban, input[id*="Urban"]';
    }

    await page.evaluate((selector) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      el?.click();
    }, regionSelector);
    await page.waitForTimeout(1500);

    const selects = await page.$$eval('select', (els) => els.map((e) => ({ id: e.id, name: e.name })));
    const inputs = await page.$$eval('input[type="text"], input[type="password"]', (els) => els.map((e) => ({ id: e.id, name: e.name })));
    const images = await page.$$eval('img', (els) => els.map((e) => ({ id: e.id, src: e.src })));

    const districtSelector = selects.find((s) => s.id.toLowerCase().includes('district') || s.id.toLowerCase().includes('ddldist'))?.id
      ? `#${selects.find((s) => s.id.toLowerCase().includes('district') || s.id.toLowerCase().includes('ddldist'))!.id}`
      : '#ddlDistrict';
    const yearSelector = selects.find((s) => s.id.toLowerCase().includes('year') || s.id.toLowerCase().includes('ddlyear'))?.id
      ? `#${selects.find((s) => s.id.toLowerCase().includes('year') || s.id.toLowerCase().includes('ddlyear'))!.id}`
      : '#ddlFromYear';
    const propertyNumSelector = inputs.find((i) => i.id.toLowerCase().includes('attribute') || i.id.toLowerCase().includes('property') || i.id.toLowerCase().includes('txtprop') || i.id.toLowerCase().includes('survey'))?.id
      ? `#${inputs.find((i) => i.id.toLowerCase().includes('attribute') || i.id.toLowerCase().includes('property') || i.id.toLowerCase().includes('txtprop') || i.id.toLowerCase().includes('survey'))!.id}`
      : '#txtAttributeValue';
    const captchaInputSelector = inputs.find((i) => i.id.toLowerCase().includes('img') || i.id.toLowerCase().includes('captcha') || i.id.toLowerCase().includes('txtcap'))?.id
      ? `#${inputs.find((i) => i.id.toLowerCase().includes('img') || i.id.toLowerCase().includes('captcha') || i.id.toLowerCase().includes('txtcap'))!.id}`
      : '#txtImg';
    const captchaImgSelector = images.find((i) => i.id.toLowerCase().includes('captcha') || i.src.toLowerCase().includes('captcha'))?.id
      ? `#${images.find((i) => i.id.toLowerCase().includes('captcha') || i.src.toLowerCase().includes('captcha'))!.id}`
      : '#imgCaptcha';

    await page.evaluate(({ selector, value }) => {
      const select = document.querySelector(selector) as HTMLSelectElement | null;
      if (!select) return;
      const target = String(value).toLowerCase();
      const options = Array.from(select.options).map((opt) => ({ text: opt.text, value: opt.value }));
      const match = options.find((opt) => opt.text.toLowerCase().includes(target) || opt.value.toLowerCase().includes(target));
      if (match) {
        select.value = match.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof (window as any).__doPostBack === 'function') {
          (window as any).__doPostBack('ddlDistrict', '');
        }
      }
    }, { selector: districtSelector, value: district });
    await page.waitForTimeout(2500);

    await page.evaluate((villageValue) => {
      const selects = Array.from(document.querySelectorAll('select')).map((s) => s.id);
      const geoSelects = selects.filter((id) => id !== 'ddlFromYear' && id !== 'ddlDistrict');
      if (geoSelects.length === 1) {
        const areaFilter = document.querySelector('#txtAreaName') as HTMLInputElement | null;
        if (areaFilter) {
          areaFilter.value = villageValue;
          areaFilter.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof (window as any).__doPostBack === 'function') {
            (window as any).__doPostBack('txtAreaName', '');
          }
        }
      }
    }, village);
    await page.waitForTimeout(2500);

    const targetYear = new Date().getFullYear() - 1;
    await page.evaluate(({ yearSelectorValue, propertyNum }) => {
      const selects = Array.from(document.querySelectorAll('select')).map((s) => s.id);
      const geoSelects = selects.filter((id) => id !== 'ddlFromYear' && id !== 'ddlDistrict');
      if (geoSelects.length > 0) {
        const villageSelect = document.querySelector('#' + geoSelects[0]) as HTMLSelectElement | null;
        if (villageSelect) {
          const opt = Array.from(villageSelect.options).find((o) => o.text.toLowerCase().includes(String(propertyNum).toLowerCase()) || o.value.toLowerCase().includes(String(propertyNum).toLowerCase())) || villageSelect.options[villageSelect.options.length - 1];
          if (opt) {
            villageSelect.value = opt.value;
            villageSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }

      const yearSelect = document.querySelector(yearSelectorValue) as HTMLSelectElement | null;
      if (yearSelect) {
        const opt = Array.from(yearSelect.options).find((o) => o.text.includes(String(yearSelectorValue)) || o.value.includes(String(yearSelectorValue)));
        if (opt) {
          yearSelect.value = opt.value;
        }
      }

      const propInput = document.querySelector('#txtAttributeValue') as HTMLInputElement | null;
      if (propInput) {
        propInput.value = propertyNum;
        propInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { yearSelectorValue: yearSelector, propertyNum: propertyNumber });
    await page.waitForTimeout(1000);

    let solved = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const captchaText = await solveCaptcha(page, captchaImgSelector).catch(() => '');
      if (!captchaText || captchaText.length < 3) {
        await page.evaluate((selector) => {
          (document.querySelector(selector) as HTMLElement | null)?.click();
        }, captchaImgSelector);
        await page.waitForTimeout(2000);
        continue;
      }

      await page.evaluate(({ selector, captcha }) => {
        const input = document.querySelector(selector) as HTMLInputElement | null;
        if (!input) return;
        input.value = captcha;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, { selector: captchaInputSelector, captcha: captchaText });
      await page.waitForTimeout(500);

      await page.evaluate(() => {
        const btn = document.querySelector('#btnSearch') as HTMLButtonElement | null || document.querySelector('input[type="submit"][id*="Search"]') as HTMLInputElement | null;
        btn?.click();
      });

      await page.waitForTimeout(4000);
      const errorMsg = await page.evaluate(() => {
        const label = document.querySelector('[id*="lblerr"], [id*="lblError"], [id*="lblimg"], .alert-danger, .error-message');
        return label ? label.textContent?.trim() || '' : '';
      });

      if (errorMsg && (errorMsg.toLowerCase().includes('captcha') || errorMsg.toLowerCase().includes('invalid') || errorMsg.includes('Correct'))) {
        await page.evaluate((selector) => {
          (document.querySelector(selector) as HTMLElement | null)?.click();
        }, captchaImgSelector);
        await page.waitForTimeout(2000);
        continue;
      }

      solved = true;
      break;
    }

    if (!solved) {
      throw new Error('Failed to bypass CAPTCHA after max attempts.');
    }

    const tableSelector = 'table[id*="gv"], table[id*="grid"], .table-responsive table, table.table';
    const noRecordsSelector = '[id*="lblNoRecord"], .no-records';

    const match = await Promise.race([
      page.waitForSelector(tableSelector, { state: 'visible', timeout: 20_000 }).then(() => 'table'),
      page.waitForSelector(noRecordsSelector, { state: 'visible', timeout: 20_000 }).then(() => 'norecords'),
    ]).catch(() => 'timeout');

    await page.screenshot({ path: path.join(outputDir, 'results_page.png') }).catch(() => {});

    if (match === 'norecords') {
      return [];
    }

    if (match === 'timeout') {
      const tableCount = await page.locator(tableSelector).count();
      if (tableCount === 0) {
        return [];
      }
    }

    const records = await extractResults(page);
    const outFilename = `igr_data_${district.replace(/\s+/g, '_')}_${taluka}_${village}_${year}_${Date.now()}.json`;
    fs.writeFileSync(path.join(outputDir, outFilename), JSON.stringify(records, null, 2));
    return records;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const idx = args.findIndex((arg) => arg.startsWith(`--${name}=`));
    return idx !== -1 ? args[idx].split('=')[1] : null;
  };

  const region = getArg('region') || 'Mumbai';
  const district = getArg('district') || 'Mumbai Suburban';
  const taluka = getArg('taluka') || 'Andheri';
  const village = getArg('village') || 'Andheri 1';
  const year = getArg('year') || String(new Date().getFullYear());
  const propertyNumber = getArg('propertyNumber') || '';

  scrapeIGR({
    region,
    district,
    taluka,
    village,
    year,
    propertyNumber,
    headless: true,
  })
    .then((data) => {
      console.log(JSON.stringify({ success: true, count: data.length, rows: data.slice(0, 2) }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
