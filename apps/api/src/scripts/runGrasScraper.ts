import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { supabaseAdmin } from '../config/supabase';
import { MMR_PUNE_TARGETS, SROTarget } from '../gras/targetMap';

const SCRAPER_SCRIPT = resolve(__dirname, '../scrapers/igr_scanner.py');
const MAX_PER_RUN = 500;

/**
 * IGR Scanner CLI output types
 */
interface ScannerResponse {
  sro: string;
  year: number;
  count: number;
  transactions: IGRTransaction[];
}

interface IGRTransaction {
  doc_number: string;
  year: number;
  sro_office: string;
  district?: string;
  registration_date: string;
  consideration_amount: number;
  stamp_duty: number;
  property_type: string;
  village_locality: string;
  buyer_name: string;
  seller_name: string;
  source: string;
  scraped_at: string;
}

interface DistrictMap {
  [sroName: string]: string;
}

/**
 * Map SRO names → district based on our target definitions
 */
function getDistrict(target: SROTarget): string {
  return target.district || 'Unknown';
}

class IgrScraper {
  private readonly currentYear = new Date().getFullYear();
  private readonly districtMap: DistrictMap = {};

  constructor() {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to run the GRAS scraper');
    }
    // Build district lookup from targets
    for (const target of MMR_PUNE_TARGETS) {
      this.districtMap[target.sroName] = target.district;
    }
  }

  async runAll(startYear = 1985) {
    console.log(`--- Starting GRAS historical backfill (${startYear}-${this.currentYear}) ---`);

    for (let year = this.currentYear; year >= startYear; year -= 1) {
      console.log(`\nProcessing year ${year}`);
      for (const target of MMR_PUNE_TARGETS) {
        await this.scrapeSro(target, year);
      }
    }

    console.log('\n--- Historical backfill complete ---');
  }

  async runLatest() {
    console.log(`--- Polling latest GRAS transactions for ${this.currentYear} ---`);

    for (const target of MMR_PUNE_TARGETS) {
      const lastDoc = await this.getLastProcessedDoc(target, this.currentYear);
      console.log(`[${target.sroName}] last processed doc: ${lastDoc || 'none'}`);
      await this.scrapeSro(target, this.currentYear, lastDoc + 1);
    }
  }

  private async getLastProcessedDoc(target: SROTarget, year: number): Promise<number> {
    const { data, error } = await supabaseAdmin!
      .from('igr_transactions')
      .select('doc_number')
      .eq('sro_office', target.sroName)
      .ilike('doc_number', `%/${year}%`)
      .order('id', { ascending: false })
      .limit(1);

    if (error || !data?.length) {
      return 0;
    }

    const match = String(data[0].doc_number || '').match(/^(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  /**
   * Spawn the Python scanner, collect JSON output, upsert to Supabase.
   */
  private async scrapeSro(target: SROTarget, year: number, startFrom = 1) {
    const district = this.districtMap[target.sroName] || 'Unknown';

    // Check if already up to date (optimization)
    if (startFrom > MAX_PER_RUN) {
      console.log(`  ${target.sroName} (${year}) is already up to date — skipping`);
      return;
    }

    console.log(`\n  → ${target.sroName} (${year}, district: ${district})`);

    try {
      const result = await this.runScanner(target.sroName, year, district);
      const inserted = await this.upsertTransactions(result.transactions);
      console.log(`  ✓ ${result.count} results, ${inserted} upserted`);
    } catch (err) {
      console.error(`  ✗ Failed for ${target.sroName} (${year}):`, err);
    }
  }

  /**
   * Run the Python scanner script and return parsed output.
   */
  private runScanner(
    sro: string,
    year: number,
    district?: string,
  ): Promise<ScannerResponse> {
    return new Promise((resolve, reject) => {
      const args = [SCRAPER_SCRIPT, '--sro', sro, '--year', String(year)];
      if (district && district !== 'Unknown') {
        args.push('--district', district);
      }

      const proc = spawn('python3', args, {
        env: { ...process.env },
        timeout: 300_000, // 5 min per SRO
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(new Error(`Failed to parse scanner output: ${(e as Error).message}`));
          }
        } else {
          reject(new Error(`Scanner exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Upsert transactions into Supabase.
   * Uses doc_number as the upsert key.
   */
  private async upsertTransactions(transactions: IGRTransaction[]): Promise<number> {
    if (!transactions.length) return 0;

    const now = new Date().toISOString();
    const rows = transactions.map((t) => ({
      doc_number: t.doc_number,
      registration_date: t.registration_date || null,
      sro_office: t.sro_office,
      district: t.district || this.districtMap[t.sro_office] || null,
      article_type: '25', // default sale deed
      consideration_amount: t.consideration_amount || 0,
      property_description: t.property_type || null,
      buyer_name: t.buyer_name || null,
      seller_name: t.seller_name || null,
      village_locality: t.village_locality || null,
      scraped_at: t.scraped_at || now,
    }));

    // Build upsert query
    const { data, error } = await supabaseAdmin!
      .from('igr_transactions')
      .upsert(rows, {
        onConflict: 'doc_number',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error('Upsert error:', error.message);
      return 0;
    }

    return (data as any[]).length || rows.length;
  }
}

async function main() {
  const mode = process.argv[2] || 'latest';
  const scraper = new IgrScraper();

  if (mode === 'all') {
    await scraper.runAll();
    return;
  }

  await scraper.runLatest();
}

main().catch((error) => {
  console.error('GRAS scraper failed:', error);
  process.exit(1);
});
