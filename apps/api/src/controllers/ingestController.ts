import { Request, Response } from 'express';
import { supabaseAdmin, createSupabaseServiceClient } from '../config/supabase';
import { isOwnerSuperAdminEmail, HttpError, getErrorMessage } from '../utils/controllerHelpers';

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
                furnishing: item.furnishing || null,
                area_sqft: item.area_sqft || null,
                property_category: item.property_category || 'residential',
            };
            if (item.embedding && Array.isArray(item.embedding)) {
                streamRow.embedding = item.embedding;
            }
            const { error: se } = await admin.from('stream_items').insert(streamRow);
            if (se) streamErr++;
            else streamOk++;
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
