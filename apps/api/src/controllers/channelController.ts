import { Request, Response } from 'express';
import { channelService } from '../services/channelService';
import { whatsappHealthService } from '../services/whatsappHealthService';
import { supabase, supabaseAdmin } from '../config/supabase';
const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'vishal@chaoscraftslabs.com',
]);

function isOwnerSuperAdminEmail(email?: string | null) {
    return OWNER_SUPER_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

function getTenantId(req: Request) {
    const user = (req as any).user;
    return String(user?.id || 'system');
}

async function requireSuperAdmin(req: Request) {
    const tenantId = getTenantId(req);
    const user = (req as any).user;
    const email = String(user?.email || '').trim().toLowerCase();
    if (isOwnerSuperAdminEmail(email)) {
        return tenantId;
    }

    if (!supabaseAdmin) {
        throw new Error('Supabase admin unavailable');
    }

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('app_role')
        .eq('id', tenantId)
        .maybeSingle();

    if (error) {
        throw new Error(error.message || 'Failed to verify role');
    }

    if (data?.app_role !== 'super_admin') {
        const forbidden = new Error('Super admin access required');
        (forbidden as any).statusCode = 403;
        throw forbidden;
    }

    return tenantId;
}

export const listChannels = async (req: Request, res: Response) => {
    try {
        const channels = await channelService.listChannels(getTenantId(req));
        res.json(channels);
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to load channels' });
    }
};

export const createChannel = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const channel = await channelService.createChannel(tenantId, {
            ...req.body,
            createdBy: tenantId,
        });
        res.status(201).json(channel);
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to create channel' });
    }
};

export const listStreamItems = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const authHeader = String(req.headers.authorization || '');
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : null;
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;
        const items = await channelService.listStreamItems(tenantId, accessToken, channelId, sessionLabel);
        res.json(items);
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to load stream items' });
    }
};

export const rebuildStream = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const limit = typeof req.body?.limit === 'number' ? Math.max(1, Math.min(2000, req.body.limit)) : 500;
        const result = await channelService.rebuildStreamFromMessages(tenantId, limit);
        res.json({ success: true, ...result });
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to rebuild stream from saved messages' });
    }
};

export const correctStreamItem = async (req: Request, res: Response) => {
    try {
        const tenantId = await requireSuperAdmin(req);
        const corrected = await channelService.correctStreamItem(
            tenantId,
            tenantId,
            String(req.params.streamItemId || ''),
            {
                type: req.body?.type,
                location: req.body?.location,
                city: req.body?.city,
                price: req.body?.price,
                priceNumeric: typeof req.body?.priceNumeric === 'number' ? req.body.priceNumeric : null,
                bhk: req.body?.bhk,
                source: req.body?.source,
                sourcePhone: req.body?.sourcePhone,
                recordType: req.body?.recordType,
                dealType: req.body?.dealType,
                assetClass: req.body?.assetClass,
                confidence: typeof req.body?.confidence === 'number' ? req.body.confidence : undefined,
                parseNotes: req.body?.parseNotes,
            },
        );
        res.json({ success: true, item: corrected });
    } catch (error: any) {
        const statusCode = error?.statusCode || 500;
        res.status(statusCode).json({ error: error?.message || 'Failed to correct stream item' });
    }
};

export const markChannelRead = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        await channelService.markChannelRead(tenantId, String(req.params.channelId || ''));
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to mark channel as read' });
    }
};

export const attachStreamItemToChannel = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const channelId = String(req.params.channelId || '');
        const streamItemId = String(req.body?.streamItemId || '').trim();

        if (!channelId || !streamItemId) {
            return res.status(400).json({ error: 'Channel and stream item are required' });
        }

        await channelService.attachStreamItemToChannel(tenantId, channelId, streamItemId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to save stream item to channel' });
    }
};

