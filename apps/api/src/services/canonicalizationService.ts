import { supabase, supabaseAdmin } from '../config/supabase';
import { aiService } from './aiService';

const db = supabaseAdmin || supabase;

type StreamRow = {
    id: string;
    tenant_id: string;
    type: string;
    record_type: string;
    deal_type: string | null;
    asset_class: string | null;
    property_category?: string | null;
    raw_text: string;
    locality: string | null;
    city: string | null;
    bhk: string | null;
    price_label: string | null;
    price_numeric: number | null;
    confidence_score: number | null;
    source_phone: string | null;
    source_group_id: string | null;
    source_group_name: string | null;
    furnishing?: string | null;
    floor_number?: string | null;
    total_floors?: string | null;
    property_use?: string | null;
    area_sqft?: number | null;
    created_at: string;
    parsed_payload?: Record<string, unknown> | null;
};

type CanonicalRow = {
    id: string;
    record_kind: string;
    deal_type: string;
    asset_class: string;
    property_category: string;
    canonical_title: string | null;
    locality: string | null;
    city: string | null;
    building_name: string | null;
    micro_location: string | null;
    bhk: string | null;
    area_sqft: number | null;
    price_numeric: number | null;
    price_label: string | null;
    furnishing: string | null;
    floor_number: string | null;
    total_floors: string | null;
    property_use: string | null;
    confidence_score: number;
    freshness_score: number;
    source_count: number;
    unique_broker_count: number;
    unique_group_count: number;
    contradiction_count: number;
    status: string;
    first_seen_at: string;
    last_seen_at: string;
    best_stream_item_id: string | null;
    semantic_fingerprint_text: string | null;
};

type MatchDecision = {
    decision: 'match' | 'new' | 'conflict';
    canonicalRecordId: string | null;
    confidence: number;
    summary: string | null;
    agreeingFields: string[];
    conflictingFields: string[];
};

type CanonicalizationResult = {
    decision: 'new' | 'matched' | 'conflicted';
    canonicalRecordId: string | null;
};

const extractJsonPayload = (text: string) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
        throw new Error('AI returned an empty response');
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return fenced?.[1]?.trim() || trimmed;
};

const parseJson = <T>(text: string, context: string): T => {
    try {
        return JSON.parse(extractJsonPayload(text)) as T;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
        throw new Error(`${context}: ${message}`);
    }
};

