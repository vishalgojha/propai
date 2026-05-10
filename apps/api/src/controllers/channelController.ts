import { Request, Response } from 'express';
import { channelService } from '../services/channelService';
import { getAnalytics as getAnalyticsData } from '../services/analyticsService';
import { getTenantId, requireSuperAdmin, getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import '../types/express';

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
        const items = await channelService.listStreamItems(tenantId, accessToken, channelId, sessionLabel);
        res.json(items);
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load stream items') });
    }
};

export const rebuildStream = async (req: Request, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const limit = typeof req.body?.limit === 'number' ? Math.max(1, Math.min(2000, req.body.limit)) : 500;
        const result = await channelService.rebuildStreamFromMessages(tenantId, limit);
        res.json({ success: true, ...result });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to rebuild stream from saved messages') });
    }
};

export const correctStreamItem = async (req: Request, res: Response) => {
    try {
        await requireSuperAdmin(req);
        const tenantId = getTenantId(req);
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
