import { Request, Response } from 'express';
import { supabaseAdmin, createSupabaseServiceClient } from '../config/supabase';
import { parsePrice, splitMultiListing } from '@propai/price-parser';
import { buildingResolverService } from '../services/buildingResolverService';
import { igrEnrichmentService } from '../services/igrEnrichmentService';
import { isOwnerSuperAdminEmail, HttpError, getErrorMessage } from '../utils/controllerHelpers';
import { normaliseIndianPhone } from '../utils/phoneUtils';
import { buildStreamContentHash, computeStreamCompleteness } from '../utils/streamQuality';
import { embedStreamItem } from '../services/embeddingService';
import { verifyAppSessionToken } from '../services/appAuthTokenService';

type AdminClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

function parseBhk(bhk: string | null | undefined): number | null {
    if (!bhk) return null;
    const m = String(bhk).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function toListingType(type: string | null | undefined): string {
    const t = (type || '').toLowerCase();
    if (t === 'rent') return 'listing_rent';
    if (t === 'sale') return 'listing_sale';
    if (t === 'pre-leased' || t === 'lease') return 'listing_rent';
    return 'requirement';
}

function toTitle(item: any): string {
    const parts: string[] = [];
    if (item.bhk) parts.push(item.bhk);
    if (item.locality) parts.push(item.locality);
    if (item.type) parts.push(item.type === 'Rent' ? 'for Rent' : 'for Sale');
    return parts.join(' ') || 'Property Listing';
}

function extractPhoneFromText(text: string): string | null {
    const m = text.match(/(?:\+?91)?[6-9]\d{9}/);
    return m ? normaliseIndianPhone(m[0]) : null;
}

function extractBhkFromText(text: string): string | null {
    const match = String(text || '').match(/\b(\d+(?:\.\d+)?)\s*bhk\b|\b(\d+(?:\.\d+)?)bhk\b/i);
    const value = match?.[1] || match?.[2];
    return value ? `${value} BHK` : null;
}

function buildSplitMessageId(baseMessageId: string, index: number, total: number) {
    if (total <= 1) {
        return baseMessageId;
    }
    return `${baseMessageId}__part_${index + 1}`;
}

function shouldReplaceLocality(value: string | null | undefined) {
    const normalized = String(value || '').trim();
    return !normalized || /^unknown$/i.test(normalized);
}

async function resolveAndUpdateBuildingMetadata(params: {
    admin: AdminClient;
    rawText: string;
    streamItemId: string;
    messageId: string;
    buildingName?: string | null;
    locality?: string | null;
    city?: string | null;
}) {
    const { admin, rawText, streamItemId, messageId } = params;
    const initialBuildingName = String(params.buildingName || '').trim() || null;
    const currentLocality = String(params.locality || '').trim() || null;
    const currentCity = String(params.city || '').trim() || null;

    const resolved = await buildingResolverService.resolveStreamItemMetadata(rawText, initialBuildingName);
    const resolvedBuildingName = resolved.buildingName;
    const resolvedLocality = resolved.locality;

    if (!resolvedBuildingName && !resolvedLocality) {
        return;
    }

    const streamUpdate: Record<string, string> = {};
    const publicListingUpdate: Record<string, string> = {};

    if (resolvedBuildingName && resolvedBuildingName !== initialBuildingName) {
        streamUpdate.building_name = resolvedBuildingName;
        publicListingUpdate.building_name = resolvedBuildingName;
    }

    if (resolvedLocality && shouldReplaceLocality(currentLocality)) {
        streamUpdate.locality = resolvedLocality;
    }

    if (Object.keys(streamUpdate).length > 0) {
        const [resErr, comErr] = await Promise.all([
            admin.from('stream_items_residential').update(streamUpdate).eq('id', streamItemId),
            admin.from('stream_items_commercial').update(streamUpdate).eq('id', streamItemId),
        ]);
        const streamUpdateError = resErr.error || comErr.error;

        if (streamUpdateError) {
            throw new Error(streamUpdateError.message);
        }
    }

    if (Object.keys(publicListingUpdate).length > 0) {
        const { error: publicListingUpdateError } = await admin
            .from('public_listings')
            .update(publicListingUpdate)
            .eq('source_message_id', messageId);

        if (publicListingUpdateError) {
            throw new Error(publicListingUpdateError.message);
        }
    }

    if (resolvedBuildingName) {
        await igrEnrichmentService.seedBuildingName(resolvedBuildingName, resolvedLocality || currentLocality, currentCity);
        await igrEnrichmentService.queueIfStale(
            resolvedBuildingName,
            resolvedLocality || currentLocality,
            streamItemId,
            currentCity,
        );
    }
}

export const ingestListings = async (req: Request, res: Response) => {
    try {
        const admin = supabaseAdmin || createSupabaseServiceClient();
        if (!admin) {
            return res.status(503).json({ success: false, error: 'Supabase not configured' });
        }

        // Authenticate: accept either service_role key (x-service-key) or super admin JWT
        const serviceKey = (req.headers['x-service-key'] as string || '').trim();
        const authHeader = req.headers.authorization || '';

        let authorized = false;

        if (serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
            authorized = true;
        } else if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const appSession = verifyAppSessionToken(token);
            if (appSession) {
                const email = String(appSession.email || '').trim().toLowerCase();
                if (isOwnerSuperAdminEmail(email) || appSession.app_role === 'super_admin' || appSession.app_role === 'admin') {
                    authorized = true;
                }
            } else {
                const { data: { user }, error } = await admin.auth.getUser(token);
                if (!error && user) {
                    const email = String(user?.email || '').trim().toLowerCase();
                    if (isOwnerSuperAdminEmail(email)) {
                        authorized = true;
                    } else {
                        const { data: profile } = await admin
                            .from('profiles')
                            .select('app_role')
                            .eq('id', user.id)
                            .maybeSingle();
                        if (profile?.app_role === 'super_admin' || profile?.app_role === 'admin') {
                            authorized = true;
                        }
                    }
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ success: false, error: 'Super admin access required (use x-service-key or super admin JWT)' });
        }

        const { tenant_id, listings } = req.body;
        if (!tenant_id || !listings || !Array.isArray(listings) || !listings.length) {
            return res.status(400).json({ success: false, error: 'tenant_id and listings[] are required' });
        }

        let listingsOk = 0;
        let listingsErr = 0;
        let streamOk = 0;
        let streamErr = 0;

        for (const item of listings) {
            const buildingName = String(item?.parsed_payload?.buildingName || item.building_name || '').trim();
            const splitRawTexts = splitMultiListing(String(item.raw_text || ''));
            const baseMessageId = String(item.message_id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
            const createdAt = item.created_at || item.message_timestamp || new Date().toISOString();

            for (const [index, rawText] of splitRawTexts.entries()) {
                const splitMessageId = buildSplitMessageId(baseMessageId, index, splitRawTexts.length);
                const price = parsePrice(rawText, item.type || item.deal_type || undefined);
                const bhk = extractBhkFromText(rawText) || item.bhk || null;
                const sourcePhone = normaliseIndianPhone(item.source_phone || item.sender_jid || item.remote_jid);
                const contentHash = buildStreamContentHash(rawText, sourcePhone);
                const completeness = computeStreamCompleteness({
                    locality: item.locality || null,
                    bhk,
                    sqft: item.area_sqft || null,
                    priceNumeric: price.numeric ?? item.price_numeric ?? null,
                    brokerContactValid: Boolean(sourcePhone),
                });
                const listingRow = {
                    tenant_id,
                    source_group_id: item.source_group_id || null,
                    structured_data: item.structured_data || {},
                    raw_text: rawText,
                    status: 'Active',
                    created_at: createdAt,
                };
                const { error: le } = await admin.from('listings').insert(listingRow);
                if (le) listingsErr++;
                else listingsOk++;

                const streamRow: Record<string, any> = {
                    tenant_id,
                    message_id: splitMessageId,
                    source_message_id: baseMessageId,
                    source_group_id: item.source_group_id || null,
                    source_group_name: item.source_group_name || null,
                    source_phone: sourcePhone,
                    content_hash: contentHash,
                    raw_text: rawText,
                    type: item.type || 'Sale',
                    locality: item.locality || null,
                    bhk,
                    price_label: price.label || item.price_label || null,
                    price_numeric: price.numeric ?? item.price_numeric ?? null,
                    confidence_score: item.confidence_score ?? 0.8,
                    broker_name: item.contact_name || null,
                    building_name: buildingName || null,
                    created_at: createdAt,
                    parsed_payload: {
                        ...(item.parsed_payload || {}),
                        buildingName: buildingName || null,
                        sourceMessageId: baseMessageId,
                        splitIndex: splitRawTexts.length > 1 ? index : undefined,
                        splitCount: splitRawTexts.length > 1 ? splitRawTexts.length : undefined,
                        streamQuality: {
                            completenessScore: completeness.completeness_score,
                            isComplete: completeness.is_complete,
                            brokerContactValid: Boolean(sourcePhone),
                        },
                    },
                };
                if (item.embedding && Array.isArray(item.embedding) && splitRawTexts.length === 1) {
                    streamRow.embedding = item.embedding;
                } else if (splitRawTexts.length === 1) {
                    const embedding = await embedStreamItem({
                        record_type: item.record_type || null,
                        deal_type: item.deal_type || item.type?.toLowerCase() || null,
                        asset_class: item.asset_class || null,
                        property_category: item.property_category || null,
                        building_name: buildingName || null,
                        micro_location: item.micro_location || null,
                        locality: item.locality || null,
                        city: item.city || null,
                        bhk: bhk != null ? `${bhk}BHK` : null,
                        price_label: price.label || item.price_label || null,
                        area_sqft: item.area_sqft ?? null,
                        furnishing: item.furnishing || null,
                        property_use: item.property_use || null,
                    });
                    if (embedding) streamRow.embedding = embedding;
                }
                const targetTable = item.property_category === 'commercial' ? 'stream_items_commercial' : 'stream_items_residential';
                const { data: insertedStreamItem, error: se } = await admin
                    .from(targetTable)
                    .insert(streamRow)
                    .select('id')
                    .maybeSingle();
                if (se) streamErr++;
                else {
                    streamOk++;
                    if (buildingName && insertedStreamItem?.id) {
                        void igrEnrichmentService.seedBuildingName(buildingName, item.locality || null, item.city || null).catch((error) => {
                            console.error('[Ingest] Failed to seed IGR building index', {
                                streamItemId: insertedStreamItem.id,
                                buildingName,
                                locality: item.locality || null,
                                city: item.city || null,
                                error: error instanceof Error ? error.message : error,
                            });
                        });
                        void igrEnrichmentService
                            .queueIfStale(buildingName, item.locality || null, insertedStreamItem.id, item.city || null)
                            .catch((error) => {
                                console.error('[Ingest] Failed to queue IGR enrichment', {
                                    streamItemId: insertedStreamItem.id,
                                    buildingName,
                                    locality: item.locality || null,
                                    city: item.city || null,
                                    error: error instanceof Error ? error.message : error,
                                });
                            });
                    }
                }

                const listingType = toListingType(item.type);
                const phone = sourcePhone || extractPhoneFromText(rawText);
                const publicRow = {
                    source_message_id: splitMessageId,
                    source_group_id: item.source_group_id || null,
                    source_group_name: item.source_group_name || null,
                    listing_type: listingType,
                    area: item.locality || null,
                    sub_area: null,
                    location: item.locality || 'Unknown',
                    price: price.numeric ?? item.price_numeric ?? null,
                    price_type: price.basis === 'monthly_rent' ? 'monthly' : item.type === 'Sale' ? 'total' : null,
                    size_sqft: item.area_sqft || null,
                    furnishing: item.furnishing || null,
                    bhk: parseBhk(bhk),
                    building_name: buildingName || null,
                    property_type: null,
                    title: toTitle({ ...item, bhk }),
                    description: rawText,
                    raw_message: rawText,
                    cleaned_message: null,
                    sender_number: phone,
                    primary_contact_name: item.contact_name || null,
                    primary_contact_number: phone,
                    primary_contact_wa: phone ? `91${phone.replace(/^\+?91/, '')}` : null,
                    contacts: item.contacts || [],
                    confidence: item.confidence_score ?? 0.8,
                    message_timestamp: createdAt,
                    search_text: [rawText, item.locality, bhk, item.type].filter(Boolean).join(' '),
                };
                const { error: pe } = await admin.from('public_listings').insert(publicRow);
                if (pe) console.error('[Ingest] public_listings insert failed:', pe.message, 'for', splitMessageId);

                if (insertedStreamItem?.id && (!buildingName || shouldReplaceLocality(item.locality || null))) {
                    void resolveAndUpdateBuildingMetadata({
                        admin,
                        rawText,
                        streamItemId: insertedStreamItem.id,
                        messageId: splitMessageId,
                        buildingName,
                        locality: item.locality || null,
                        city: item.city || null,
                    }).catch((error) => {
                        console.error('[Ingest] Failed to resolve building/locality metadata', {
                            streamItemId: insertedStreamItem.id,
                            messageId: splitMessageId,
                            error: error instanceof Error ? error.message : error,
                        });
                    });
                }
            }
        }

        res.json({
            success: true,
            total: listings.length,
            listings: { ok: listingsOk, err: listingsErr },
            stream_items: { ok: streamOk, err: streamErr },
        });
    } catch (error: any) {
        const status = error instanceof HttpError ? error.statusCode : 500;
        res.status(status).json({ success: false, error: getErrorMessage(error, 'Ingest failed') });
    }
};
