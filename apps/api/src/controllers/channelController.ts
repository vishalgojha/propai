import { Request, Response } from 'express';
import { channelService } from '../services/channelService';
import type { StreamListFilters } from '../services/channelService';
import { getAnalytics as getAnalyticsData } from '../services/analyticsService';
import { getTenantId, requireSuperAdmin, getErrorMessage, getErrorStatus, isOwnerSuperAdminEmail } from '../utils/controllerHelpers';
import { subscriptionService } from '../services/subscriptionService';
import '../types/express';

const VALID_STREAM_TYPES = new Set(['Rent', 'Sale', 'Requirement', 'Pre-leased', 'Lease']);
const VALID_CONFIDENCE_BANDS = new Set(['low', 'medium', 'high']);
const VALID_TIME_BANDS = new Set(['1h', '4h', '1d', '7d']);
const VALID_FRESHNESS_BANDS = new Set(['1h', '6h']);

function readCsvParam(value: unknown) {
    if (typeof value !== 'string') {
        return [];
    }

    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function parseStreamFilters(query: Request['query']): StreamListFilters {
    const types = readCsvParam(query.type).filter((type) => VALID_STREAM_TYPES.has(type)) as StreamListFilters['types'];
    const confidenceBands = readCsvParam(query.confidenceBand).filter((band) => VALID_CONFIDENCE_BANDS.has(band)) as StreamListFilters['confidenceBands'];
    const timeBands = readCsvParam(query.timeBand).filter((band) => VALID_TIME_BANDS.has(band)) as StreamListFilters['timeBands'];
    const freshnessBands = readCsvParam(query.freshnessBand).filter((band) => VALID_FRESHNESS_BANDS.has(band)) as StreamListFilters['freshnessBands'];
    const category = typeof query.category === 'string' && (query.category === 'residential' || query.category === 'commercial')
        ? query.category
        : null;
    const minConfidence = typeof query.minConfidence === 'string' && Number.isFinite(Number(query.minConfidence))
        ? Number(query.minConfidence)
        : null;

    return {
        search: typeof query.search === 'string' ? query.search.trim() || null : null,
        types,
        category,
        locality: typeof query.locality === 'string' ? query.locality.trim() || null : null,
        bhk: typeof query.bhk === 'string' ? query.bhk.trim() || null : null,
        minConfidence,
        confidenceBands,
        timeBands,
        freshnessBands,
        source: typeof query.source === 'string' ? query.source.trim() || null : null,
        brokerOnly: query.brokerOnly === 'true',
    };
}

export const listChannels = async (req: Request, res: Response) => {
    try {
        const channels = await channelService.listChannels(getTenantId(req));
        res.json(channels);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load channels') });
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
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to create channel') });
    }
};

export const listStreamItems = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const authHeader = String(req.headers.authorization || '');
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : null;
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;
        const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 500;
        const filters = parseStreamFilters(req.query);
        const subscription = await subscriptionService.getSubscription(tenantId, req.user?.email);
        const networkMode = String(subscription.plan) === 'Pro';
        const items = await channelService.listStreamItems(
            tenantId,
            accessToken,
            channelId,
            sessionLabel,
            networkMode,
            Number.isFinite(limit) ? Number(limit) : 500,
            req.user?.email,
            filters,
        );
        res.json({
            items,
            network_mode: networkMode,
            total: items.length,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load stream items') });
    }
};

export const listInboxMatches = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const email = req.user?.email;
        const isSuper = Boolean(email && (isOwnerSuperAdminEmail(email) || (req.user as any)?.appRole === 'super_admin'));
        const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 200;
        const matches = await channelService.listInboxMatches(
            tenantId,
            isSuper,
            Number.isFinite(limit) ? Number(limit) : 200,
        );
        res.json({
            items: matches,
            network_mode: isSuper,
            total: matches.length,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load inbox matches') });
    }
};

export const listStreamSummary = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : null;
        const sessionLabel = typeof req.query.sessionLabel === 'string' ? req.query.sessionLabel : null;
        const subscription = await subscriptionService.getSubscription(tenantId, req.user?.email);
        const networkMode = String(subscription.plan) === 'Pro';
        const summary = await channelService.getStreamSummary(tenantId, channelId, sessionLabel, networkMode);
        res.json({
            ...summary,
            network_mode: networkMode,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load stream summary') });
    }
};

export const rebuildStream = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const limit = typeof req.body?.limit === 'number' ? Math.max(1, Math.min(2000, req.body.limit)) : 500;
        const sessionLabel = typeof req.body?.sessionLabel === 'string' ? req.body.sessionLabel.trim() || null : null;
        const remoteJid = typeof req.body?.remoteJid === 'string' ? req.body.remoteJid.trim() || null : null;
        const result = await channelService.rebuildStreamFromMessages(tenantId, {
            limit,
            sessionLabel,
            remoteJid,
        });
        res.json({ success: true, ...result });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to rebuild stream from saved messages') });
    }
};

export const correctStreamItem = async (req: Request, res: Response) => {
     try {
         await requireSuperAdmin(req);
         const tenantId = getTenantId(req);
         const userEmail = String(req.user?.email || '');
         const corrected = await channelService.correctStreamItem(
             tenantId,
             userEmail,
             String(req.params.streamItemId || ''),
             {
                 type: req.body?.type,
                 title: req.body?.title,
                 location: req.body?.location,
                 city: req.body?.city,
                 price: req.body?.price,
                 priceNumeric: typeof req.body?.priceNumeric === 'number' ? req.body.priceNumeric : null,
                 bhk: req.body?.bhk,
                 rawText: req.body?.rawText,
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
     } catch (error: unknown) {
         res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to correct stream item') });
     }
 };

export const markChannelRead = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        await channelService.markChannelRead(tenantId, String(req.params.channelId || ''));
        res.json({ success: true });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to mark channel as read') });
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
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to save stream item to channel') });
    }
};

export const getAnalytics = async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);

    try {
        const result = await getAnalyticsData(tenantId);
        res.json({ success: true, ...result });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load analytics') });
    }
};
