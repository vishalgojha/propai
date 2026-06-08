import makeWASocket, {
     DisconnectReason,
     fetchLatestBaileysVersion,
     type WASocket,
 } from '@whiskeysockets/baileys';
 import { Boom } from '@hapi/boom';
import { sanitizeForWhatsApp } from './sanitizer';
import { createSupabaseAuthState, type SupabaseAuthState } from './SupabaseAuthState';
import { CircuitBreaker } from './CircuitBreaker';
import { PropAISupabaseAdapter } from './PropAISupabaseAdapter';
import { sessionEventService } from '../services/sessionEventService';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { liveMonitorService } from '../services/liveMonitorService';
import { supabase } from '../config/supabase';
import { type RawGroupInput } from '../services/whatsappGroupService';
import { whatsappHealthService } from '../services/whatsappHealthService';
import type {
    ConnectionStatus,
    GroupInfo,
    IncomingMessageRecord,
    SessionCreateOptions,
    SessionSnapshot,
    WhatsAppRuntimeHooks,
    WhatsAppStorageAdapter,
} from '@vishalgojha/whatsapp-baileys-runtime';

type WhatsAppClientOptions = {
    tenantId: string;
    storage: WhatsAppStorageAdapter;
    hooks?: WhatsAppRuntimeHooks;
} & SessionCreateOptions;

function extractParticipantJids(participants: unknown): string[] {
    const rows = Array.isArray(participants)
        ? participants
        : participants && typeof participants === 'object'
            ? Object.values(participants as Record<string, unknown>)
            : [];

    return rows
        .map((participant: any) => String(participant?.id || participant?.jid || participant || '').trim())
        .filter(Boolean);
}

function normalizePhoneNumber(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const withoutDevice = raw.includes(':') ? raw.slice(0, raw.indexOf(':')) : raw;
    const withoutJid = withoutDevice.includes('@') ? withoutDevice.slice(0, withoutDevice.indexOf('@')) : withoutDevice;
    return withoutJid.split('').filter((char) => char >= '0' && char <= '9').join('');
}

export interface BroadcastOptions {
    batchSize?: number;
    delayBetweenMessages?: number;
    delayBetweenBatches?: number;
    onProgress?: (sent: number, total: number, groupId: string) => void;
    onError?: (groupId: string, error: unknown) => void;
}

export type WhatsAppMediaInput = {
    url: string;
    mimeType?: string | null;
    fileName?: string | null;
    caption?: string | null;
};

export class WhatsAppClient {
    private socket: WASocket | null = null;
    private readonly tenantId: string;
    private readonly storage: WhatsAppStorageAdapter;
    private readonly hooks?: WhatsAppRuntimeHooks;
    private readonly label: string;
    private readonly ownerName?: string;
    private connectedPhoneNumber?: string;
    private connectedLidJid?: string;
    private isConnecting = false;
    private connectionStatus: ConnectionStatus = 'disconnected';
    private readonly recentOutgoingMessages = new Map<string, number>();
    private readonly recentGroupEvents = new Map<string, number>();
    private authState: SupabaseAuthState | null = null;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 10;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private qrTimeoutTimer: NodeJS.Timeout | null = null;
    private circuitBreaker = new CircuitBreaker();
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private healthCheckRunning = false;
    private autoSyncInterval: NodeJS.Timeout | null = null;
    private replayTimer: NodeJS.Timeout | null = null;
    private replayInProgress = false;
    private disconnectMeta: { reason: string | null; replaced: boolean; at: string | null } = {
        reason: null,
        replaced: false,
        at: null,
    };
    private readonly reconnectLogAt = new Map<string, number>();

    private humanizeDelay(baseMs: number, spreadRatio = 0.25, minimumMs = 500) {
        const spread = Math.max(0, Math.round(baseMs * spreadRatio));
        const offset = Math.round((Math.random() * (spread * 2)) - spread);
        return Math.max(minimumMs, baseMs + offset);
    }

    private shouldLogReconnect(key: string, cooldownMs: number) {
        const now = Date.now();
        const lastAt = this.reconnectLogAt.get(key) || 0;
        if (now - lastAt < cooldownMs) {
            return false;
        }

        this.reconnectLogAt.set(key, now);
        return true;
    }

    private getReconnectBackoffMs() {
        if (this.reconnectAttempts <= 0) {
            return this.humanizeDelay(750, 0.25, 450);
        }

        if (this.reconnectAttempts === 1) {
            return this.humanizeDelay(1_200, 0.28, 600);
        }

        const exponential = Math.min(1_200 * Math.pow(1.65, Math.max(0, this.reconnectAttempts - 2)), 18_000);
        const fatigueBonus = Math.min(3_500, Math.max(0, this.reconnectAttempts - 3) * 450);
        const base = exponential + fatigueBonus;
        return this.humanizeDelay(base, 0.24, 900);
    }

    private mapBaileysStatus(code?: number | null): 'server_ack' | 'delivered' | 'read' | 'played' | null {
        switch (code) {
            case 2:
                return 'server_ack';
            case 3:
                return 'delivered';
            case 4:
                return 'read';
            case 5:
                return 'played';
            default:
                return null;
        }
    }

    private async recordMessageStatus(input: {
        messageId: string;
        chatId: string;
        state: 'sent' | 'server_ack' | 'delivered' | 'read' | 'played' | 'failed';
        timestamp?: string | null;
        errorCode?: string | null;
        errorMessage?: string | null;
        rawPayload?: Record<string, unknown> | null;
        source: 'api_runtime_send' | 'api_runtime_update';
    }) {
        const messageId = String(input.messageId || '').trim();
        const chatId = String(input.chatId || '').trim();
        if (!messageId || !chatId) {
            return;
        }

        const timestamp = input.timestamp || new Date().toISOString();
        const eventId = `${input.source}:${this.tenantId}:${this.label}:${messageId}:${input.state}:${timestamp}`;

        // status recorded via session events

        void sessionEventService.log(this.tenantId, 'message_status', {
            label: this.label,
            eventId,
            messageId,
            chatId,
            state: input.state,
            timestamp,
            errorCode: input.errorCode || null,
            errorMessage: input.errorMessage || null,
            source: input.source,
        });
    }

