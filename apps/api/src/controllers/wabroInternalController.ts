import { Request, Response } from 'express';
import type {
    RuntimeBroadcastRequest,
    RuntimeSendMediaRequest,
    RuntimeSendMessageRequest,
    WhatsAppInboundMessagePayload,
    WhatsAppStatusPayload,
} from '../contracts/wabroContracts';
import type { IncomingMessageRecord } from '@vishalgojha/whatsapp-baileys-runtime';
import { sessionManager } from '../whatsapp/SessionManager';
import { getErrorMessage, getErrorStatus, HttpError } from '../utils/controllerHelpers';
import { wabroRuntimeBridgeService } from '../services/wabroRuntimeBridgeService';
import { processWhatsAppInboundMessage } from '../channel-events/processors/processWhatsAppInboundMessage';
import { liveMonitorService } from '../services/liveMonitorService';
import { sessionEventService } from '../services/sessionEventService';
import { PropAISupabaseAdapter } from '../whatsapp/PropAISupabaseAdapter';

const storageAdapter = new PropAISupabaseAdapter();

function toWhatsAppJid(chatId: string) {
    const value = String(chatId || '').trim();
    if (!value) {
        throw new HttpError('chatId is required', 400);
    }

    if (value.includes('@')) {
        return value;
    }

    const phone = value.split('').filter((char) => char >= '0' && char <= '9').join('');
    if (!phone) {
        throw new HttpError('chatId must contain a WhatsApp JID or phone number', 400);
    }

    return `${phone}@s.whatsapp.net`;
}

async function getRuntimeClient(workspaceId: string, sessionId?: string) {
    const client = sessionId
        ? await sessionManager.getSession(workspaceId, sessionId)
        : await sessionManager.getSession(workspaceId);

    if (!client) {
        throw new HttpError('No connected WhatsApp runtime session was found for this workspace', 404);
    }

    return client;
}

async function sendTextCommand(payload: RuntimeSendMessageRequest) {
    const client = await getRuntimeClient(payload.auth.workspaceId, payload.auth.sessionId);
    await client.sendMessage(toWhatsAppJid(payload.chatId), payload.text);
}

async function sendMediaCommand(payload: RuntimeSendMediaRequest) {
    const client = await getRuntimeClient(payload.auth.workspaceId, payload.auth.sessionId);
    const caption = String(payload.media.caption || '').trim();
    const label = String(payload.media.fileName || 'Media').trim();
    const fullText = caption
        ? `${caption}\n\n${label}: ${payload.media.url}`
        : `${label}: ${payload.media.url}`;

    await client.sendMessage(toWhatsAppJid(payload.chatId), fullText);
}

function buildInboundRecord(payload: WhatsAppInboundMessagePayload): IncomingMessageRecord {
    const remoteJid = toWhatsAppJid(payload.message.chatId);
    const sender = String(payload.contact.pushName || payload.contact.name || payload.message.from || '').trim() || null;
    const raw = (payload.message.raw && typeof payload.message.raw === 'object')
        ? { ...payload.message.raw }
        : {};

    const rawMessage = {
        ...raw,
        key: {
            ...((raw as Record<string, any>).key || {}),
            id: payload.message.messageId,
            remoteJid,
            participant: payload.context.groupId ? payload.message.from : undefined,
            fromMe: payload.message.fromMe,
        },
        messageTimestamp: payload.message.timestamp,
    };

    return {
        tenantId: payload.auth.workspaceId,
        label: payload.auth.sessionId,
        remoteJid,
        text: String(payload.message.text || '').trim(),
        sender,
        timestamp: payload.message.timestamp,
        fromMe: payload.message.fromMe,
        rawMessage,
    };
}

