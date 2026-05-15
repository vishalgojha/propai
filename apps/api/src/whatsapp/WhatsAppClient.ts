import makeWASocket, {
     DisconnectReason,
     fetchLatestBaileysVersion,
     type WASocket,
 } from '@whiskeysockets/baileys';
 import { Boom } from '@hapi/boom';
 import { sanitizeForWhatsApp } from './sanitizer';
import { createSupabaseAuthState, type SupabaseAuthState } from './SupabaseAuthState';
import { CircuitBreaker } from './CircuitBreaker';
import { sessionEventService } from '../services/sessionEventService';
import { whatsappGroupService } from '../services/whatsappGroupService';
import { supabase } from '../config/supabase';
import { type RawGroupInput } from '../services/whatsappGroupService';
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

export interface BroadcastOptions {
    batchSize?: number;
    delayBetweenMessages?: number;
    delayBetweenBatches?: number;
    onProgress?: (sent: number, total: number, groupId: string) => void;
    onError?: (groupId: string, error: unknown) => void;
}

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
    private authState: SupabaseAuthState | null = null;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 10;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private circuitBreaker = new CircuitBreaker();
    private healthCheckInterval: NodeJS.Timeout | null = null;

    constructor(options: WhatsAppClientOptions) {
        this.tenantId = options.tenantId;
        this.storage = options.storage;
        this.hooks = options.hooks;
        this.label = options.label;
        this.ownerName = options.ownerName;
        this.connectedPhoneNumber = options.phoneNumber || options.usePairingCode;
    }

    async connect(options: { usePairingCode?: string; phoneNumber?: string } = {}) {
        if (this.isConnecting) {
            return;
        }

        this.isConnecting = true;
        this.connectedPhoneNumber = options.phoneNumber || options.usePairingCode || this.connectedPhoneNumber;
        this.connectionStatus = 'connecting';
        await this.persistStatus('connecting');

        if (this.reconnectAttempts > 0) {
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
                const fetched = await fetchLatestBaileysVersion();
                version = fetched.version;
            } catch (error) {
                console.log('[WhatsAppClient] Version fetch failed, using default:', error);
            }

            if (this.socket) {
                await this.socket.logout().catch(() => undefined);
                this.socket = null;
            }

            this.socket = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                connectTimeoutMs: 30000,
                qrTimeout: 120000,
            });

            console.log(`[WhatsAppClient] Socket created for ${this.tenantId}:${this.label}, waiting for QR...`);

            if (options.usePairingCode) {
                const code = await this.socket.requestPairingCode(options.usePairingCode);
                await this.emitQR(code);
            }

            this.socket.ev.on('connection.update', async (update: any) => {
                try {
                    const connection = update?.connection;
                    const lastDisconnect = update?.lastDisconnect;
                    const qr = update?.qr;

                    if (qr && !options.usePairingCode) {
                        await this.emitQR(qr);
                    }

                    const userId = String(this.socket?.user?.id || '');
                    if (userId) {
                        const separatorIndex = userId.indexOf(':');
                        const normalizedPhone = separatorIndex >= 0 ? userId.slice(0, separatorIndex) : userId;
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
                        this.connectionStatus = 'disconnected';
                        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
                        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                        if (statusCode === DisconnectReason.loggedOut) {
                            await this.storage.deleteSession?.({
                                tenantId: this.tenantId,
                                label: this.label,
                            });
                        }

                        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                            this.reconnectAttempts++;
                            this.circuitBreaker.recordFailure();

                            const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
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
                        this.connectionStatus = 'connected';
                        this.reconnectAttempts = 0;
                        this.circuitBreaker.recordSuccess();
                        if (this.reconnectTimer) {
                            clearTimeout(this.reconnectTimer);
                            this.reconnectTimer = null;
                        }
                        await this.persistStatus('connected');

                        this.scheduleGroupSync();
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

this.socket.ev.on('messages.upsert', async (payload: any) => {
                 try {
                     const msg = payload?.messages?.[0];
                     if (!msg?.message) {
                         return;
                     }

                     const messageText = this.extractMessageText(msg.message);
                     const remoteJid = msg.key?.remoteJid || '';
                     const remoteJidAlt = String(msg.key?.remoteJidAlt || '');
                     const wasSentByThisClient = this.isRecentOutgoingMessage(remoteJid, messageText);

                     if (!messageText) {
                         return;
                     }

                     if (msg.key?.fromMe && wasSentByThisClient) {
                         return;
                     }

                     if (msg.key?.fromMe && remoteJid.endsWith('@lid') && remoteJidAlt.startsWith(`${this.connectedPhoneNumber}@`)) {
                         this.connectedLidJid = remoteJid;
                         await this.persistStatus(this.connectionStatus);
                     }

                     const isGroup = remoteJid.endsWith('@g.us');
                     void sessionEventService.log(this.tenantId, 'message_received', {
                         remoteJid,
                         isGroup,
                         label: this.label,
                         length: messageText.length,
                         hasMedia: Boolean(msg.message?.imageMessage || msg.message?.videoMessage),
                     });

                     const event: IncomingMessageRecord = {
                         tenantId: this.tenantId,
                         label: this.label,
                         remoteJid,
                         text: messageText,
                         sender: this.resolveStoredSender(msg),
                         timestamp: this.resolveMessageTimestamp(msg),
                         fromMe: Boolean(msg.key?.fromMe),
                         rawMessage: msg,
                     };

                     await this.storage.saveInboundMessage(event);
                     await this.hooks?.onMessage?.(event);
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
                      const isGroup = remoteJid.endsWith('@g.us');

                      void sessionEventService.log(this.tenantId, 'message_updated', {
                          remoteJid,
                          isGroup,
                          label: this.label,
                          updateType,
                          keyId: messageId,
                      });

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
                          }));
                          await whatsappGroupService.syncGroups(this.tenantId, this.label, groupInfos);
                      } catch {
                          // Non-fatal: group sync may fail
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
            this.connectionStatus = 'disconnected';
            await this.persistStatus('disconnected');
            await this.hooks?.onError?.({
                tenantId: this.tenantId,
                label: this.label,
                error,
                stage: 'connect',
            });
        } finally {
            this.isConnecting = false;
        }
    }

    async sendText(jid: string, text: string) {
        return this.sendMessage(jid, text);
    }

    async sendMessage(jid: string, text: string) {
        if (!this.socket) {
            throw new Error('WhatsApp session is not connected');
        }

        const sanitizedText = sanitizeForWhatsApp(text);
        this.rememberOutgoingMessage(jid, sanitizedText);
        await this.socket.sendMessage(jid, { text: sanitizedText });
        await this.hooks?.onOutgoingMessage?.({
            tenantId: this.tenantId,
            label: this.label,
            remoteJid: jid,
            text: sanitizedText,
            timestamp: new Date().toISOString(),
        });
    }

    async getGroups() {
        return this.getParticipatingGroups();
    }

    async getParticipatingGroups(): Promise<GroupInfo[]> {
        if (!this.socket) {
            throw new Error('WhatsApp session is not connected');
        }

        const groups = await this.socket.groupFetchAllParticipating?.();
        if (groups) {
            return Object.values(groups).map((group: any) => ({
                id: group.id,
                name: group.subject || group.name || group.id,
            }));
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

    private async tryReconnect() {
        if (!this.circuitBreaker.canAttempt()) {
            console.log(`[WhatsAppClient] Circuit breaker ${this.circuitBreaker.state} for ${this.tenantId}:${this.label}`);
            return;
        }

        try {
            await this.connect({ usePairingCode: undefined, phoneNumber: this.connectedPhoneNumber });
            this.circuitBreaker.recordSuccess();
        } catch (error) {
            this.circuitBreaker.recordFailure();
            console.error(`[WhatsAppClient] Reconnect failed:`, error);
        }
    }

    private startHealthCheck() {
        if (this.healthCheckInterval) return;
        
        const interval = setInterval(() => {
            if (this.circuitBreaker.state === 'open') {
                const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
                if (timeSinceFailure >= 60000) {
                    console.log(`[WhatsAppClient] Health check: attempting half-open for ${this.tenantId}:${this.label}`);
                    this.tryReconnect();
                }
            }
        }, 30000);
        this.healthCheckInterval = interval;
    }

    private stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
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
        if (!this.socket) {
            return;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;

        await this.socket.logout();
        this.socket = null;
        this.connectionStatus = 'disconnected';
        await this.persistStatus('disconnected');
        await this.storage.deleteSession?.({
            tenantId: this.tenantId,
            label: this.label,
        });
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
                const delay = Math.min(10000 * Math.pow(1.5, attempt - 1), 60000);
                setTimeout(() => { void trySync(); }, delay);
            } else {
                console.warn(`[WhatsAppClient] Group sync exhausted ${maxRetries} retries for ${this.tenantId}:${this.label}, syncing anyway`);
                await this.persistStatus('connected').catch(() => undefined);
            }
        };

        setTimeout(() => { void trySync(); }, 10_000);
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
        await this.hooks?.onConnectionUpdate?.(payload);
    }

    private extractMessageText(message: any): string {
        return (
            message?.conversation ||
            message?.extendedTextMessage?.text ||
            message?.imageMessage?.caption ||
            message?.videoMessage?.caption ||
            ''
        );
    }

    private resolveStoredSender(msg: any) {
        if (msg?.key?.fromMe) {
            return this.connectedPhoneNumber
                ? `${this.connectedPhoneNumber}@s.whatsapp.net`
                : 'workspace@s.whatsapp.net';
        }

        const participant = String(msg?.key?.participant || msg?.participant || '').trim();
        const pushName = String(msg?.pushName || '').trim();
        return pushName || participant || null;
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
}
