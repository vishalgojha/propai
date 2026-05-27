import { supabaseAdmin } from '../config/supabase';
import { aiService } from '../services/aiService';

type TopLocality = {
  name: string;
  slug: string;
};

type StreamInsightItem = {
  type: string | null;
  bhk: string | null;
  price_numeric: number | string | null;
  price_label: string | null;
  created_at: string | null;
};

const TOP_LOCALITIES: readonly TopLocality[] = [
  { name: 'Bandra West', slug: 'bandra-west' },
  { name: 'Bandra East', slug: 'bandra-east' },
  { name: 'Khar West', slug: 'khar-west' },
  { name: 'Santacruz West', slug: 'santacruz-west' },
  { name: 'Juhu', slug: 'juhu' },
  { name: 'Andheri West', slug: 'andheri-west' },
  { name: 'Andheri East', slug: 'andheri-east' },
  { name: 'Versova', slug: 'versova' },
  { name: 'Lokhandwala', slug: 'lokhandwala' },
  { name: 'Powai', slug: 'powai' },
  { name: 'Goregaon West', slug: 'goregaon-west' },
  { name: 'Malad West', slug: 'malad-west' },
  { name: 'Borivali West', slug: 'borivali-west' },
  { name: 'Kandivali West', slug: 'kandivali-west' },
  { name: 'Worli', slug: 'worli' },
  { name: 'Lower Parel', slug: 'lower-parel' },
  { name: 'Prabhadevi', slug: 'prabhadevi' },
  { name: 'Dadar West', slug: 'dadar-west' },
  { name: 'Matunga', slug: 'matunga' },
  { name: 'Chembur', slug: 'chembur' },
] as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export async function runGenerateMarketInsights(now = new Date()) {
  if (!supabaseAdmin) {
    console.warn('[MarketInsights] Supabase service client unavailable; skipping weekly insight generation');
    return;
  }

  const periodEnd = now;
  const periodStart = new Date(periodEnd.getTime() - WEEK_MS);
  const periodLabel = `Week of ${formatDateLabel(periodStart)}`;

  for (const locality of TOP_LOCALITIES) {
    try {
      const [resResult, comResult] = await Promise.all([
        supabaseAdmin.from('stream_items_residential').select('type, bhk, price_numeric, price_label, created_at').ilike('locality', `%${locality.name}%`).gte('created_at', periodStart.toISOString()).lte('created_at', periodEnd.toISOString()).order('created_at', { ascending: false }).limit(200),
        supabaseAdmin.from('stream_items_commercial').select('type, bhk, price_numeric, price_label, created_at').ilike('locality', `%${locality.name}%`).gte('created_at', periodStart.toISOString()).lte('created_at', periodEnd.toISOString()).order('created_at', { ascending: false }).limit(200),
      ]);
      const data = [
        ...(Array.isArray(resResult.data) ? resResult.data : []),
        ...(Array.isArray(comResult.data) ? comResult.data : []),
      ];

      if (resResult.error || comResult.error) {
        console.error('[MarketInsights] Failed to fetch stream items', { locality: locality.name, error: resResult.error || comResult.error });
        continue;
      }

      const items = ((data || []) as StreamInsightItem[]).map(normalizeStreamItem);
      const listings = items.filter((item) => !isRequirement(item.type));
      const requirements = items.filter((item) => isRequirement(item.type));
      const prices = listings
        .map((item) => coerceNumber(item.price_numeric))
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
      const minPrice = prices.length ? Math.min(...prices) : null;
      const maxPrice = prices.length ? Math.max(...prices) : null;
      const avgPrice = prices.length ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : null;
      const demandSignal = getDemandSignal(listings.length, requirements.length);
      const mostCommonConfig = getMostCommonBhk(items);
      const title = `${locality.name} property market - week of ${formatDateLabel(periodStart)}`;
      const summary = await generateSummary({
        locality: locality.name,
        periodLabel,
        listingCount: listings.length,
        requirementCount: requirements.length,
        priceRange: formatPriceRange(minPrice, maxPrice),
        mostCommonConfig,
        demandSignal: formatDemandSignal(demandSignal),
      });

      const slug = `${locality.slug}-week-${formatDateSlug(periodStart)}`;
      const { error: upsertError } = await supabaseAdmin
        .from('market_insights')
        .upsert(
          {
            slug,
            locality: locality.name,
            title,
            summary,
            listing_count: listings.length,
            requirement_count: requirements.length,
            avg_price_numeric: avgPrice,
            min_price_numeric: minPrice,
            max_price_numeric: maxPrice,
            demand_signal: demandSignal,
            period_label: periodLabel,
            period_start: periodStart.toISOString(),
            period_end: periodEnd.toISOString(),
            published_at: periodEnd.toISOString(),
          },
          { onConflict: 'slug' },
        );

      if (upsertError) {
        console.error('[MarketInsights] Failed to upsert insight', { locality: locality.name, error: upsertError });
        continue;
      }

      console.log('[MarketInsights] Generated weekly insight', {
        locality: locality.name,
        slug,
        listings: listings.length,
        requirements: requirements.length,
      });
    } catch (error) {
      console.error('[MarketInsights] Locality insight generation failed', { locality: locality.name, error });
    }
  }
}