export const getAnalytics = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    const db = supabaseAdmin || supabase;

    try {
        const [health, channels, streamResult, countResult] = await Promise.all([
            whatsappHealthService.getHealth(tenantId).catch(() => null),
            channelService.listChannels(tenantId).catch(() => []),
            db
                ? db
                    .from('stream_items')
                    .select('type, deal_type, locality, source_phone, confidence_score, created_at')
                    .order('created_at', { ascending: false })
                    .limit(5000)
                : Promise.resolve({ data: [], error: null }),
            db
                ? db
                    .from('stream_items')
                    .select('id', { count: 'exact', head: true })
                : Promise.resolve({ count: 0, error: null }),
        ]);

        if (streamResult.error) throw streamResult.error;
        if (countResult.error) throw countResult.error;

        const streamItems = (streamResult.data || []).map((item: any) => ({
            type: item.type,
            dealType: item.deal_type,
            location: item.locality || 'Unknown',
            sourcePhone: item.source_phone || 'Unknown',
            confidence: item.confidence_score || 0,
            createdAt: item.created_at,
        }));
        const now = new Date();
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(now);
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().split('T')[0];
        });

        const dailyVolume = last7Days.map(day => {
            const dayItems = (streamItems || []).filter(item =>
                item.createdAt.startsWith(day)
            );
            return {
                date: day,
                supply: dayItems.filter(i => i.type !== 'Requirement').length,
                demand: dayItems.filter(i => i.type === 'Requirement').length,
            };
        });

        const today = now.toISOString().split('T')[0];
        const hourlyActivity = Array.from({ length: 14 }, (_, i) => {
            const hour = i + 8;
            const count = (streamItems || []).filter(item => {
                if (!item.createdAt.startsWith(today)) return false;
                const itemHour = new Date(item.createdAt).getHours();
                return itemHour === hour;
            }).length;
            return { hour: `${hour}h`, count };
        });

        const locationMap = new Map<string, { supply: number; demand: number }>();
        (streamItems || []).forEach(item => {
            const loc = item.location || 'Unknown';
            if (!locationMap.has(loc)) {
                locationMap.set(loc, { supply: 0, demand: 0 });
            }
            const entry = locationMap.get(loc)!;
            if (item.type === 'Requirement') {
                entry.demand += 1;
            } else {
                entry.supply += 1;
            }
        });

        const topLocations = Array.from(locationMap.entries())
            .map(([name, data]) => ({
                name,
                supply: data.supply,
                demand: data.demand,
                ratio: data.supply > 0 ? +(data.demand / data.supply).toFixed(2) : 0,
                gap: data.demand > data.supply * 0.35 ? 'hot' :
                    data.supply > data.demand * 3 ? 'oversupply' : 'balanced'
            }))
            .sort((a, b) => (b.supply + b.demand) - (a.supply + a.demand))
            .slice(0, 10);

        const brokerMap = new Map<string, { count: number; totalConfidence: number }>();
        (streamItems || []).forEach(item => {
            const phone = item.sourcePhone || 'Unknown';
            if (!brokerMap.has(phone)) {
                brokerMap.set(phone, { count: 0, totalConfidence: 0 });
            }
            const entry = brokerMap.get(phone)!;
            entry.count += 1;
            entry.totalConfidence += item.confidence || 0;
        });

        const topBrokers = Array.from(brokerMap.entries())
            .map(([phone, data]) => ({
                phone,
                count: data.count,
                avgConfidence: data.count > 0 ? Math.round(data.totalConfidence / data.count) : 0,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const typeDist = (streamItems || []).reduce((acc: Record<string, number>, item) => {
            const type = item.dealType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        const dsRatio = dailyVolume.length > 0
            ? +(dailyVolume.reduce((sum, d) => sum + d.demand, 0) / Math.max(1, dailyVolume.reduce((sum, d) => sum + d.supply, 0))).toFixed(1)
            : 0;

        res.json({
            success: true,
            kpi: {
                totalStream: countResult.count || streamItems.length,
                requirements: streamItems.filter(i => i.type === 'Requirement').length,
                supply: streamItems.filter(i => i.type !== 'Requirement').length,
                dsRatio,
                activeBrokers: brokerMap.size,
                channelsCount: (channels || []).length,
            },
            dailyVolume,
            hourlyActivity,
            topLocations,
            topBrokers,
            typeDistribution: typeDist,
            health,
        });
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to load analytics' });
    }
};