    private buildGroupWelcomeText(groupName?: string | null) {
        const title = String(groupName || '').trim() || 'this group';
        return [
            `Hi everyone, I’m Pulse from PropAI.`,
            `I help brokers keep ${title} organized, parse listings and requirements, and respond when you tag me.`,
            `Use @Pulse <query> to ask me something in the group.`,
        ].join(' ');
    }

    private async registerManagedGroup(groupJid: string, groupName?: string | null, participantJids?: string[] | null) {
        try {
            await whatsappGroupService.registerManagedGroup(this.tenantId, {
                sessionLabel: this.label,
                groupJid,
                groupName: groupName || groupJid,
                participantJids: participantJids || [],
            });
        } catch (error) {
            console.error('[WhatsAppClient] Failed to register managed group:', error);
        }
    }

    private async sendGroupWelcome(groupJid: string, groupName?: string | null) {
        const welcomeText = this.buildGroupWelcomeText(groupName);
        await this.sendText(groupJid, welcomeText).catch(() => undefined);
    }

    async createManagedGroup(subject: string, participants: string[]) {
        if (!this.socket) {
            throw new Error('WhatsApp session is not connected');
        }

        const cleanSubject = String(subject || '').trim();
        const cleanParticipants = Array.from(new Set((participants || []).map((participant) => String(participant || '').trim()).filter(Boolean)));
        if (!cleanSubject || cleanParticipants.length === 0) {
            throw new Error('Group subject and participants are required');
        }

        const groupCreate = (this.socket as any).groupCreate?.bind(this.socket);
        if (typeof groupCreate !== 'function') {
            throw new Error('This WhatsApp client does not support group creation');
        }

        const result = await groupCreate(cleanSubject, cleanParticipants);
        const groupJid = String(result?.id || result?.gid || result?.groupJid || '').trim();
        const groupName = String(result?.subject || result?.name || cleanSubject || '').trim() || null;
        if (groupJid) {
            await this.registerManagedGroup(groupJid, groupName, cleanParticipants);
            await this.sendGroupWelcome(groupJid, groupName);
        }

        return result;
    }

    constructor(options: WhatsAppClientOptions) {
        this.tenantId = options.tenantId;
        this.storage = options.storage;
        this.hooks = options.hooks;
        this.label = options.label;
        this.ownerName = options.ownerName;
        this.connectedPhoneNumber = normalizePhoneNumber(options.phoneNumber || options.usePairingCode);
        this.startHealthCheck();
    }

