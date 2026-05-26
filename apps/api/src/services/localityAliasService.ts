import { supabase, supabaseAdmin } from '../config/supabase';

type AliasRow = {
  id: string;
  raw_text_fragment: string;
  standard_locality: string;
  added_by: string;
  created_at: string;
};

export class LocalityAliasService {
  private db = supabaseAdmin ?? supabase;

  async getAllAliases(): Promise<AliasRow[]> {
    const { data } = await this.db
      .from('locality_aliases')
      .select('*')
      .order('created_at', { ascending: false });
    return (data ?? []) as AliasRow[];
  }

  async findAliasForText(text: string): Promise<string | null> {
    const normalized = text.toLowerCase();
    const { data } = await this.db
      .from('locality_aliases')
      .select('raw_text_fragment, standard_locality');
    if (!data) return null;

    const fragments = data as { raw_text_fragment: string; standard_locality: string }[];
    for (const row of fragments) {
      if (normalized.includes(row.raw_text_fragment.toLowerCase())) {
        return row.standard_locality;
      }
    }
    return null;
  }

  async saveAlias(fragment: string, standardLocality: string, addedBy: string): Promise<{ id: string; updatedCount: number }> {
    const { data, error } = await this.db
      .from('locality_aliases')
      .insert({ raw_text_fragment: fragment.trim(), standard_locality: standardLocality.trim(), added_by: addedBy })
      .select('id')
      .single();

    if (error) throw new Error(error.message);

    // Propagate: update all stream_items where raw_text contains the fragment and locality is unresolved
    const fragmentLower = fragment.trim().toLowerCase();
    const { data: matchData, error: matchError } = await this.db
      .from('stream_items')
      .select('id')
      .or(`locality.is.null,locality.in.("Mumbai market","Mumbai","Navi Mumbai","Thane","Pune")`)
      .ilike('raw_text', `%${fragmentLower}%`);

    if (matchError) throw new Error(matchError.message);

    const ids = (matchData ?? []).map((r: any) => r.id);
    let updatedCount = 0;

    if (ids.length > 0) {
      const { error: updateError } = await this.db
        .from('stream_items')
        .update({ locality: standardLocality.trim() })
        .in('id', ids);
      if (!updateError) updatedCount = ids.length;
    }

    // Broadcast via Supabase Realtime so the Stream page updates live
    try {
      await this.db.channel('teach-pulse-updates').send({
        type: 'broadcast',
        event: 'alias_saved',
        payload: { fragment: fragment.trim(), locality: standardLocality.trim(), updatedCount },
      });
    } catch { /* realtime may not be enabled — ignore */ }

    return { id: data!.id, updatedCount };
  }

  async getUnresolvedItems(days = 7, limit = 200): Promise<any[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data } = await this.db
      .from('stream_items')
      .select('id, tenant_id, raw_text, locality, city, bhk, type, price_label, price_numeric, confidence_score, record_type, created_at')
      .gte('created_at', since)
      .or(
        'locality.is.null,' +
        'locality.in.("Mumbai market","Mumbai","Navi Mumbai","Thane","Pune"),' +
        'confidence_score.lt.0.4,' +
        'bhk.eq.N/A'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []).filter((row: any) => {
      const loc = String(row.locality || '').trim().toLowerCase();
      if (!loc || ['mumbai market', 'mumbai', 'navi mumbai', 'thane', 'pune'].includes(loc)) return true;
      if (row.confidence_score != null && Number(row.confidence_score) < 0.4) return true;
      if (String(row.bhk || '').trim() === 'N/A') return true;
      return false;
    });
  }

  async correctItem(tenantId: string, itemId: string, corrections: {
    locality?: string;
    bhk?: string;
    type?: string;
    priceNumeric?: number;
  }): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (corrections.locality) updateData.locality = corrections.locality.trim();
    if (corrections.bhk) updateData.bhk = corrections.bhk.trim();
    if (corrections.type) updateData.type = corrections.type;
    if (corrections.priceNumeric != null) updateData.price_numeric = corrections.priceNumeric;

    const { error } = await this.db
      .from('stream_items')
      .update(updateData)
      .eq('id', itemId)
      .eq('tenant_id', tenantId);

    if (error) throw new Error(error.message);
  }

  async processAll(onProgress?: (processed: number, total: number) => void): Promise<{ total: number; resolved: number; queued: number }> {
    const batchSize = 500;

    // Count total records needing processing
    const { count: total } = await this.db
      .from('stream_items')
      .select('id', { count: 'exact', head: true })
      .or(
        'locality.is.null,' +
        'locality.in.("Mumbai market","Mumbai","Navi Mumbai","Thane","Pune"),' +
        'confidence_score.lt.0.4,' +
        'bhk.eq.N/A'
      );

    const totalCount = total ?? 0;
    if (totalCount === 0) return { total: 0, resolved: 0, queued: 0 };

    // Load all aliases upfront for fast matching
    const aliases = await this.getAllAliases();
    const aliasMap = new Map<string, string>();
    for (const a of aliases) {
      aliasMap.set(a.raw_text_fragment.toLowerCase(), a.standard_locality);
    }

    let processed = 0;
    let resolved = 0;
    let cursor: string | null = null;

    while (processed < totalCount) {
      let query = this.db
        .from('stream_items')
        .select('id, raw_text, locality, confidence_score, bhk, created_at')
        .or(
          'locality.is.null,' +
          'locality.in.("Mumbai market","Mumbai","Navi Mumbai","Thane","Pune"),' +
          'confidence_score.lt.0.4,' +
          'bhk.eq.N/A'
        )
        .order('created_at', { ascending: false })
        .limit(batchSize);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data: batch } = await query;
      if (!batch || batch.length === 0) break;

      cursor = batch[batch.length - 1]?.created_at as string;
      processed += batch.length;

      // Try to resolve each item using aliases
      const idsToUpdate: { id: string; locality: string }[] = [];
      for (const row of batch) {
        const text = String(row.raw_text || '').toLowerCase();
        let match: string | null = null;
        for (const [fragment, locality] of aliasMap) {
          if (text.includes(fragment)) {
            match = locality;
            break;
          }
        }
        if (match) {
          idsToUpdate.push({ id: row.id, locality: match });
        }
      }

      // Batch update resolved items
      for (const item of idsToUpdate) {
        await this.db.from('stream_items').update({ locality: item.locality }).eq('id', item.id);
      }
      resolved += idsToUpdate.length;

      onProgress?.(processed, totalCount);
    }

    return { total: totalCount, resolved, queued: totalCount - resolved };
  }
}

export const localityAliasService = new LocalityAliasService();