const fingerprintFor = (item: StreamRow) => {
    const parts = [
        item.record_type,
        item.type,
        item.deal_type || 'unknown',
        item.asset_class || 'unknown',
        item.property_category || 'residential',
        item.parsed_payload?.displayTitle,
        item.parsed_payload?.buildingName,
        item.parsed_payload?.microLocation,
        item.locality,
        item.city,
        item.bhk,
        item.price_label,
        item.area_sqft,
        item.furnishing,
        item.property_use,
    ];

    return parts
        .map((part) => String(part || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' | ');
};

const conflictFieldsFor = (item: StreamRow, canonical: CanonicalRow) => {
    return [
        ['type', item.type, canonical.deal_type === 'pre-leased' ? 'Pre-leased' : canonical.record_kind === 'requirement' ? 'Requirement' : item.type],
        ['locality', item.locality, canonical.locality],
        ['city', item.city, canonical.city],
        ['bhk', item.bhk, canonical.bhk],
        ['price_numeric', item.price_numeric, canonical.price_numeric],
        ['deal_type', item.deal_type, canonical.deal_type],
        ['asset_class', item.asset_class, canonical.asset_class],
    ]
        .filter((entry) => Boolean(entry[1]) && Boolean(entry[2]) && String(entry[1]).trim() !== String(entry[2]).trim())
        .map(([field]) => field as string);
};

export class CanonicalizationService {
    async canonicalizeStreamItem(item: StreamRow) {
        const semanticFingerprintText = fingerprintFor(item);
        const candidates = await this.findCandidates(item);
        const decision = candidates.length > 0
            ? await this.chooseMatch(item, semanticFingerprintText, candidates)
            : {
                decision: 'new',
                canonicalRecordId: null,
                confidence: 0.95,
                summary: 'No recent canonical candidates found.',
                agreeingFields: [],
                conflictingFields: [],
            } satisfies MatchDecision;

        if ((decision.decision === 'match' || decision.decision === 'conflict') && decision.canonicalRecordId) {
            return this.attachToCanonical(item, semanticFingerprintText, decision, candidates);
        }

        return this.createCanonical(item, semanticFingerprintText, decision);
    }

    async backfillTenantStreamItems(tenantId: string, limit = 500, onlyMissing = true) {
        let query = db
            .from('stream_items')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (onlyMissing) {
            query = query.is('canonical_record_id', null);
        }

        const { data, error } = await query;
        if (error) {
            throw new Error(error.message);
        }

        const counts = {
            new: 0,
            matched: 0,
            conflicted: 0,
            failed: 0,
        };

        for (const item of data || []) {
            try {
                const result = await this.canonicalizeStreamItem(item as StreamRow);
                if (result) {
                    counts[result.decision] += 1;
                }
            } catch (error) {
                counts.failed += 1;
                console.error('[Canonicalization] Backfill item failed', {
                    tenantId,
                    streamItemId: item.id,
                    error,
                });
            }
        }

        const { count: canonicalizedCount } = await db
            .from('stream_items')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .not('canonical_record_id', 'is', null);

        return {
            scanned: (data || []).length,
            processed: counts.new + counts.matched + counts.conflicted,
            ...counts,
            totalCanonicalizedStreamItems: canonicalizedCount || 0,
        };
    }

    private async findCandidates(item: StreamRow) {
        let query = db
            .from('canonical_records')
            .select('*')
            .eq('record_kind', item.record_type === 'requirement' ? 'requirement' : 'listing')
            .order('last_seen_at', { ascending: false })
            .limit(5);

        if (item.locality) {
            query = query.eq('locality', item.locality);
        } else if (item.city) {
            query = query.eq('city', item.city);
        }

        const { data, error } = await query;
        if (error) {
            console.error('[Canonicalization] Failed to load canonical candidates', error);
            return [] as CanonicalRow[];
        }

        return (data || []).filter((candidate) => {
            if (item.deal_type && candidate.deal_type !== 'unknown' && candidate.deal_type !== item.deal_type) {
                return false;
            }

            if (item.asset_class && candidate.asset_class !== 'unknown' && candidate.asset_class !== item.asset_class) {
                return false;
            }

            if (typeof item.price_numeric === 'number' && typeof candidate.price_numeric === 'number' && candidate.price_numeric > 0) {
                const delta = Math.abs(item.price_numeric - candidate.price_numeric);
                const tolerance = Math.max(candidate.price_numeric * 0.2, 500000);
                if (delta > tolerance) {
                    return false;
                }
            }

            return true;
        }) as CanonicalRow[];
    }

    private async chooseMatch(item: StreamRow, fingerprint: string, candidates: CanonicalRow[]) {
        const systemPrompt = 'You are PropAI\'s canonical market matcher. Decide if a new parsed stream item matches one existing canonical record. Return valid JSON only.';
        const userPrompt = `New candidate:
${JSON.stringify({
            id: item.id,
            type: item.type,
            recordType: item.record_type,
            dealType: item.deal_type,
            assetClass: item.asset_class,
            propertyCategory: item.property_category || 'residential',
            locality: item.locality,
            city: item.city,
            bhk: item.bhk,
            priceLabel: item.price_label,
            priceNumeric: item.price_numeric,
            title: item.parsed_payload?.displayTitle || null,
            buildingName: item.parsed_payload?.buildingName || null,
            microLocation: item.parsed_payload?.microLocation || null,
            semanticFingerprintText: fingerprint,
            rawText: item.raw_text,
        })}

Candidate canonicals:
${JSON.stringify(candidates.map((candidate) => ({
            id: candidate.id,
            recordKind: candidate.record_kind,
            dealType: candidate.deal_type,
            assetClass: candidate.asset_class,
            propertyCategory: candidate.property_category,
            canonicalTitle: candidate.canonical_title,
            locality: candidate.locality,
            city: candidate.city,
            bhk: candidate.bhk,
            priceLabel: candidate.price_label,
            priceNumeric: candidate.price_numeric,
            buildingName: candidate.building_name,
            microLocation: candidate.micro_location,
            semanticFingerprintText: candidate.semantic_fingerprint_text,
            sourceCount: candidate.source_count,
            contradictionCount: candidate.contradiction_count,
            lastSeenAt: candidate.last_seen_at,
        })))}

Return only this JSON:
{
  "decision": "match" | "new" | "conflict",
  "canonicalRecordId": "uuid or null",
  "confidence": number,
  "summary": "string or null",
  "agreeingFields": ["field"],
  "conflictingFields": ["field"]
}`;

        const raw = await aiService.chat(userPrompt, 'Auto', 'listing_parsing', item.tenant_id, systemPrompt);
        const parsed = parseJson<Partial<MatchDecision>>(raw.text, 'Failed to parse canonical match result');

        return {
            decision: parsed.decision === 'match' || parsed.decision === 'conflict' ? parsed.decision : 'new',
            canonicalRecordId: parsed.canonicalRecordId && candidates.some((candidate) => candidate.id === parsed.canonicalRecordId)
                ? parsed.canonicalRecordId
                : null,
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
            summary: parsed.summary ? String(parsed.summary) : null,
            agreeingFields: Array.isArray(parsed.agreeingFields) ? parsed.agreeingFields.map((field) => String(field)) : [],
            conflictingFields: Array.isArray(parsed.conflictingFields) ? parsed.conflictingFields.map((field) => String(field)) : [],
        } satisfies MatchDecision;
    }

    private async attachToCanonical(item: StreamRow, fingerprint: string, decision: MatchDecision, candidates: CanonicalRow[]) {
        const canonical = candidates.find((candidate) => candidate.id === decision.canonicalRecordId);
        if (!canonical) {
            return this.createCanonical(item, fingerprint, { ...decision, decision: 'new', canonicalRecordId: null });
        }

        const existingEvidence = await db
            .from('canonical_record_evidence')
            .select('stream_item_id, source_phone, source_group_id')
            .eq('canonical_record_id', canonical.id);

        const evidenceRows = existingEvidence.error ? [] : existingEvidence.data || [];
        const alreadyLinked = evidenceRows.some((row) => row.stream_item_id === item.id);
        const hasSourcePhone = Boolean(item.source_phone) && evidenceRows.some((row) => row.source_phone === item.source_phone);
        const hasGroup = Boolean(item.source_group_id) && evidenceRows.some((row) => row.source_group_id === item.source_group_id);
        const fieldConflicts = decision.conflictingFields.length > 0 ? decision.conflictingFields : conflictFieldsFor(item, canonical);
        const contradictionCount = Number(canonical.contradiction_count || 0) + (!alreadyLinked && fieldConflicts.length > 0 ? 1 : 0);
        const nextSourceCount = Number(canonical.source_count || 0) + (alreadyLinked ? 0 : 1);
        const nextUniqueBrokerCount = Number(canonical.unique_broker_count || 0) + (!alreadyLinked && !hasSourcePhone && item.source_phone ? 1 : 0);
        const nextUniqueGroupCount = Number(canonical.unique_group_count || 0) + (!alreadyLinked && !hasGroup && item.source_group_id ? 1 : 0);

        const { error: updateError } = await db
            .from('canonical_records')
            .update({
                canonical_title: canonical.canonical_title || String(item.parsed_payload?.displayTitle || item.locality || '').trim() || null,
                locality: canonical.locality || item.locality,
                city: canonical.city || item.city,
                building_name: canonical.building_name || String(item.parsed_payload?.buildingName || '').trim() || null,
                micro_location: canonical.micro_location || String(item.parsed_payload?.microLocation || '').trim() || null,
                bhk: canonical.bhk || item.bhk,
                area_sqft: canonical.area_sqft ?? item.area_sqft ?? null,
                price_numeric: canonical.price_numeric ?? item.price_numeric ?? null,
                price_label: canonical.price_label || item.price_label,
                furnishing: canonical.furnishing || item.furnishing || null,
                floor_number: canonical.floor_number || item.floor_number || null,
                total_floors: canonical.total_floors || item.total_floors || null,
                property_use: canonical.property_use || item.property_use || null,
                confidence_score: Math.max(Number(canonical.confidence_score || 0), Number(item.confidence_score || 0)),
                freshness_score: Math.max(Number(canonical.freshness_score || 0), Number(item.confidence_score || 0)),
                source_count: nextSourceCount,
                unique_broker_count: nextUniqueBrokerCount,
                unique_group_count: nextUniqueGroupCount,
                contradiction_count: contradictionCount,
                status: contradictionCount >= 3 ? 'conflicted' : canonical.status,
                last_seen_at: item.created_at,
                best_stream_item_id: Number(item.confidence_score || 0) >= Number(canonical.confidence_score || 0) ? item.id : canonical.best_stream_item_id,
                semantic_fingerprint_text: canonical.semantic_fingerprint_text || fingerprint,
                updated_at: new Date().toISOString(),
            })
            .eq('id', canonical.id);

        if (updateError) {
            throw updateError;
        }

        await this.writeEvidence(item, canonical.id, decision, fieldConflicts);
        await this.updateStreamItem(item.id, canonical.id, fingerprint, decision);
        await this.updateSourceReliability(item, decision, decision.decision === 'match');
        return {
            decision: decision.decision === 'conflict' ? 'conflicted' : 'matched',
            canonicalRecordId: canonical.id,
        } satisfies CanonicalizationResult;
    }

    private async createCanonical(item: StreamRow, fingerprint: string, decision: MatchDecision) {
        const { data, error } = await db
            .from('canonical_records')
            .insert({
                record_kind: item.record_type === 'requirement' ? 'requirement' : 'listing',
                deal_type: item.deal_type || 'unknown',
                asset_class: item.asset_class || 'unknown',
                property_category: item.property_category || 'residential',
                canonical_title: String(item.parsed_payload?.displayTitle || item.locality || '').trim() || null,
                locality: item.locality,
                city: item.city,
                building_name: String(item.parsed_payload?.buildingName || '').trim() || null,
                micro_location: String(item.parsed_payload?.microLocation || '').trim() || null,
                bhk: item.bhk,
                area_sqft: item.area_sqft ?? null,
                price_numeric: item.price_numeric ?? null,
                price_label: item.price_label,
                furnishing: item.furnishing || null,
                floor_number: item.floor_number || null,
                total_floors: item.total_floors || null,
                property_use: item.property_use || null,
                confidence_score: Number(item.confidence_score || 0),
                freshness_score: Number(item.confidence_score || 0),
                source_count: 1,
                unique_broker_count: item.source_phone ? 1 : 0,
                unique_group_count: item.source_group_id ? 1 : 0,
                contradiction_count: 0,
                status: 'active',
                first_seen_at: item.created_at,
                last_seen_at: item.created_at,
                best_stream_item_id: item.id,
                semantic_fingerprint_text: fingerprint,
            })
            .select('*')
            .single();

        if (error || !data) {
            throw error || new Error('Failed to create canonical record');
        }

        const nextDecision = { ...decision, decision: 'new' as const, confidence: Math.max(decision.confidence, 0.95) };
        await this.writeEvidence(item, data.id, nextDecision, []);
        await this.updateStreamItem(item.id, data.id, fingerprint, nextDecision);
        await this.updateSourceReliability(item, nextDecision, false);
        return {
            decision: 'new',
            canonicalRecordId: data.id,
        } satisfies CanonicalizationResult;
    }

    private async writeEvidence(item: StreamRow, canonicalRecordId: string, decision: MatchDecision, fieldConflicts: string[]) {
        const agreement = {
            locality: item.locality,
            city: item.city,
            bhk: item.bhk,
            price_numeric: item.price_numeric,
            deal_type: item.deal_type,
            asset_class: item.asset_class,
        };

        const conflicts = fieldConflicts.reduce<Record<string, unknown>>((acc, field) => {
            acc[field] = true;
            return acc;
        }, {});

        await db
            .from('canonical_record_evidence')
            .upsert({
                canonical_record_id: canonicalRecordId,
                stream_item_id: item.id,
                tenant_id: item.tenant_id,
                source_phone: item.source_phone,
                source_group_id: item.source_group_id,
                source_group_name: item.source_group_name,
                evidence_weight: Math.max(0.1, Number(item.confidence_score || 0) / 100),
                match_confidence: decision.confidence,
                merge_decision: decision.decision === 'conflict' ? 'conflict' : decision.decision === 'match' ? 'matched' : 'possible_match',
                field_agreement: agreement,
                field_conflicts: conflicts,
            }, { onConflict: 'canonical_record_id,stream_item_id' });
    }

    private async updateStreamItem(streamItemId: string, canonicalRecordId: string, fingerprint: string, decision: MatchDecision) {
        await db
            .from('stream_items')
            .update({
                parser_version: 'stream_parser_v1',
                semantic_fingerprint_text: fingerprint,
                novelty_score: decision.decision === 'new' ? 1 : Math.max(0.05, 1 - decision.confidence),
                duplicate_cluster_hint: fingerprint.slice(0, 120) || null,
                canonical_record_id: canonicalRecordId,
                canonical_match_confidence: decision.confidence,
                canonical_decision: decision.decision === 'conflict' ? 'conflicted' : decision.decision === 'match' ? 'matched' : 'new',
            })
            .eq('id', streamItemId);
    }

    private async updateSourceReliability(item: StreamRow, decision: MatchDecision, matched: boolean) {
        if (!item.source_phone) {
            return;
        }

        const { data: existing } = await db
            .from('source_reliability')
            .select('*')
            .eq('tenant_id', item.tenant_id)
            .eq('source_phone', item.source_phone)
            .maybeSingle();

        const sampleCount = Number(existing?.sample_count || 0) + 1;
        const acceptedMatchCount = Number(existing?.accepted_match_count || 0) + (matched ? 1 : 0);
        const duplicateCount = Number(existing?.duplicate_count || 0) + (matched ? 1 : 0);
        const rejectedMatchCount = Number(existing?.rejected_match_count || 0) + (decision.decision === 'conflict' ? 1 : 0);
        const currentAverage = Number(existing?.average_confidence || 0);
        const nextAverage = ((currentAverage * Number(existing?.sample_count || 0)) + Number(item.confidence_score || 0)) / sampleCount;
        const reliabilityScore = Math.max(0.1, Math.min(1, (acceptedMatchCount + 1) / (sampleCount + rejectedMatchCount + 1)));

        await db
            .from('source_reliability')
            .upsert({
                tenant_id: item.tenant_id,
                source_phone: item.source_phone,
                source_label: String(item.parsed_payload?.sourceLabel || item.source_phone).trim() || null,
                sample_count: sampleCount,
                duplicate_count: duplicateCount,
                accepted_match_count: acceptedMatchCount,
                rejected_match_count: rejectedMatchCount,
                average_confidence: nextAverage,
                reliability_score: reliabilityScore,
                last_seen_at: item.created_at,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,source_phone' });
    }
}

export const canonicalizationService = new CanonicalizationService();