class GenerateMarketInsightsJob {
  private timer: ReturnType<typeof setTimeout> | null = null;

  start() {
    if (this.timer) return;
    this.scheduleNext();
  }

  stop() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    console.log('[MarketInsights] Stopped weekly insight job');
  }

  private scheduleNext() {
    const nextRun = getNextMondaySixIst(new Date());
    const delay = Math.max(1_000, nextRun.getTime() - Date.now());
    console.log('[MarketInsights] Next weekly insight run scheduled', { nextRun: nextRun.toISOString() });
    this.timer = setTimeout(async () => {
      this.timer = null;
      await runGenerateMarketInsights(new Date());
      this.scheduleNext();
    }, delay);
  }
}

export const generateMarketInsightsJob = new GenerateMarketInsightsJob();

async function generateSummary(input: {
  locality: string;
  periodLabel: string;
  listingCount: number;
  requirementCount: number;
  priceRange: string;
  mostCommonConfig: string;
  demandSignal: string;
}) {
  const fallback = `${input.locality} recorded ${input.listingCount} active listings and ${input.requirementCount} requirements for ${input.periodLabel.toLowerCase()}. The market signal is ${input.demandSignal.toLowerCase()}, with ${input.mostCommonConfig} appearing most often in the latest activity.`;

  try {
    const response = await aiService.chat(
      [
        `Locality: ${input.locality}.`,
        `Period: ${input.periodLabel}.`,
        `Listings: ${input.listingCount}.`,
        `Requirements: ${input.requirementCount}.`,
        `Price range: ${input.priceRange}.`,
        `Most common config: ${input.mostCommonConfig}.`,
        `Demand signal: ${input.demandSignal}.`,
        'Write a market summary paragraph.',
      ].join('\n'),
      'Google',
      'market_insights',
      undefined,
      'You write factual, neutral real estate market summaries for Mumbai localities. Do not mention messaging platforms or data sources. Write in third person. Max 60 words.',
    );

    const summary = response.text.replace(/\s+/g, ' ').trim();
    return summary || fallback;
  } catch (error) {
    console.warn('[MarketInsights] Gemini summary failed; using fallback summary', {
      locality: input.locality,
      error: error instanceof Error ? error.message : error,
    });
    return fallback;
  }
}

function getNextMondaySixIst(now: Date) {
  const nowMs = now.getTime();
  const nowIst = new Date(nowMs + IST_OFFSET_MS);
  const istDay = nowIst.getUTCDay();
  let daysUntilMonday = (1 - istDay + 7) % 7;

  const targetIst = new Date(Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate() + daysUntilMonday,
    6,
    0,
    0,
    0,
  ));

  let targetUtcMs = targetIst.getTime() - IST_OFFSET_MS;
  if (targetUtcMs <= nowMs) {
    daysUntilMonday += 7;
    targetUtcMs = targetIst.getTime() - IST_OFFSET_MS + WEEK_MS;
  }

  return new Date(targetUtcMs);
}

function normalizeStreamItem(item: StreamInsightItem): StreamInsightItem {
  return {
    type: item.type == null ? null : String(item.type),
    bhk: item.bhk == null ? null : String(item.bhk),
    price_numeric: item.price_numeric == null ? null : coerceNumber(item.price_numeric),
    price_label: item.price_label == null ? null : String(item.price_label),
    created_at: item.created_at == null ? null : String(item.created_at),
  };
}

function isRequirement(type?: string | null) {
  return String(type || '').toLowerCase().includes('requirement');
}

function getDemandSignal(listingCount: number, requirementCount: number) {
  if (requirementCount > listingCount) return 'high_demand';
  if (listingCount > requirementCount * 2 && listingCount > 0) return 'good_supply';
  return 'active';
}

function getMostCommonBhk(items: StreamInsightItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const normalized = normalizeBhk(item.bhk);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed BHK';
}

function normalizeBhk(value?: string | null) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (match) return `${match[1]} BHK`;
  if (/studio/i.test(text)) return 'Studio';
  return text;
}

function formatDemandSignal(signal: string) {
  switch (signal) {
    case 'high_demand':
      return 'High Demand';
    case 'good_supply':
      return 'Good Supply';
    default:
      return 'Active Market';
  }
}

function formatPriceRange(minPrice: number | null, maxPrice: number | null) {
  if (!minPrice && !maxPrice) return 'Price data updating';
  if (minPrice && maxPrice && minPrice !== maxPrice) return `${formatPrice(minPrice)}-${formatPrice(maxPrice)}`;
  return formatPrice(minPrice || maxPrice || null);
}

function formatPrice(value: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) return 'Price data updating';
  if (value >= 10_000_000) return `₹${trimDecimal(value / 10_000_000)}Cr`;
  if (value >= 100_000) return `₹${trimDecimal(value / 100_000)}L`;
  if (value >= 1_000) return `₹${trimDecimal(value / 1_000)}K`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function formatDateSlug(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function coerceNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function trimDecimal(value: number) {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}
