import { Router, Request, Response } from 'express';
import { connectWhatsApp, getQR, forceRefreshQR, getStatus, getMonitor, getInbox, disconnectWhatsApp, getMessages, sendMessage, sendBulkDirectMessages, getProfile, saveProfile, broadcastToGroups, getIngestionHealth, getDetailedHealth, getGroupHealth, getEvents, getHealthLogs, submitSupportLogs, getGroups, getOutboundRecipients } from '../controllers/whatsappController';
import { importHistoryTxt, getHistoryImports, checkDuplicateImports } from '../controllers/historyController';
import { ROUTE_PATHS } from './routePaths';
import { authMiddleware } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { connectWhatsAppSchema, forceRefreshQRSchema, saveProfileSchema, sendMessageSchema, sendBulkSchema, broadcastSchema, disconnectSchema } from '../schemas/whatsappSchemas';

const router = Router();

router.use(authMiddleware);

router.post(ROUTE_PATHS.whatsapp.connect, validate(connectWhatsAppSchema), connectWhatsApp);
router.get(ROUTE_PATHS.whatsapp.qr, getQR);
router.post(ROUTE_PATHS.whatsapp.qrForceRefresh, validate(forceRefreshQRSchema), forceRefreshQR);
router.post(ROUTE_PATHS.whatsapp.historyImport, importHistoryTxt);
router.get(ROUTE_PATHS.whatsapp.historyImports, getHistoryImports);
router.post(ROUTE_PATHS.whatsapp.historyCheckDuplicates, checkDuplicateImports);
router.get(ROUTE_PATHS.whatsapp.status, getStatus);
router.get(ROUTE_PATHS.whatsapp.monitor, getMonitor);
router.get(ROUTE_PATHS.whatsapp.inbox, getInbox);
router.get(ROUTE_PATHS.whatsapp.health, getIngestionHealth);
router.get(ROUTE_PATHS.whatsapp.healthDetailed, getDetailedHealth);
router.get(ROUTE_PATHS.whatsapp.healthLogs, getHealthLogs);
router.get(ROUTE_PATHS.whatsapp.groupsHealth, getGroupHealth);
router.get(ROUTE_PATHS.whatsapp.events, getEvents);
router.post(ROUTE_PATHS.whatsapp.supportLogs, submitSupportLogs);
router.get(ROUTE_PATHS.whatsapp.profile, getProfile);
router.post(ROUTE_PATHS.whatsapp.profile, validate(saveProfileSchema), saveProfile);
router.get(ROUTE_PATHS.whatsapp.messages, getMessages);
router.post(ROUTE_PATHS.whatsapp.send, validate(sendMessageSchema), sendMessage);
router.post(ROUTE_PATHS.whatsapp.sendBulk, validate(sendBulkSchema), sendBulkDirectMessages);
router.post(ROUTE_PATHS.whatsapp.broadcast, validate(broadcastSchema), broadcastToGroups);
router.post(ROUTE_PATHS.whatsapp.disconnect, validate(disconnectSchema), disconnectWhatsApp);
router.get(ROUTE_PATHS.whatsapp.groups, getGroups);
router.get(ROUTE_PATHS.whatsapp.recipients, getOutboundRecipients);

router.post(ROUTE_PATHS.whatsapp.config, async (req: Request, res: Response) => {
    const { group_id, behavior, session_label, parse_direct_messages, self_chat_enabled } = req.body;
    const tenant_id = req.user?.id;
    const db = require('../config/supabase').supabase;

    if (group_id) {
        const { error } = await db
            .from('group_configs')
            .upsert({ group_id, tenant_id, behavior: behavior || 'Listen' });

        if (error) return res.status(500).json({ error: error.message });
    }

    if (session_label && (typeof parse_direct_messages === 'boolean' || typeof self_chat_enabled === 'boolean')) {
        const { data: sessionRow, error: sessionError } = await db
            .from('whatsapp_sessions')
            .select('session_data')
            .eq('tenant_id', tenant_id)
            .eq('label', session_label)
            .maybeSingle();

        if (sessionError) return res.status(500).json({ error: sessionError.message });

        const sessionData = (sessionRow?.session_data && typeof sessionRow.session_data === 'object')
            ? sessionRow.session_data as Record<string, any>
            : {};

        const { error } = await db
            .from('whatsapp_sessions')
            .update({
                session_data: {
                    ...sessionData,
                    ...(typeof parse_direct_messages === 'boolean' ? {
                        parseDirectMessages: parse_direct_messages,
                        parse_direct_messages,
                    } : {}),
                    ...(typeof self_chat_enabled === 'boolean' ? {
                        selfChatEnabled: self_chat_enabled,
                        self_chat_enabled,
                    } : {}),
                },
                updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenant_id)
            .eq('label', session_label);

        if (error) return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
});

router.patch('/groups/:groupJid/toggle-parsing', async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.id;
        if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

        const groupJid = String(req.params.groupJid || '');
        const { isParsing } = req.body;

        if (!groupJid) {
            return res.status(400).json({ error: 'groupJid is required' });
        }

        if (typeof isParsing !== 'boolean') {
            return res.status(400).json({ error: 'isParsing boolean is required' });
        }

        const result = await whatsappGroupService.updateGroup(tenantId, groupJid, { isParsing });
        res.json({ success: true, group: result });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to toggle group parsing';
        res.status(500).json({ error: message });
    }
});

export default router;