    async connect(options: { usePairingCode?: string; phoneNumber?: string } = {}) {
        if (this.isConnecting) {
            return;
        }

        this.isConnecting = true;
        this.connectedPhoneNumber = normalizePhoneNumber(options.phoneNumber || options.usePairingCode || this.connectedPhoneNumber);
        this.connectionStatus = 'connecting';
        await this.persistStatus('connecting');

        const connectionTimeout = setTimeout(() => {
            if (this.connectionStatus === 'connecting') {
                if (this.shouldLogReconnect('connection_timeout', 5 * 60_000)) {
                    console.warn(`[WhatsAppClient] Connection timeout for ${this.tenantId}:${this.label} after 45s. Forcing disconnect.`);
                }
                this.connectionStatus = 'disconnected';
                this.isConnecting = false;
                this.persistStatus('disconnected').catch(() => {});
            }
        }, 45000);

        if (this.reconnectAttempts > 0 && (this.reconnectAttempts === 1 || this.reconnectAttempts === this.maxReconnectAttempts || this.reconnectAttempts % 3 === 0)) {
            console.log(`[WhatsAppClient] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} for ${this.tenantId}:${this.label}`);
        }

        try {
            const sessionId = `${this.tenantId}:${this.label}`;
            const { state, saveCreds, authState } = await createSupabaseAuthState({
                sessionId,
                tenantId: this.tenantId,
                label: this.label,
                ownerName: this.ownerName || null,
                phoneNumber: this.connectedPhoneNumber || null,
            });
            this.authState = authState;

            let version: [number, number, number] = [2, 3000, 0];
            try {
                const versionPromise = fetchLatestBaileysVersion();
                const versionTimeout = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Baileys version fetch timeout')), 10000)
                );
                const fetched = await Promise.race([versionPromise, versionTimeout]);
                version = fetched.version;
                console.log('[WhatsAppClient] Using Baileys version:', version.join('.'));
            } catch (error) {
                console.log('[WhatsAppClient] Version fetch failed, using default:', error);
            }

            if (this.socket) {
                await this.disposeSocket({ logout: false });
            }

            this.socket = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                connectTimeoutMs: 30000,
                qrTimeout: 120000,
            });

            console.log(`[WhatsAppClient] Socket created for ${this.tenantId}:${this.label}, waiting for QR...`);
            let pairingCodeRequested = false;

            if (this.qrTimeoutTimer) {
                clearTimeout(this.qrTimeoutTimer);
            }
            this.qrTimeoutTimer = setTimeout(() => {
                console.warn(`[WhatsAppClient] QR timeout for ${this.tenantId}:${this.label} after 30s. Socket state: ${this.socket ? 'alive' : 'null'}, connection: ${this.connectionStatus}`);
                void whatsappHealthService.appendEvent(
                    this.tenantId,
                    this.label,
                    'qr_timeout',
                    'WhatsApp QR/pairing artifact was not emitted within 30 seconds.',
                    {
                        socketAlive: Boolean(this.socket),
                        connectionStatus: this.connectionStatus,
                        phoneNumber: this.connectedPhoneNumber || null,
                    },
                ).catch(() => undefined);
                this.qrTimeoutTimer = null;
            }, 30000);

            this.socket.ev.on('connection.update', async (update: any) => {
                try {
                    const connection = update?.connection;
                    const lastDisconnect = update?.lastDisconnect;
                    const qr = update?.qr;

                    if (qr && this.qrTimeoutTimer) {
                        clearTimeout(this.qrTimeoutTimer);
                        this.qrTimeoutTimer = null;
                    }

                    if (qr && options.usePairingCode && !pairingCodeRequested) {
                        pairingCodeRequested = true;
                        const socket = this.socket;
                        if (!socket) {
                            pairingCodeRequested = false;
                            return;
                        }
                        const code = await socket.requestPairingCode(options.usePairingCode);
                        if (this.qrTimeoutTimer) {
                            clearTimeout(this.qrTimeoutTimer);
                            this.qrTimeoutTimer = null;
                        }
                        await this.emitQR(code);
                    } else if (qr && !options.usePairingCode) {
                        await this.emitQR(qr);
                    }

                    const userId = String(this.socket?.user?.id || '');
                    if (userId) {
                        const normalizedPhone = normalizePhoneNumber(userId);
                        this.connectedPhoneNumber = normalizedPhone || this.connectedPhoneNumber;
                        this.authState?.updatePhoneNumber(this.connectedPhoneNumber || null);
                        await saveCreds();
                    }

                    const userLid = String((this.socket?.user as { lid?: string } | undefined)?.lid || '');
                    if (userLid) {
                        const separatorIndex = userLid.indexOf(':');
                        const suffixIndex = userLid.indexOf('@');
                        this.connectedLidJid = separatorIndex >= 0 && suffixIndex > separatorIndex
                            ? `${userLid.slice(0, separatorIndex)}${userLid.slice(suffixIndex)}`
                            : userLid;
                    }

                    if (connection === 'close') {
                        clearTimeout(connectionTimeout);
                        if (this.qrTimeoutTimer) {
                            clearTimeout(this.qrTimeoutTimer);
                            this.qrTimeoutTimer = null;
                        }
                        this.connectionStatus = 'disconnected';
                        this.isConnecting = false;
                        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
                        const replaced = this.isSessionReplaced(lastDisconnect?.error);
                        const shouldReconnect = !replaced;
                        const disconnectReason = replaced
                            ? 'replaced'
                            : statusCode === DisconnectReason.loggedOut
                                ? 'logged_out'
                                : `closed:${statusCode ?? 'unknown'}`;
                        this.disconnectMeta = {
                            reason: replaced ? 'replaced' : statusCode === DisconnectReason.loggedOut ? 'logged_out' : 'closed',
                            replaced,
                            at: new Date().toISOString(),
                        };
                        this.socket = null;

                        if (this.reconnectTimer) {
                            clearTimeout(this.reconnectTimer);
                            this.reconnectTimer = null;
                        }

                        if (this.shouldLogReconnect(`connection_closed:${disconnectReason}`, 60_000)) {
                            console.warn(
                                `[WhatsAppClient] Connection closed for ${this.tenantId}:${this.label} (${disconnectReason}). autoReconnect=${shouldReconnect}`
                            );
                        }
                        void whatsappHealthService.appendEvent(
                            this.tenantId,
                            this.label,
                            'connection_closed',
                            `WhatsApp connection closed for ${this.label}.`,
                            {
                                disconnectReason,
                                statusCode: statusCode ?? null,
                                replaced,
                                shouldReconnect,
                                phoneNumber: this.connectedPhoneNumber || null,
                            },
                        ).catch(() => undefined);

                        if (replaced) {
                            this.reconnectAttempts = 0;
                            this.circuitBreaker.recordFailure();
                            if (this.shouldLogReconnect('session_replaced', 15 * 60_000)) {
                                console.warn(`[WhatsAppClient] Session replaced by another linked device; auto-reconnect blocked for ${this.tenantId}:${this.label}`);
                            }
                            await this.persistStatus('disconnected');
                            return;
                        }

                        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                            this.reconnectAttempts++;
                            this.circuitBreaker.recordFailure();

                            const backoffMs = this.getReconnectBackoffMs();
                            if (this.reconnectAttempts === 1 || this.reconnectAttempts === this.maxReconnectAttempts || this.reconnectAttempts % 3 === 0) {
                                console.log(
                                    `[WhatsAppClient] Scheduling reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${backoffMs}ms for ${this.tenantId}:${this.label}`
                                );
                            }
                            this.connectionStatus = 'connecting';
                            await this.persistStatus('connecting');
                            this.reconnectTimer = setTimeout(() => {
                                this.tryReconnect();
                            }, backoffMs);
                        } else {
                            this.reconnectAttempts = 0;
                            this.circuitBreaker.recordFailure();
                            await this.persistStatus('disconnected');
                        }
                    } else if (connection === 'open') {
                        clearTimeout(connectionTimeout);
                        if (this.qrTimeoutTimer) {
                            clearTimeout(this.qrTimeoutTimer);
                            this.qrTimeoutTimer = null;
                        }
                        if (this.replayTimer) {
                            clearTimeout(this.replayTimer);
                            this.replayTimer = null;
                        }
                        this.connectionStatus = 'connected';
                        this.reconnectAttempts = 0;
                        this.disconnectMeta = { reason: null, replaced: false, at: null };
                        this.circuitBreaker.recordSuccess();
                        if (this.reconnectTimer) {
                            clearTimeout(this.reconnectTimer);
                            this.reconnectTimer = null;
                        }
                        await this.persistStatus('connected');

                        this.scheduleReplayAfterReconnect('connection.open');

                        this.scheduleGroupSync();
                        void this.autoSyncBrokerContacts();
                    }
                } catch (error) {
                    await this.hooks?.onError?.({
                        tenantId: this.tenantId,
                        label: this.label,
                        error,
                        stage: 'connection.update',
                    });
                }
            });

            this.socket.ev.on('creds.update', async () => {
                try {
                    await saveCreds();
                } catch (error) {
                    await this.hooks?.onError?.({
                        tenantId: this.tenantId,
                        label: this.label,
                        error,
                        stage: 'creds.update',
                    });
                }
            });

            this.socket.ev.on('messaging-history.set', async (payload: any) => {
                try {
                    const chats = Array.isArray(payload?.chats) ? payload.chats : [];
                    const messages = Array.isArray(payload?.messages) ? payload.messages : [];

                    const liveGroups = chats
                        .filter((chat: any) => String(chat?.id || '').endsWith('@g.us'))
                        .map((chat: any) => ({
                            id: String(chat?.id || ''),
                            name: String(chat?.name || chat?.conversationName || chat?.subject || chat?.id || 'WhatsApp group'),
                            participantsCount: typeof chat?.participantsCount === 'number' ? chat.participantsCount : undefined,
                        }))
                        .filter((group: { id: string }) => Boolean(group.id));

                    if (liveGroups.length > 0) {
                        liveMonitorService.syncGroups({
                            tenantId: this.tenantId,
                            sessionLabel: this.label,
                            groups: liveGroups,
                        });
                    }

                    await this.persistChatTitles(chats);
                    await this.replayPersistedHistory({
                        reason: 'messaging-history.set',
                        chats,
                        messages,
                    });

                    for (const msg of messages) {
                        const remoteJid = String(msg?.key?.remoteJid || '').trim();
                        if (!remoteJid) continue;

                        const text = this.extractMessageText(msg?.message);
                        if (!text) continue;

                        const title = String(
                            chats.find((chat: any) => String(chat?.id || '') === remoteJid)?.name
                            || chats.find((chat: any) => String(chat?.id || '') === remoteJid)?.conversationName
                            || '',
                        ).trim() || null;

                        liveMonitorService.recordMessage({
                            tenantId: this.tenantId,
                            sessionLabel: this.label,
                            remoteJid,
                            sender: this.resolveStoredSender(msg),
                            text,
                            timestamp: this.resolveMessageTimestamp(msg),
                            direction: msg?.key?.fromMe ? 'outbound' : 'inbound',
                            title,
                        });

                        await this.persistHistoryMessage({
                            tenantId: this.tenantId,
                            label: this.label,
                            remoteJid,
                            text,
                            sender: this.resolveStoredSender(msg),
                            timestamp: this.resolveMessageTimestamp(msg),
                            fromMe: Boolean(msg?.key?.fromMe),
                            rawMessage: msg,
                        });
                    }
                } catch (error) {
                    await this.hooks?.onError?.({
                        tenantId: this.tenantId,
                        label: this.label,
                        error,
                        stage: 'messaging-history.set',
                    });
                }
            });

            this.socket.ev.on('messages.upsert', async (payload: any) => {
                try {
                    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
                    for (const msg of messages) {
                        if (!msg?.message) {
                            continue;
                        }

                        const messageText = this.extractMessageText(msg.message);
                        const remoteJid = String(msg.key?.remoteJid || '').trim();
                        const remoteJidAlt = String(msg.key?.remoteJidAlt || '');
                        const wasSentByThisClient = this.isRecentOutgoingMessage(remoteJid, messageText);

                        if (!remoteJid || !messageText) {
                            continue;
                        }

                        if (msg.key?.fromMe && wasSentByThisClient) {
                            continue;
                        }

                        if (msg.key?.fromMe && remoteJid.endsWith('@lid') && remoteJidAlt.startsWith(`${this.connectedPhoneNumber}@`)) {
                            this.connectedLidJid = remoteJid;
                            await this.persistStatus(this.connectionStatus);
                        }

                        const isGroup = remoteJid.endsWith('@g.us');
                        const groupMetadata = isGroup
                            ? await this.socket?.groupMetadata(remoteJid).catch(() => null)
                            : null;
                        const groupName = isGroup
                            ? String(groupMetadata?.subject || remoteJid).trim() || null
                            : null;
                        void sessionEventService.log(this.tenantId, 'message_received', {
                            remoteJid,
                            isGroup,
                            label: this.label,
                            length: messageText.length,
                            hasMedia: Boolean(msg.message?.imageMessage || msg.message?.videoMessage),
                        });

                        const event: IncomingMessageRecord & {
                            groupMetadata?: { groupJid: string; groupName: string | null };
                        } = {
                            tenantId: this.tenantId,
                            label: this.label,
                            remoteJid,
                            text: messageText,
                            sender: this.resolveStoredSender(msg),
                            timestamp: this.resolveMessageTimestamp(msg),
                            fromMe: Boolean(msg.key?.fromMe),
                            rawMessage: msg,
                            groupMetadata: isGroup
                                ? {
                                    groupJid: remoteJid,
                                    groupName,
                                }
                                : undefined,
                        } as IncomingMessageRecord & {
                            groupMetadata?: { groupJid: string; groupName: string | null };
                        };

                        try {
                            await whatsappHealthService.recordMessageMetrics({
                                tenantId: this.tenantId,
                                sessionLabel: this.label,
                                remoteJid,
                                parsed: false,
                                timestamp: event.timestamp,
                            });
                        } catch (metricsError) {
                            console.error('[WhatsAppClient] Failed to record inbound receipt metrics:', metricsError);
                        }
                        await this.storage.saveInboundMessage(event);
                        await this.hooks?.onMessage?.(event);
                    }
                } catch (error) {
                    await this.hooks?.onError?.({
                        tenantId: this.tenantId,
                        label: this.label,
                        error,
                        stage: 'messages.upsert',
                    });
                }
            });

