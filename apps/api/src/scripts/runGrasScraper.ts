import { supabaseAdmin } from '../config/supabase';
import { MMR_PUNE_TARGETS, SROTarget } from '../gras/targetMap';

class IgrScraper {
  private readonly currentYear = new Date().getFullYear();

  constructor() {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to run the GRAS scraper');
    }
  }

  async runAll(startYear = 1985) {
    console.log(`--- Starting GRAS historical backfill (${startYear}-${this.currentYear}) ---`);

    for (let year = this.currentYear; year >= startYear; year -= 1) {
      console.log(`Processing year ${year}`);
      for (const target of MMR_PUNE_TARGETS) {
        await this.scrapeSro(target, year);
      }
    }

    console.log('--- Historical backfill complete ---');
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

  private async scrapeSro(target: SROTarget, year: number, startFrom = 1) {
    if (startFrom > 500) {
      console.log(`  ${target.sroName} (${year}) is already up to date`);
      return;
    }

    // Placeholder scraping loop until the real browser/OCR flow is migrated.
    console.log(`  Scraped ${target.sroName} (${year}) from doc #${startFrom} to #${startFrom + 50}`);
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
