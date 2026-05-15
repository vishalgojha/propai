import { Request, Response } from 'express';
import { supabaseAdmin, createSupabaseServiceClient } from '../config/supabase';
import { isOwnerSuperAdminEmail, HttpError, getErrorMessage } from '../utils/controllerHelpers';

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

function extractPhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 10) return digits;
    return null;
}

function extractPhoneFromText(text: string): string | null {
    const m = text.match(/(?:\+?91)?[6-9]\d{9}/);
    return m ? m[0] : null;
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
            const listingRow = {
                tenant_id,
                source_group_id: item.source_group_id || null,
                structured_data: item.structured_data || {},
                raw_text: item.raw_text || '',
                status: 'Active',
            };
            const { error: le } = await admin.from('listings').insert(listingRow);
            if (le) listingsErr++;
            else listingsOk++;

            const streamRow: Record<string, any> = {
                tenant_id,
                message_id: item.message_id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                source_group_id: item.source_group_id || null,
                source_group_name: item.source_group_name || null,
                source_phone: item.source_phone || null,
                raw_text: item.raw_text || '',
                type: item.type || 'Sale',
                locality: item.locality || null,
                bhk: item.bhk || null,
                price_label: item.price_label || null,
                price_numeric: item.price_numeric || null,
                confidence_score: item.confidence_score ?? 0.8,
                parsed_payload: item.parsed_payload || {},
            };
            if (item.embedding && Array.isArray(item.embedding)) {
                streamRow.embedding = item.embedding;
            }
            const { error: se } = await admin.from('stream_items').insert(streamRow);
            if (se) streamErr++;
            else streamOk++;

            const listingType = toListingType(item.type);
            const phone = item.source_phone || extractPhoneFromText(item.raw_text || '');
            const publicRow = {
                source_message_id: item.message_id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                source_group_id: item.source_group_id || null,
                source_group_name: item.source_group_name || null,
                listing_type: listingType,
                area: item.locality || null,
                sub_area: null,
                location: item.locality || 'Unknown',
                price: item.price_numeric || null,
                price_type: item.type === 'Rent' ? 'monthly' : item.type === 'Sale' ? 'total' : null,
                size_sqft: item.area_sqft || null,
                furnishing: item.furnishing || null,
                bhk: parseBhk(item.bhk),
                property_type: null,
                title: toTitle(item),
                description: item.raw_text || '',
                raw_message: item.raw_text || null,
                cleaned_message: null,
                sender_number: phone,
                primary_contact_name: item.contact_name || null,
                primary_contact_number: phone,
                primary_contact_wa: phone ? `91${phone.replace(/^\+?91/, '')}` : null,
                contacts: item.contacts || [],
                confidence: item.confidence_score ?? 0.8,
                message_timestamp: item.message_timestamp || new Date().toISOString(),
                search_text: [item.raw_text, item.locality, item.bhk, item.type].filter(Boolean).join(' '),
            };
            const { error: pe } = await admin.from('public_listings').insert(publicRow);
            if (pe) console.error('[Ingest] public_listings insert failed:', pe.message, 'for', item.message_id);
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
