import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;
const POLL_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
let timer: ReturnType<typeof setInterval> | null = null;

type FeedItem = {
  external_id: string;
  type: string;
  locality: string | null;
  city: string | null;
  bhk: string | null;
  priceNumeric: number | null;
  priceLabel: string | null;
  areaSqft: number | null;
  propertyCategory: string | null;
  furnishing: string | null;
  floorNumber: number | null;
  totalFloors: number | null;
  title: string;
  description: string;
  rawText: string;
  createdAt: string;
};

async function pullFeed(baseUrl: string, token: string): Promise<{ items: FeedItem[]; partnerLabel: string } | null> {
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/api/syndication/feed`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.warn(`[SyndicationSync] Feed pull failed: ${response.status} for token ${token.slice(0, 8)}...`);
      return null;
    }
    const data = await response.json();
    return { items: data.items || [], partnerLabel: data.partnerLabel || 'Partner' };
  } catch (error) {
    console.error('[SyndicationSync] Feed pull error:', error);
    return null;
  }
}

async function upsertSyndicatedItems(
  acceptorTenantId: string,
  sourceWorkspaceId: string,
  items: FeedItem[],
) {
  if (items.length === 0) return { inserted: 0, skipped: 0 };

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const dedupKey = `syndicated:${item.external_id}`;

    const targetTable = item.propertyCategory === 'commercial' ? 'stream_items_commercial' : 'stream_items_residential';

    const { data: existing } = await db!
      .from(targetTable)
      .select('id')
      .eq('tenant_id', acceptorTenantId)
      .eq('message_id', dedupKey)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error: insertError } = await db!
      .from(targetTable)
      .insert({
        tenant_id: acceptorTenantId,
        message_id: dedupKey,
        raw_text: item.rawText || item.title || item.description || '',
        type: item.type || 'Sale',
        locality: item.locality,
        city: item.city || 'Mumbai',
        bhk: item.bhk,
        price_numeric: item.priceNumeric,
        price_label: item.priceLabel,
        area_sqft: item.areaSqft,
        parsed_payload: {
          displayTitle: item.title,
          description: item.description,
          furnishing: item.furnishing,
          floor_number: item.floorNumber,
          total_floors: item.totalFloors,
          isSyndicated: true,
          sourceWorkspaceId,
        },
        property_category: item.propertyCategory,
        source_workspace_id: sourceWorkspaceId,
        is_syndicated: true,
        created_at: item.createdAt || new Date().toISOString(),
        confidence_score: 85,
        record_type: 'syndicated',
        ingestion_status: 'parsed',
      });

    if (insertError) {
      console.error('[SyndicationSync] Insert error:', insertError);
      skipped++;
    } else {
      inserted++;
    }
  }

  return { inserted, skipped };
}

async function tick() {
  try {
    const activeSyndications = await db!
      .from('broker_syndications')
      .select('id, requester_workspace_id, acceptor_workspace_id, syndication_token, requester_label')
      .eq('status', 'active');

    if (activeSyndications.error) {
      console.error('[SyndicationSync] Failed to fetch active syndications:', activeSyndications.error);
      return;
    }

    if (!activeSyndications.data || activeSyndications.data.length === 0) return;

    const apiBase = process.env.SYNDICATION_API_BASE ||
      process.env.API_BASE_URL ||
      'http://localhost:3001';

    for (const syndication of activeSyndications.data) {
      if (!syndication.acceptor_workspace_id) continue;

      const result = await pullFeed(apiBase, syndication.syndication_token);
      if (!result || result.items.length === 0) continue;

      const stats = await upsertSyndicatedItems(
        syndication.acceptor_workspace_id,
        syndication.requester_workspace_id,
        result.items,
      );

      console.log('[SyndicationSync]', {
        partnerLabel: syndication.requester_label,
        acceptorId: syndication.acceptor_workspace_id,
        feedItems: result.items.length,
        inserted: stats.inserted,
        skipped: stats.skipped,
      });
    }
  } catch (error) {
    console.error('[SyndicationSync] Tick failed:', error);
  }
}

export class SyndicationSyncJob {
  start() {
    if (timer) return;
    console.log('[SyndicationSync] Starting syndication sync job (interval: 20 min)');
    tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);
  }

  stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
      console.log('[SyndicationSync] Stopped');
    }
  }
}

export const syndicationSyncJob = new SyndicationSyncJob();