// Handle message updates (edits and deletions/revocations)
              this.socket.ev.on('messages.update', async (payload: any) => {
                  try {
                      const update = payload?.[0];
                      if (!update) return;

                      const key = update.key;
                      const updateType = update.update?.type; // 'revoked' or 'edited'
                      const remoteJid = key?.remoteJid || '';
                      const messageId = key?.id;
                      const statusCode = typeof update.update?.status === 'number' ? update.update.status : null;
                      const isGroup = remoteJid.endsWith('@g.us');

                      void sessionEventService.log(this.tenantId, 'message_updated', {
                          remoteJid,
                          isGroup,
                          label: this.label,
                          updateType,
                          statusCode,
                          keyId: messageId,
                      });

                      const mappedStatus = this.mapBaileysStatus(statusCode);
                      if (mappedStatus && messageId && remoteJid) {
                          await this.recordMessageStatus({
                              messageId,
                              chatId: remoteJid,
                              state: mappedStatus,
                              timestamp: new Date().toISOString(),
                              rawPayload: update,
                              source: 'api_runtime_update',
                          });
                      }

                      // Mark revoked messages as deleted in the DB
                      if (updateType === 'revoked' && messageId) {
try {
                               await supabase
                                   .from('messages')
                                   .update({
                                       text: '[This message was deleted]',
                                       sender: 'system',
                                       is_revoked: true,
                                       updated_at: new Date().toISOString(),
                                   })
                                   .eq('id', messageId)
                                   .eq('tenant_id', this.tenantId);
                          } catch {
                              // Non-fatal: message may not exist in our DB
                          }
                      }
                  } catch (error) {
                      await this.hooks?.onError?.({
                          tenantId: this.tenantId,
                          label: this.label,
                          error,
                          stage: 'messages.update',
                      });
                  }
              });