export async function receiveInboundEvent(req: Request, res: Response) {
    try {
        const payload = req.body as WhatsAppInboundMessagePayload;
        const accepted = wabroRuntimeBridgeService.acceptInboundEvent(payload);

        if (!accepted) {
            return res.json({
                accepted: true,
                duplicate: true,
                eventId: payload.eventId,
                processing: 'deduplicated',
            });
        }

        const event = buildInboundRecord(payload);
        const isGroup = event.remoteJid.endsWith('@g.us');

        liveMonitorService.recordMessage({
            tenantId: event.tenantId,
            sessionLabel: event.label,
            remoteJid: event.remoteJid,
            sender: event.sender || null,
            text: event.text,
            timestamp: event.timestamp,
            direction: event.fromMe ? 'outbound' : 'inbound',
            title: payload.context.groupName || payload.contact.name || payload.contact.pushName || null,
        });

        void sessionEventService.log(event.tenantId, 'message_received', {
            remoteJid: event.remoteJid,
            isGroup,
            label: event.label,
            length: event.text.length,
            hasMedia: Boolean(payload.message.media?.url || payload.message.media?.mimeType),
            source: 'wabro_internal',
            eventId: payload.eventId,
        });

        await storageAdapter.saveInboundMessage(event);
        await processWhatsAppInboundMessage(event);

        res.json({
            accepted: true,
            duplicate: false,
            eventId: payload.eventId,
            processing: 'propai_pipeline',
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to process inbound event') });
    }
}

export async function receiveStatusEvent(req: Request, res: Response) {
    try {
        const payload = req.body as WhatsAppStatusPayload;
        const accepted = wabroRuntimeBridgeService.acceptStatusEvent(payload);

        res.json({
            accepted: true,
            duplicate: !accepted,
            eventId: payload.eventId,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to process status event') });
    }
}

export async function runtimeSendMessage(req: Request, res: Response) {
    try {
        const payload = req.body as RuntimeSendMessageRequest;
        const accepted = wabroRuntimeBridgeService.beginOutboundCommand('send-message', payload);

        if (accepted) {
            await sendTextCommand(payload);
        }

        res.json({
            accepted: true,
            duplicate: !accepted,
            requestId: payload.requestId,
            idempotencyKey: payload.idempotencyKey,
            providerMessageId: null,
            status: accepted ? 'sent' : 'duplicate_ignored',
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to send WhatsApp message') });
    }
}

export async function runtimeSendMedia(req: Request, res: Response) {
    try {
        const payload = req.body as RuntimeSendMediaRequest;
        const accepted = wabroRuntimeBridgeService.beginOutboundCommand('send-media', payload);

        if (accepted) {
            await sendMediaCommand(payload);
        }

        res.json({
            accepted: true,
            duplicate: !accepted,
            requestId: payload.requestId,
            idempotencyKey: payload.idempotencyKey,
            providerMessageId: null,
            status: accepted ? 'sent' : 'duplicate_ignored',
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to send WhatsApp media message') });
    }
}

export async function runtimeBroadcast(req: Request, res: Response) {
    try {
        const payload = req.body as RuntimeBroadcastRequest;
        const accepted = wabroRuntimeBridgeService.beginOutboundCommand('broadcast', payload);

        if (!accepted) {
            return res.json({
                accepted: true,
                duplicate: true,
                requestId: payload.requestId,
                idempotencyKey: payload.idempotencyKey,
                sent: 0,
                failed: 0,
                results: [],
            });
        }

        const results: Array<{ chatId: string; status: 'sent' | 'failed'; error?: string }> = [];
        const batchSize = payload.rateLimit?.batchSize || payload.recipients.length;
        const delayBetweenMessagesMs = payload.rateLimit?.delayBetweenMessagesMs || 0;
        const delayBetweenBatchesMs = payload.rateLimit?.delayBetweenBatchesMs || 0;

        for (let index = 0; index < payload.recipients.length; index++) {
            const recipient = payload.recipients[index];

            try {
                if (payload.content.type === 'text') {
                    await sendTextCommand({
                        requestId: `${payload.requestId}:${index}`,
                        auth: payload.auth,
                        chatId: recipient.chatId,
                        text: payload.content.text,
                        idempotencyKey: `${payload.idempotencyKey}:${index}`,
                    });
                } else {
                    await sendMediaCommand({
                        requestId: `${payload.requestId}:${index}`,
                        auth: payload.auth,
                        chatId: recipient.chatId,
                        media: {
                            url: payload.content.url,
                            mimeType: payload.content.mimeType,
                            fileName: payload.content.fileName || null,
                            caption: payload.content.caption || null,
                        },
                        idempotencyKey: `${payload.idempotencyKey}:${index}`,
                    });
                }

                results.push({ chatId: recipient.chatId, status: 'sent' });
            } catch (error: unknown) {
                results.push({
                    chatId: recipient.chatId,
                    status: 'failed',
                    error: getErrorMessage(error, 'Unknown send failure'),
                });
            }

            const nextIndex = index + 1;
            if (delayBetweenMessagesMs > 0 && nextIndex < payload.recipients.length) {
                await new Promise((resolve) => setTimeout(resolve, delayBetweenMessagesMs));
            }

            if (delayBetweenBatchesMs > 0 && nextIndex < payload.recipients.length && nextIndex % batchSize === 0) {
                await new Promise((resolve) => setTimeout(resolve, delayBetweenBatchesMs));
            }
        }

        res.json({
            accepted: true,
            duplicate: false,
            requestId: payload.requestId,
            idempotencyKey: payload.idempotencyKey,
            sent: results.filter((entry) => entry.status === 'sent').length,
            failed: results.filter((entry) => entry.status === 'failed').length,
            results,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to execute broadcast') });
    }
}

export async function runtimeSessionStatus(req: Request, res: Response) {
    try {
        const workspaceId = String(req.query.workspaceId || '');
        const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;

        const session = await getRuntimeClient(workspaceId, sessionId);
        const snapshot = session.getStatusSnapshot();

        res.json({
            workspaceId,
            sessionId: snapshot.label,
            status: snapshot.status === 'connected' ? 'connected' : snapshot.status === 'connecting' ? 'connecting' : 'disconnected',
            phoneNumber: snapshot.phoneNumber || null,
            qrAvailable: false,
            lastDisconnectReason: null,
            lastDisconnectAt: null,
            updatedAt: new Date().toISOString(),
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load runtime session status') });
    }
}
