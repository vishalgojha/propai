import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { sanitizeBuildingNameCandidate } from '../utils/streamMetadataSanitizer';

type CacheEntry = {
  locality: string | null;
  expiresAt: number;
};

type ResolvedStreamMetadata = {
  buildingName: string | null;
  locality: string | null;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const PROPERTY_SIGNAL_PATTERN = /\b(flat|office|shop|available|outrate)\b/i;
const TRAILING_STOP_PATTERN = /\b(for rent|for sale|rent|sale|lease|outrate|asking|negotiable|possession|call|contact|mob|mobile|phone)\b.*$/i;
const MULTISPACE_PATTERN = /\s+/g;

function normalizeValue(value: string | null | undefined) {
  return String(value || '').trim();
}

function toCacheKey(buildingName: string) {
  return normalizeValue(buildingName).toLowerCase();
}

function cleanExtractedBuilding(value: string | null | undefined) {
  const trimmed = normalizeValue(value)
    .replace(/^[\s:,@-]+/, '')
    .replace(TRAILING_STOP_PATTERN, '')
    .replace(/[|;,]+$/g, '')
    .replace(MULTISPACE_PATTERN, ' ')
    .trim();

  return sanitizeBuildingNameCandidate(trimmed);
}

export class BuildingResolverService {
  private readonly localityCache = new Map<string, CacheEntry>();

  private getAdmin(): SupabaseClient {
    if (!supabaseAdmin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for building resolution');
    }

    return supabaseAdmin;
  }

  async resolveLocality(buildingName: string): Promise<string | null> {
    const normalizedBuildingName = normalizeValue(buildingName);
    if (!normalizedBuildingName) {
      return null;
    }

    const cacheKey = toCacheKey(normalizedBuildingName);
    const cached = this.localityCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.locality;
    }

    const { data, error } = await this.getAdmin()
      .from('igr_transactions')
      .select('village_locality, locality, reg_date')
      .ilike('building_name', `%${normalizedBuildingName}%`)
      .order('reg_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const locality = cleanExtractedBuilding(
      (data as { village_locality?: string | null; locality?: string | null } | null)?.village_locality
      || (data as { village_locality?: string | null; locality?: string | null } | null)?.locality
      || null,
    );

    this.localityCache.set(cacheKey, {
      locality,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return locality;
  }

  resolveBuilding(rawText: string): string | null {
    const text = normalizeValue(rawText);
    if (!text) {
      return null;
    }

    const directPatterns = [
      /\b(?:building|building\s+name|bldg|project)\s*[:,-]\s*([A-Z][A-Za-z0-9&'()./-]+(?:\s+[A-Z][A-Za-z0-9&'()./-]+){0,5})/,
      /\b(?:available\s+for\s+\w+\s+@\s*)([A-Z][A-Za-z0-9&'()./-]+(?:\s+[A-Z][A-Za-z0-9&'()./-]+){0,5})/,
      /@\s*([A-Z][A-Za-z0-9&'()./-]+(?:\s+[A-Z][A-Za-z0-9&'()./-]+){0,5})/,
    ];

    for (const pattern of directPatterns) {
      const match = text.match(pattern);
      const cleaned = cleanExtractedBuilding(match?.[1] || null);
      if (cleaned) {
        return cleaned;
      }
    }

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (!PROPERTY_SIGNAL_PATTERN.test(line)) {
        continue;
      }

      const signalMatch = line.match(
        /\b(?:flat|office|shop|available|outrate)\b[\s:-]*([A-Z][A-Za-z0-9&'()./-]+(?:\s+[A-Z][A-Za-z0-9&'()./-]+){1,5})/,
      );
      const cleaned = cleanExtractedBuilding(signalMatch?.[1] || null);
      if (cleaned) {
        return cleaned;
      }
    }

    return null;
  }

  async resolveStreamItemMetadata(rawText: string, existingBuildingName?: string | null): Promise<ResolvedStreamMetadata> {
    const buildingName = cleanExtractedBuilding(existingBuildingName) || this.resolveBuilding(rawText);
    if (!buildingName) {
      return {
        buildingName: null,
        locality: null,
      };
    }

    const locality = await this.resolveLocality(buildingName);
    return {
      buildingName,
      locality,
    };
  }
}

export const buildingResolverService = new BuildingResolverService();