// Handle group participant changes in real-time
            this.socket.ev.on('group-participants.update', async (payload: any) => {
                try {
                    const { id: groupJid, participants } = payload || {};
                    if (!groupJid || !participants) return;

                    void sessionEventService.log(this.tenantId, 'group_participants_updated', {
                        groupJid,
                        action: payload.action,
                        participantCount: participants.length,
                        label: this.label,
                    });

                    // Re-sync group metadata and participant counts after changes
                    try {
                        const currentGroups = await this.getGroups();
                        const groupInfos: RawGroupInput[] = currentGroups.map((g: any) => ({
                            id: g.id || g,
                            name: g.name || '',
                            participantsCount: g.participantsCount || 0,
                            participantJids: Array.isArray(g.participantJids) ? g.participantJids : [],
                        }));
                        await whatsappGroupService.syncGroups(this.tenantId, this.label, groupInfos);
                    } catch {
                        // Non-fatal: group sync may fail
                    }

                    if (payload.action === 'add' && Array.isArray(participants)) {
                        try {
                            const dedupKey = `${groupJid}:${participants.sort().join(',')}:add`;
                            if (this.isRecentGroupEvent(dedupKey)) {
                                return;
                            }
                            this.rememberGroupEvent(dedupKey);

                            const groupMeta = await this.socket?.groupMetadata(groupJid).catch(() => null);
                            const participantNames = participants.map((raw: any) => {
                                const jidStr = typeof raw === 'string' ? raw : String(raw?.id || raw || '');
                                const phone = jidStr.split('@')[0];
                                return phone;
                            });
                            const groupName = String(groupMeta?.subject || groupJid).trim() || null;

                            if (this.connectedPhoneNumber && this.connectedPhoneNumber !== '917021045254') {
                                return;
                            }

                            const welcomeText = participantNames.length > 0
                                ? `Welcome ${participantNames.join(', ')}. I'm Pulse from PropAI. I help brokers keep ${groupName || 'this group'} organized, parse listings and requirements, and answer when you tag me. Use @Pulse <query> to talk to me in the group.`
                                : this.buildGroupWelcomeText(groupName);
                            await this.sendText(groupJid, welcomeText).catch(() => {});
                        } catch {
                            // Non-fatal: welcome may fail
                        }
                    }
                } catch (error) {
                    await this.hooks?.onError?.({
                        tenantId: this.tenantId,
                        label: this.label,
                        error,
                        stage: 'group-participants.update',
                    });
                }
            });
        } catch (error) {
            clearTimeout(connectionTimeout);
            this.connectionStatus = 'disconnected';
            await this.persistStatus('disconnected');
            await this.hooks?.onError?.({
                tenantId: this.tenantId,
                label: this.label,
                error,
                stage: 'connect',
            });
        } finally {
            clearTimeout(connectionTimeout);
            this.isConnecting = false;
        }
    }

    async restartTransport(options: { usePairingCode?: string; phoneNumber?: string } = {}) {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.qrTimeoutTimer) {
            clearTimeout(this.qrTimeoutTimer);
            this.qrTimeoutTimer = null;
        }

        this.isConnecting = false;
        this.connectionStatus = 'disconnected';
        this.disconnectMeta = { reason: null, replaced: false, at: null };

        if (this.socket) {
            await this.disposeSocket({ logout: false }).catch(() => undefined);
        }

        return this.connect({
            usePairingCode: options.usePairingCode,
            phoneNumber: options.phoneNumber || this.connectedPhoneNumber || undefined,
        });
    }

    async sendText(jid: string, text: string) {
        return this.sendMessage(jid, text);
    }

    private async showTyping(jid: string, textLength: number) {
        if (!this.socket) return;
        const delay = textLength < 50 ? 800 : textLength < 200 ? 1200 : textLength < 500 ? 1800 : 2500;
        await this.socket.sendPresenceUpdate('composing', jid).catch(() => {});
        await new Promise((r) => setTimeout(r, delay));
        await this.socket.sendPresenceUpdate('paused', jid).catch(() => {});
    }

    async sendMessage(jid: string, text: string) {
        if (!this.socket) {
            throw new Error('WhatsApp session is not connected');
        }

        const sanitizedText = sanitizeForWhatsApp(text);
        await this.showTyping(jid, sanitizedText.length).catch(() => {});
        this.rememberOutgoingMessage(jid, sanitizedText);
        const result = await this.socket.sendMessage(jid, { text: sanitizedText });
        await this.recordMessageStatus({
            messageId: String(result?.key?.id || ''),
            chatId: jid,
            state: 'sent',
            timestamp: new Date().toISOString(),
            rawPayload: result as unknown as Record<string, unknown>,
            source: 'api_runtime_send',
        });
        await this.hooks?.onOutgoingMessage?.({
            tenantId: this.tenantId,
            label: this.label,
            remoteJid: jid,
            text: sanitizedText,
            timestamp: new Date().toISOString(),
        });
        return result;
    }

    async sendMedia(jid: string, media: WhatsAppMediaInput) {
        if (!this.socket) {
            throw new Error('WhatsApp session is not connected');
        }

        const caption = String(media.caption || '').trim();
        await this.showTyping(jid, caption.length || 50).catch(() => {});

        const url = String(media.url || '').trim();
        if (!url) {
            throw new Error('Media URL is required');
        }

        const mimeType = String(media.mimeType || 'application/octet-stream').trim();
        const fileName = String(media.fileName || 'attachment').trim() || 'attachment';
        const lowerMimeType = mimeType.toLowerCase();
        const message: Record<string, unknown> = {
            mimetype: mimeType,
        };

        if (caption) {
            message.caption = sanitizeForWhatsApp(caption);
        }

        if (lowerMimeType.startsWith('image/')) {
            message.image = { url };
        } else if (lowerMimeType.startsWith('video/')) {
            message.video = { url };
        } else if (lowerMimeType.startsWith('audio/')) {
            message.audio = { url };
            message.ptt = false;
        } else {
            message.document = { url };
            message.fileName = fileName;
        }

        const result = await this.socket.sendMessage(jid, message as any);
        await this.recordMessageStatus({
            messageId: String(result?.key?.id || ''),
            chatId: jid,
            state: 'sent',
            timestamp: new Date().toISOString(),
            rawPayload: result as unknown as Record<string, unknown>,
            source: 'api_runtime_send',
        });
        await this.hooks?.onOutgoingMessage?.({
            tenantId: this.tenantId,
            label: this.label,
            remoteJid: jid,
            text: caption || fileName,
            timestamp: new Date().toISOString(),
        });
        return result;
    }

    async getGroups() {
        return this.getParticipatingGroups();
    }

    async getParticipatingGroups(): Promise<GroupInfo[]> {
        if (!this.socket || this.connectionStatus !== 'connected') {
            throw new Error('WhatsApp session is not connected');
        }

        const fetchPromise = this.socket.groupFetchAllParticipating?.();
        if (!fetchPromise) {
            return [];
        }

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Fetch participating groups timeout')), 5000)
        );

        try {
            const groups = await Promise.race([fetchPromise, timeoutPromise]);
            if (groups) {
                return Object.values(groups).map((group: any) => {
                    const participantJids = extractParticipantJids(group.participants);
                    return {
                        id: group.id,
                        name: group.subject || group.name || group.id,
                        participantsCount: participantJids.length > 0 ? participantJids.length : undefined,
                        participantJids,
                    };
                });
            }
        } catch (error) {
            console.error('[WhatsAppClient] getParticipatingGroups error or timeout:', error);
            return [];
        }

        return [];
    }

    getStatusSnapshot(): SessionSnapshot & { reconnectAttempts?: number; isReconnecting?: boolean; circuitBreaker?: any } {
        return {
            label: this.label,
            ownerName: this.ownerName || null,
            phoneNumber: this.connectedPhoneNumber || null,
            status: this.connectionStatus,
            reconnectAttempts: this.reconnectAttempts,
            isReconnecting: this.reconnectAttempts > 0 && this.connectionStatus === 'connecting',
            circuitBreaker: this.circuitBreaker.getStatus(),
        };
    }

    private isSessionReplaced(error: unknown): boolean {
        const row = (error || {}) as {
            message?: string;
            data?: unknown;
            output?: { payload?: { message?: string } };
        };
        const message = [
            String(row.message || ''),
            String(row.output?.payload?.message || ''),
            typeof row.data === 'string' ? row.data : '',
        ].join(' ').toLowerCase();

        return message.includes('conflict') && message.includes('replaced');
    }

    private async tryReconnect() {
        if (!this.circuitBreaker.canAttempt()) {
            if (this.shouldLogReconnect('circuit_breaker_open', 5 * 60_000)) {
                console.log(`[WhatsAppClient] Circuit breaker ${this.circuitBreaker.state} for ${this.tenantId}:${this.label}`);
            }
            return;
        }

        try {
            await this.restartTransport({ phoneNumber: this.connectedPhoneNumber });
            this.circuitBreaker.recordSuccess();
        } catch (error) {
            this.circuitBreaker.recordFailure();
            if (this.shouldLogReconnect('reconnect_failed', 60_000)) {
                console.error(`[WhatsAppClient] Reconnect failed:`, error);
            }
        }
    }

    private startHealthCheck() {
        if (this.healthCheckInterval) return;
        this.healthCheckRunning = true;

        const scheduleNextCheck = () => {
            if (!this.healthCheckRunning) {
                return;
            }

            const delay = this.humanizeDelay(30_000, 0.35, 20_000);
            this.healthCheckInterval = setTimeout(() => {
            if (!this.healthCheckRunning) {
                return;
            }

            if (this.circuitBreaker.state === 'open') {
                const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
                if (timeSinceFailure >= 60000) {
                    if (this.shouldLogReconnect('health_check_half_open', 5 * 60_000)) {
                        console.log(`[WhatsAppClient] Health check: attempting half-open for ${this.tenantId}:${this.label}`);
                    }
                    this.tryReconnect();
                }
            }
                scheduleNextCheck();
            }, delay);

            if (typeof this.healthCheckInterval.unref === 'function') {
                this.healthCheckInterval.unref();
            }
        };

        scheduleNextCheck();
    }

    private stopHealthCheck() {
        this.healthCheckRunning = false;
        if (this.healthCheckInterval) {
            clearTimeout(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    private async disposeSocket({ logout }: { logout: boolean }) {
        const activeSocket = this.socket as (WASocket & {
            ws?: { close?: () => void; terminate?: () => void };
            end?: (error?: Error) => void;
        }) | null;

        this.socket = null;
        if (!activeSocket) {
            return;
        }

        if (logout) {
            await activeSocket.logout().catch(() => undefined);
            return;
        }

        try {
            activeSocket.ws?.close?.();
        } catch {
            // Ignore teardown errors while recycling the socket.
        }

        try {
            activeSocket.ws?.terminate?.();
        } catch {
            // Ignore teardown errors while recycling the socket.
        }

        try {
            activeSocket.end?.(new Error('Recycling WhatsApp socket for reconnect'));
        } catch {
            // Ignore teardown errors while recycling the socket.
        }
    }

    async broadcastToGroups(groupJids: string[], text: string, options: BroadcastOptions = {}) {
        const uniqueGroupJids = Array.from(new Set((groupJids || []).filter(Boolean)));
        const batchSize = options.batchSize || 5;
        const delayBetweenMessages = options.delayBetweenMessages || 3000;
        const delayBetweenBatches = options.delayBetweenBatches || 180000;
        const sent: string[] = [];
        const failed: string[] = [];

        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        const normalizedBatchSize = Math.max(1, batchSize);
        const batches: string[][] = [];

        for (let index = 0; index < uniqueGroupJids.length; index += normalizedBatchSize) {
            batches.push(uniqueGroupJids.slice(index, index + normalizedBatchSize));
        }

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
            const batch = batches[batchIndex];

            for (let itemIndex = 0; itemIndex < batch.length; itemIndex += 1) {
                const groupId = batch[itemIndex];
                try {
                    await this.sendText(groupId, text);
                    sent.push(groupId);
                    options.onProgress?.(sent.length, uniqueGroupJids.length, groupId);
                } catch (error) {
                    failed.push(groupId);
                    options.onError?.(groupId, error);
                }

                if (itemIndex < batch.length - 1) {
                    await sleep(delayBetweenMessages);
                }
            }

            if (batchIndex < batches.length - 1) {
                await sleep(delayBetweenBatches);
            }
        }

        return { sent, failed };
    }

    async disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.qrTimeoutTimer) {
            clearTimeout(this.qrTimeoutTimer);
            this.qrTimeoutTimer = null;
        }
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.stopHealthCheck();
        if (this.replayTimer) {
            clearTimeout(this.replayTimer);
            this.replayTimer = null;
        }

        if (this.socket) {
            await this.disposeSocket({ logout: true });
            this.socket = null;
        }

        this.connectionStatus = 'disconnected';
        await this.persistStatus('disconnected');
        await this.storage.deleteSession?.({
            tenantId: this.tenantId,
            label: this.label,
        });
    }

    private async autoSyncBrokerContacts() {
        if (this.tenantId === 'system') return;

        try {
            const { supabaseAdmin } = require('../config/supabase');
            const { count } = await supabaseAdmin!
                .from('broker_contacts')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', this.tenantId);

            if (count === 0) {
                if (this.shouldLogReconnect('auto_sync_start', 6 * 60 * 60_000)) {
                    console.log(`[WhatsAppClient] No broker contacts for ${this.tenantId}, auto-syncing from groups...`);
                }
                const { brokerContactSyncService } = require('../services/brokerContactSyncService');
                const result = await brokerContactSyncService.syncFromStoredGroups(this.tenantId, { minOverlap: 2 });
                if (this.shouldLogReconnect('auto_sync_complete', 6 * 60 * 60_000)) {
                    console.log(`[WhatsAppClient] Auto-sync complete: ${result.contactsUpserted} contacts from ${result.groupsScanned} stored groups`);
                }
            }

            this.autoSyncInterval = setInterval(async () => {
                try {
                    const { brokerContactSyncService } = require('../services/brokerContactSyncService');
                    await brokerContactSyncService.syncFromStoredGroups(this.tenantId, { minOverlap: 2 });
                } catch (e) {
                    if (this.shouldLogReconnect('scheduled_broker_contact_sync_failed', 30 * 60_000)) {
                        console.error('[WhatsAppClient] Scheduled broker contact sync failed:', e);
                    }
                }
            }, 24 * 60 * 60 * 1000);
        } catch (e) {
            if (this.shouldLogReconnect('auto_sync_broker_contacts_failed', 30 * 60_000)) {
                console.error('[WhatsAppClient] Auto-sync broker contacts failed:', e);
            }
        }
    }

    private async emitQR(qr: string) {
        await this.hooks?.onQR?.({
            tenantId: this.tenantId,
            label: this.label,
            qr,
        });
    }

    private async scheduleGroupSync() {
        const maxRetries = 5;
        let attempt = 0;

        const trySync = async (): Promise<void> => {
            if (this.connectionStatus !== 'connected') return;

            try {
                const groups = await this.getGroups();
                if (groups && groups.length > 0) {
                    await this.persistStatus('connected');
                    return;
                }
            } catch {
                // retry below
            }

            attempt++;
            if (attempt < maxRetries) {
                const delay = this.humanizeDelay(
                    Math.min(10_000 * Math.pow(1.5, attempt - 1), 60_000),
                    0.28,
                    2_500,
                );
                setTimeout(() => { void trySync(); }, delay);
            } else {
                if (this.shouldLogReconnect('group_sync_exhausted', 15 * 60_000)) {
                    console.warn(`[WhatsAppClient] Group sync exhausted ${maxRetries} retries for ${this.tenantId}:${this.label}, syncing anyway`);
                }
                await this.persistStatus('connected').catch(() => undefined);
            }
        };

        setTimeout(() => { void trySync(); }, this.humanizeDelay(10_000, 0.35, 2_000));
    }

    private scheduleReplayAfterReconnect(reason: string) {
        if (this.replayTimer) {
            clearTimeout(this.replayTimer);
        }

        this.replayTimer = setTimeout(() => {
            void this.replayPersistedHistory({ reason }).catch((error) => {
                if (this.shouldLogReconnect('replay_failed', 5 * 60_000)) {
                    console.warn('[WhatsAppClient] Reconnect replay failed', {
                        tenantId: this.tenantId,
                        label: this.label,
                        reason,
                        error,
                    });
                }
            });
        }, 15_000);
    }

    private async replayPersistedHistory(input: {
        reason: string;
        chats?: any[];
        messages?: any[];
    }) {
        if (this.replayInProgress) {
            return;
        }

        this.replayInProgress = true;
        let messages: any[] = [];
        let earliest: string | null = null;
        let latest: string | null = null;
        try {
            messages = Array.isArray(input.messages) ? input.messages : [];
            const timestamps = messages
                .map((message: any) => {
                    const raw = message?.messageTimestamp || message?.timestamp || message?.created_at;
                    const value = typeof raw === 'number'
                        ? (raw > 1_000_000_000_000 ? raw : raw * 1000)
                        : new Date(String(raw || '')).getTime();
                    return Number.isFinite(value) ? value : null;
                })
                .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

            earliest = timestamps.length > 0
                ? new Date(Math.min(...timestamps)).toISOString()
                : this.disconnectMeta.at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            latest = timestamps.length > 0
                ? new Date(Math.max(...timestamps)).toISOString()
                : null;

            const { channelService } = require('../services/channelService');

            await whatsappHealthService.appendEvent(
                this.tenantId,
                this.label,
                'history_replay_started',
                `Replaying stored WhatsApp messages after reconnect (${input.reason}).`,
                {
                    reason: input.reason,
                    from: earliest,
                    to: latest,
                    messageCount: messages.length,
                },
            );

            await channelService.rebuildStreamFromMessages(this.tenantId, {
                sessionLabel: this.label,
                from: earliest,
                to: latest,
                limit: Math.min(Math.max(messages.length + 100, 500), 10000),
            });

            await whatsappHealthService.appendEvent(
                this.tenantId,
                this.label,
                'history_replay_completed',
                'Stored WhatsApp messages were replayed into Stream after reconnect.',
                {
                    reason: input.reason,
                    from: earliest,
                    to: latest,
                    messageCount: messages.length,
                },
            );
        } catch (error) {
            await whatsappHealthService.appendEvent(
                this.tenantId,
                this.label,
                'history_replay_failed',
                'Stored WhatsApp messages could not be replayed after reconnect.',
                {
                    reason: input.reason,
                    from: earliest,
                    to: latest,
                    messageCount: messages.length,
                    error: error instanceof Error ? error.message : String(error || 'Unknown error'),
                },
            );
            throw error;
        } finally {
            this.replayInProgress = false;
        }
    }

    private async persistStatus(status: ConnectionStatus) {
        const payload = {
            tenantId: this.tenantId,
            label: this.label,
            ownerName: this.ownerName || null,
            phoneNumber: this.connectedPhoneNumber || null,
            lidJid: this.connectedLidJid || null,
            status,
            lastSync: new Date().toISOString(),
        };

        await this.storage.saveSessionStatus(payload);
        await this.persistDisconnectMeta(status);
        await this.hooks?.onConnectionUpdate?.(payload);
    }

    private async persistDisconnectMeta(status: ConnectionStatus) {
        try {
            const { data: existing } = await supabase
                .from('whatsapp_sessions')
                .select('session_data')
                .eq('tenant_id', this.tenantId)
                .eq('label', this.label)
                .maybeSingle();

            const sessionData = (existing?.session_data && typeof existing.session_data === 'object')
                ? existing.session_data as Record<string, unknown>
                : {};

            const nextSessionData = {
                ...sessionData,
                disconnectReason: status === 'disconnected' ? this.disconnectMeta.reason : null,
                autoReconnectBlocked: status === 'disconnected' ? this.disconnectMeta.replaced : false,
                autoReconnectBlockedAt: status === 'disconnected' ? this.disconnectMeta.at : null,
            };

            await supabase
                .from('whatsapp_sessions')
                .update({ session_data: nextSessionData, updated_at: new Date().toISOString() })
                .eq('tenant_id', this.tenantId)
                .eq('label', this.label);
        } catch (error) {
            console.warn('[WhatsAppClient] Failed to persist disconnect metadata', {
                tenantId: this.tenantId,
                label: this.label,
                error,
            });
        }
    }

    private extractMessageText(message: any): string {
        const unwrapped = (
            message?.ephemeralMessage?.message ||
            message?.viewOnceMessage?.message ||
            message?.viewOnceMessageV2?.message ||
            message?.documentWithCaptionMessage?.message ||
            message
        );

        return String(
            unwrapped?.conversation ||
            unwrapped?.extendedTextMessage?.text ||
            unwrapped?.imageMessage?.caption ||
            unwrapped?.videoMessage?.caption ||
            unwrapped?.documentMessage?.caption ||
            '',
        ).trim();
    }

    private resolveStoredSender(msg: any) {
        if (msg?.key?.fromMe) {
            return this.connectedPhoneNumber
                ? `${this.connectedPhoneNumber}@s.whatsapp.net`
                : 'workspace@s.whatsapp.net';
        }

        const participant = String(msg?.key?.participant || msg?.participant || msg?.key?.remoteJid || '').trim();
        return participant || null;
    }

    private resolveMessageTimestamp(msg: any) {
        const raw = msg?.messageTimestamp;
        if (raw == null) {
            return new Date().toISOString();
        }

        const numeric = typeof raw === 'number'
            ? raw
            : typeof raw === 'string'
                ? Number(raw)
                : typeof raw?.toNumber === 'function'
                    ? raw.toNumber()
                    : Number(raw);

        if (!Number.isFinite(numeric) || numeric <= 0) {
            return new Date().toISOString();
        }

        return new Date(numeric * 1000).toISOString();
    }

    private createOutgoingMessageKey(jid: string, text: string) {
        return `${jid}:${text.trim()}`;
    }

    private rememberOutgoingMessage(jid: string, text: string) {
        const key = this.createOutgoingMessageKey(jid, text);
        this.recentOutgoingMessages.set(key, Date.now() + 60000);
    }

    private isRecentOutgoingMessage(jid: string, text: string) {
        const now = Date.now();
        for (const [key, expiresAt] of this.recentOutgoingMessages.entries()) {
            if (expiresAt <= now) {
                this.recentOutgoingMessages.delete(key);
            }
        }

        const key = this.createOutgoingMessageKey(jid, text);
        const expiresAt = this.recentOutgoingMessages.get(key);
        if (!expiresAt) {
            return false;
        }

        this.recentOutgoingMessages.delete(key);
        return true;
    }

    private rememberGroupEvent(key: string) {
        this.recentGroupEvents.set(key, Date.now() + 60000);
    }

    private isRecentGroupEvent(key: string) {
        const now = Date.now();
        for (const [entryKey, expiresAt] of this.recentGroupEvents.entries()) {
            if (expiresAt <= now) {
                this.recentGroupEvents.delete(entryKey);
            }
        }

        const expiresAt = this.recentGroupEvents.get(key);
        if (!expiresAt) {
            return false;
        }

        return true;
    }

    private async persistHistoryMessage(event: IncomingMessageRecord) {
        if (this.storage instanceof PropAISupabaseAdapter) {
            await this.storage.saveHistoryMessage(event);
            return;
        }

        await this.storage.saveInboundMessage(event);
    }

    private async persistChatTitles(chats: any[]) {
        const directChatTitles = Object.fromEntries(
            (Array.isArray(chats) ? chats : [])
                .map((chat) => {
                    const chatId = String(chat?.id || '').trim();
                    if (!chatId || chatId.endsWith('@g.us')) return null;

                    const title = String(
                        chat?.name ||
                        chat?.conversationName ||
                        chat?.subject ||
                        chat?.pushName ||
                        ''
                    ).trim();

                    if (!title) return null;
                    return [chatId, title] as const;
                })
                .filter((entry): entry is readonly [string, string] => Boolean(entry)),
        );

        if (Object.keys(directChatTitles).length === 0) {
            return;
        }

        try {
            const { data: existing } = await supabase
                .from('whatsapp_sessions')
                .select('session_data')
                .eq('tenant_id', this.tenantId)
                .eq('label', this.label)
                .maybeSingle();

            const sessionData = (existing?.session_data && typeof existing.session_data === 'object')
                ? existing.session_data as Record<string, unknown>
                : {};
            const existingTitles = (sessionData.chatTitles && typeof sessionData.chatTitles === 'object')
                ? sessionData.chatTitles as Record<string, unknown>
                : {};

            await supabase
                .from('whatsapp_sessions')
                .update({
                    session_data: {
                        ...sessionData,
                        chatTitles: {
                            ...existingTitles,
                            ...directChatTitles,
                        },
                    },
                    updated_at: new Date().toISOString(),
                })
                .eq('tenant_id', this.tenantId)
                .eq('label', this.label);
        } catch (error) {
            console.warn('[WhatsAppClient] Failed to persist chat titles', {
                tenantId: this.tenantId,
                label: this.label,
                error,
            });
        }
    }
}
