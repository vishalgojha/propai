import { Request, Response } from 'express';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase } from '../config/supabase';
import { WhatsAppMediaFile } from '../whatsapp/WhatsAppClient';
import { whatsappParseConsentService } from '../services/whatsappParseConsentService';

const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

function estimateBase64Bytes(data: string) {
    const base64 = data.includes(',') ? data.split(',').pop() || '' : data;
    return Math.floor((base64.length * 3) / 4);
}

function normalizeAttachments(value: unknown): WhatsAppMediaFile[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((item) => item as Partial<WhatsAppMediaFile>)
        .filter((item): item is WhatsAppMediaFile =>
            typeof item.data === 'string' &&
            typeof item.mimeType === 'string' &&
            typeof item.fileName === 'string' &&
            item.data.length > 0 &&
            item.mimeType.length > 0 &&
            item.fileName.length > 0
        );
}

export const connectWhatsApp = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { phoneNumber, label, ownerName } = req.body;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    try {
        await sessionManager.createSession(
            tenantId, 
            () => {}, 
            () => {},
            { 
                usePairingCode: phoneNumber, 
                label: label || 'Owner', 
                ownerName: ownerName 
            }
        );
        res.json({ message: 'Connection initiated' });
    } catch (error: any) {
        console.error('Connect Error:', error);
        res.status(500).json({ error: error.message || 'Could not start connection. Please try again.' });
    }
};


export const getQR = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    const qr = sessionManager.getQR(tenantId as string);
    if (!qr) return res.status(404).json({ error: 'Code not ready yet' });

    res.json({ qr });
};

export const getStatus = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('status')
        .eq('tenant_id', tenantId)
        .order('last_sync', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) return res.status(404).json({ status: 'disconnected' });

    res.json({ status: data.status });
};

export const disconnectWhatsApp = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    try {
        await sessionManager.removeSession(tenantId);
        res.json({ message: 'Disconnected successfully' });
    } catch (error: any) {
        console.error('Disconnect Error:', error);
        res.status(500).json({ error: 'Could not disconnect. Please try again.' });
    }
};

export const getMessages = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json((data || []).map((message: any) => ({
        ...message,
        message_text: message.message_text || message.text || '',
    })));
};

export const sendMessage = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { remoteJid } = req.body;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const attachments = normalizeAttachments(req.body?.attachments);

    if (!tenantId || !remoteJid || (!text && attachments.length === 0)) {
        return res.status(400).json({ error: 'remoteJid and text or attachments are required' });
    }

    if (attachments.some((file) => estimateBase64Bytes(file.data) > MAX_ATTACHMENT_BYTES)) {
        return res.status(413).json({ error: 'Each attachment must be 16MB or smaller' });
    }

    try {
        const client = await sessionManager.getSessionForRemoteJid(tenantId, remoteJid);
        if (!client) {
            return res.status(404).json({ error: 'No active WhatsApp session found' });
        }

        if (text) {
            await (client as any).sendText(remoteJid, text);

            const { error: insertError } = await supabase
                .from('messages')
                .insert({
                    tenant_id: tenantId,
                    remote_jid: remoteJid,
                    text,
                    sender: 'Broker',
                });

            if (insertError) {
                throw insertError;
            }
        }

        for (const attachment of attachments) {
            await (client as any).sendMedia(remoteJid, { ...attachment, caption: attachment.caption || '' });
        }
        
        res.json({ message: 'Message sent successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateGroupMonitor = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user?.id;
    const groupId = String(req.body?.group_id || '').trim();
    const behavior = String(req.body?.behavior || 'Listen').trim() || 'Listen';

    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });
    if (!groupId) return res.status(400).json({ error: 'group_id is required' });

    try {
        const { error } = await supabase
            .from('group_configs')
            .upsert(
                {
                    group_id: groupId,
                    tenant_id: tenantId,
                    behavior,
                },
                { onConflict: 'group_id' }
            );

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        await whatsappParseConsentService.updateGroupConsent(
            tenantId,
            groupId,
            behavior === 'Listen' || behavior === 'AutoReply' || behavior === 'Broadcast'
        );

        return res.json({ success: true });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Could not update group monitor' });
    }
};

export const getParseTargets = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user?.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    try {
        const targets = await whatsappParseConsentService.listTargets(tenantId);
        res.json(targets);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Could not load WhatsApp privacy controls' });
    }
};

export const updateParseConsent = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user?.id;
    if (!tenantId) return res.status(400).json({ error: 'User not authenticated' });

    const targetType = req.body?.targetType === 'dm' ? 'dm' : 'group';
    const remoteJid = String(req.body?.remoteJid || '').trim();
    const remoteJids = Array.isArray(req.body?.remoteJids)
        ? req.body.remoteJids.map((value: unknown) => String(value || '').trim()).filter(Boolean)
        : [];
    const parseEnabled = Boolean(req.body?.parseEnabled);

    if (!remoteJid && remoteJids.length === 0) {
        return res.status(400).json({ error: 'remoteJid or remoteJids is required' });
    }

    try {
        if (remoteJids.length > 0) {
            const updated = await whatsappParseConsentService.updateConsentBatch({
                tenantId,
                targetType,
                remoteJids,
                parseEnabled,
            });

            return res.json({ success: true, targetType, remoteJids, parseEnabled, updated });
        }

        const updated = targetType === 'group'
            ? await whatsappParseConsentService.updateGroupConsent(tenantId, remoteJid, parseEnabled)
            : await whatsappParseConsentService.updateDmConsent(tenantId, remoteJid, parseEnabled);

        res.json({ success: true, targetType, remoteJid, parseEnabled, updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Could not update WhatsApp privacy control' });
    }
};
