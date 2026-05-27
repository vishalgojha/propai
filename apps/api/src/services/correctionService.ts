import { supabase, supabaseAdmin } from '../config/supabase';
import { aiService } from './aiService';

const db = supabaseAdmin ?? supabase;

export class CorrectionService {

  async applyCorrection(tenantId: string, correctedBy: string, prompt: string): Promise<{
    updatedItems: number;
    updatedCanonicals: number;
    summary: string;
  }> {
    const correction = await this.extractCorrection(prompt);

    if (!correction || !correction.buildingName) {
      return {
        updatedItems: 0,
        updatedCanonicals: 0,
        summary: 'I could not figure out which building or field you want to correct. Please say something like "Felicia is in Bandra West, not East."',
      };
    }

    const { buildingName, field, newValue } = correction;

    const streamField = this.mapFieldToStreamColumn(field);
    const canonicalField = this.mapFieldToCanonicalColumn(field);

    if (!streamField) {
      return {
        updatedItems: 0,
        updatedCanonicals: 0,
        summary: `I don't know how to correct "${field}" yet. I can fix: locality, city, bhk, price, furnishing, floor, property type, or status.`,
      };
    }

    const [resItems, comItems] = await Promise.all([
      db.from('stream_items_residential').select('id, building_name, locality, city, property_category').eq('tenant_id', tenantId).or(`building_name.ilike.%${buildingName}%,raw_text.ilike.%${buildingName}%`),
      db.from('stream_items_commercial').select('id, building_name, locality, city, property_category').eq('tenant_id', tenantId).or(`building_name.ilike.%${buildingName}%,raw_text.ilike.%${buildingName}%`),
    ]);
    const items = [
      ...(Array.isArray(resItems.data) ? resItems.data : []),
      ...(Array.isArray(comItems.data) ? comItems.data : []),
    ];

    if (resItems.error && comItems.error) {
      console.error('[Correction] Search failed:', resItems.error, comItems.error);
      return { updatedItems: 0, updatedCanonicals: 0, summary: 'Something went wrong while searching your records.' };
    }

    if (!items || items.length === 0) {
      return {
        updatedItems: 0,
        updatedCanonicals: 0,
        summary: `I searched your workspace for "${buildingName}" but could not find any records mentioning it.`,
      };
    }

    let updatedCount = 0;
    let failedCount = 0;

    for (const item of items) {
      const originalPayload = { ...item };
      const updatePayload: Record<string, unknown> = {};
      updatePayload[streamField] = newValue;

      const table = item.property_category === 'commercial' ? 'stream_items_commercial' : 'stream_items_residential';
      const { error: updateError } = await db
        .from(table)
        .update(updatePayload)
        .eq('id', item.id)
        .eq('tenant_id', tenantId);

      if (updateError) {
        console.error(`[Correction] Failed to update item ${item.id}:`, updateError);
        failedCount++;
        continue;
      }

      const logPayload = {
        tenant_id: tenantId,
        stream_item_id: item.id,
        corrected_by: correctedBy,
        original_payload: originalPayload,
        corrected_payload: { ...originalPayload, ...updatePayload },
        correction_note: `Broker correction: ${field} changed to "${newValue}" for building "${buildingName}"`,
      };

      const { error: logError } = await db
        .from('stream_item_corrections')
        .insert(logPayload);

      if (logError) {
        console.error('[Correction] Failed to log correction:', logError);
      }

      updatedCount++;
    }

    const { data: canonicals, error: canonError } = await db
      .from('canonical_records')
      .select('id, building_name, locality')
      .eq('record_kind', 'listing')
      .ilike('building_name', `%${buildingName}%`);

    let canonUpdatedCount = 0;

    if (!canonError && canonicals && canonicals.length > 0 && canonicalField) {
      for (const record of canonicals) {
        const { error: canonUpdateError } = await db
          .from('canonical_records')
          .update({ [canonicalField]: newValue })
          .eq('id', record.id);

        if (!canonUpdateError) {
          canonUpdatedCount++;
        }
      }
    }

    const parts: string[] = [];
    if (updatedCount > 0) {
      parts.push(`Updated **${updatedCount}** record${updatedCount === 1 ? '' : 's'} in your workspace`);
    }
    if (canonUpdatedCount > 0) {
      parts.push(`and **${canonUpdatedCount}** canonical record${canonUpdatedCount === 1 ? '' : 's'}`);
    }
    if (failedCount > 0) {
      parts.push(`(${failedCount} failed)`);
    }
    parts.push(`— "${field}" set to "${newValue}" for "${buildingName}".`);

    return {
      updatedItems: updatedCount,
      updatedCanonicals: canonUpdatedCount,
      summary: parts.join(' '),
    };
  }

  private async extractCorrection(prompt: string): Promise<{
    buildingName: string;
    field: string;
    newValue: string;
  } | null> {
    const systemPrompt = [
      'You are a correction extractor for a real estate CRM.',
      'Given a broker message correcting property data, extract:',
      '- buildingName: the building/project name being corrected (required)',
      '- field: which field is being corrected (locality, city, bhk, price, furnishing, floor, type, status)',
      '- newValue: the corrected value',
      'Return strict JSON only. No markdown, no extra text.',
      'Example: {"buildingName":"Felicia","field":"locality","newValue":"Bandra West"}',
      'If you cannot identify the building, return null.',
    ].join(' ');

    try {
      const response = await aiService.chat(prompt, 'Auto', 'correction_extraction', undefined, systemPrompt);
      const text = response.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed?.buildingName || !parsed?.field || !parsed?.newValue) return null;
      return {
        buildingName: String(parsed.buildingName).trim(),
        field: String(parsed.field).trim().toLowerCase(),
        newValue: String(parsed.newValue).trim(),
      };
    } catch {
      return null;
    }
  }

  private mapFieldToStreamColumn(field: string): string | null {
    const map: Record<string, string> = {
      locality: 'locality',
      location: 'locality',
      area: 'locality',
      city: 'city',
      bhk: 'bhk',
      price: 'price_label',
      furnishing: 'furnishing',
      floor: 'floor_number',
      'floor number': 'floor_number',
      type: 'property_category',
      'property type': 'property_category',
      status: 'type',
      'deal type': 'deal_type',
      'asset class': 'asset_class',
      'property use': 'property_use',
    };
    return map[field] || null;
  }

  private mapFieldToCanonicalColumn(field: string): string | null {
    const map: Record<string, string> = {
      locality: 'locality',
      location: 'locality',
      area: 'locality',
      city: 'city',
      bhk: 'bhk',
      price: 'price_label',
      furnishing: 'furnishing',
      floor: 'floor_number',
      'floor number': 'floor_number',
      type: 'property_category',
      'property type': 'property_category',
      'deal type': 'deal_type',
      'asset class': 'asset_class',
      'property use': 'property_use',
    };
    return map[field] || null;
  }
}

export const correctionService = new CorrectionService();
