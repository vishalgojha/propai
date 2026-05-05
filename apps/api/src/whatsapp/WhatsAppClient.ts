import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    ConnectionState 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import { supabase } from '../config/supabase';
import { whatsappParseConsentService } from '../services/whatsappParseConsentService';
import { whatsappStreamIngestionService } from '../services/whatsappStreamIngestionService';

export interface WhatsAppClientOptions {
    tenantId: string;
    onQR: (qr: string) => void;
    onConnectionUpdate: (status: string) => void;
    label?: string;
    ownerName?: string;
}

export interface WhatsAppMediaFile {
    data: string;
    mimeType: string;
    fileName: string;
    caption?: string;
}

const PULSE_ASSISTANT_PHONE = '7021045254';

export class WhatsAppClient {
    private socket: any;
    private tenantId: string;
    private onQR: (qr: string) => void;
    private onConnectionUpdate: (status: string) => void;
    private sessionPath: string;
    private isConnecting: boolean = false;
    private label: string;
    private ownerName: string | undefined;
    private connectedPhoneNumber: string | undefined;
    private recentOutgoingMessages = new Map<string, number>();

    constructor(options: WhatsAppClientOptions) {
        if (!/^[a-z0-9-]+$/i.test(options.tenantId)) {
            throw new Error('Invalid tenantId format');
        }
        this.tenantId = options.tenantId;
        this.onQR = options.onQR;
        this.onConnectionUpdate = options.onConnectionUpdate;
        this.label = options.label || 'Owner';
        this.ownerName = options.ownerName;
        this.sessionPath = path.join(__dirname, `../../sessions/${this.tenantId}_${this.label}`);
    }

    async connect(options: { usePairingCode?: string } = {}) {
        if (this.isConnecting) return;
        this.isConnecting = true;
        this.connectedPhoneNumber = options.usePairingCode || this.connectedPhoneNumber;

        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            if (this.socket) {
                this.socket.ev.removeAllListeners();
            }

            this.socket = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
            });

            if (options.usePairingCode) {
                const code = await this.socket.requestPairingCode(options.usePairingCode);
                this.onQR(code); 
            }

            this.socket.ev.on('connection.update', async (update: any) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !options.usePairingCode) {
                    this.onQR(qr);
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Connection closed for tenant', this.tenantId, 'due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                    if (shouldReconnect) {
                        this.connect(options);
                    } else {
                        this.updateSessionStatus('disconnected');
                    }
                } else if (connection === 'open') {
                    console.log('Opened connection for tenant:', this.tenantId);
                    this.connectedPhoneNumber = this.socket?.user?.id || this.connectedPhoneNumber;
                    this.updateSessionStatus('connected');
                    this.onConnectionUpdate('connected');
                }
            });

            this.socket.ev.on('creds.update', saveCreds);

            this.socket.ev.on('messages.upsert', async (m: any) => {
                const msg = m.messages[0];
                if (!msg.message) return;

                const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                const remoteJid = msg.key.remoteJid || '';

                if (!messageText.trim() || !remoteJid) return;

                const fromMe = Boolean(msg.key.fromMe);
                const isAssistantThread = this.isPulseAssistantThread(remoteJid);

                if (fromMe && this.isRecentOutgoingMessage(remoteJid, messageText)) {
                    return;
                }

                if (fromMe && !isAssistantThread) {
                    return;
                }

                await this.saveMessage(
                    remoteJid,
                    messageText,
                    msg.pushName || null,
                    isAssistantThread,
                    {
                        timestamp: this.normalizeMessageTimestamp(msg.messageTimestamp),
                        senderNumber: this.normalizeComparablePhone(msg.key.participant || remoteJid) || null,
                        groupName: remoteJid.endsWith('@g.us') ? await this.getGroupName(remoteJid) : null,
                    }
                );
            });
        } catch (error) {
            console.error(`Failed to connect WhatsApp for tenant ${this.tenantId}:`, error);
            this.updateSessionStatus('disconnected');
        } finally {
            this.isConnecting = false;
        }
    }

    private async updateSessionStatus(status: string) {
        try {
            if (this.tenantId === 'system') {
                return;
            }

            const payload = {
                tenant_id: this.tenantId,
                session_id: this.label,
                label: this.label,
                owner_name: this.ownerName || null,
                status,
                session_data: {},
                last_sync: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data: existing, error: selectError } = await supabase
                .from('whatsapp_sessions')
                .select('id')
                .eq('tenant_id', this.tenantId)
                .eq('session_id', this.label)
                .maybeSingle();

            if (selectError) throw selectError;

            if (existing?.id) {
                const { error } = await supabase
                    .from('whatsapp_sessions')
                    .update(payload)
                    .eq('id', existing.id);
                if (error) throw error;
                return;
            }

            const { error } = await supabase
                .from('whatsapp_sessions')
                .insert(payload);
            if (error) throw error;
        } catch (error) {
            console.error(`Supabase error updating status for ${this.tenantId}:`, error);
        }
    }

    private async saveMessage(
        remoteJid: string,
        text: string,
        senderName?: string | null,
        bypassPrivacyGate = false,
        metadata: { timestamp?: string | null; senderNumber?: string | null; groupName?: string | null } = {}
    ) {
        try {
            if (await this.handleVerificationReply(remoteJid, text)) {
                return;
            }

            if (!bypassPrivacyGate) {
                const parseConsent = await whatsappParseConsentService.getDecision({
                    tenantId: this.tenantId,
                    sessionLabel: this.label,
                    remoteJid,
                    displayName: senderName,
                    timestamp: new Date().toISOString(),
                });

                if (!parseConsent.allowed) {
                    console.log(
                        `Skipping private WhatsApp ${parseConsent.targetType} for ${this.tenantId}: ${parseConsent.reason}`
                    );
                    return;
                }
            }

            await supabase
                .from('messages')
                .insert({ 
                    tenant_id: this.tenantId, 
                    remote_jid: remoteJid, 
                    text,
                    sender: remoteJid.endsWith('@g.us') ? 'Broker' : 'Client',
                });

            if (!bypassPrivacyGate && remoteJid.endsWith('@g.us')) {
                await whatsappStreamIngestionService.captureGroupMessage({
                    tenantId: this.tenantId,
                    groupId: remoteJid,
                    groupName: metadata.groupName || remoteJid,
                    message: text,
                    senderNumber: metadata.senderNumber || null,
                    senderName: senderName || null,
                    timestamp: metadata.timestamp || new Date().toISOString(),
                });
            }

            await this.handleIncomingMessage(remoteJid, text, bypassPrivacyGate);
        } catch (error) {
            console.error(`Supabase error saving message for ${this.tenantId}:`, error);
        }
    }

    private async handleVerificationReply(remoteJid: string, text: string) {
        if (text.toUpperCase() !== 'YES') {
            return false;
        }

        try {
            const phone = remoteJid.split('@')[0];
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('phone', phone)
                .single();

            if (!profile) {
                return false;
            }

            await supabase
                .from('profiles')
                .update({ phone_verified: true })
                .eq('id', profile.id);
            
            await this.sendText(remoteJid, "Verified! You now have full access to PropAI Sync. Welcome aboard!");
            return true;
        } catch (e) {
            console.error('Verification reply error:', e);
            return false;
        }
    }

    private async handleIncomingMessage(remoteJid: string, text: string, isAssistantThread = false) {
        // Basic filters after consent has already passed.
        if (text.length < 20 && !isAssistantThread) return;
        if (!isAssistantThread && text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu) && text.replace(/[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu, '').length === 0) return;
        
        const isGroup = remoteJid.endsWith('@g.us');

        if (isAssistantThread) {
            await this.triggerAgent(remoteJid, text);
            return;
        }

        if (isGroup) {
            const { data: config } = await supabase
                .from('group_configs')
                .select('behavior')
                .eq('group_id', remoteJid)
                .single();

            if (config?.behavior !== 'Listen' && config?.behavior !== 'AutoReply') return;
        } else {
            const { data: contact } = await supabase
                .from('contacts')
                .select('classification')
                .eq('remote_jid', remoteJid)
                .single();

            if (contact?.classification === 'Broker') return;
        }

        await this.triggerAgent(remoteJid, text);
    }

    private async triggerAgent(remoteJid: string, text: string) {
        try {
            const { agentExecutor } = require('../services/AgentExecutor');
            const response = await agentExecutor.processMessage(this.tenantId, remoteJid, text);
            
            await this.sendText(remoteJid, response);
            
            await supabase.from('messages').insert({
                tenant_id: this.tenantId,
                remote_jid: remoteJid,
                text: response,
                sender: 'AI'
            });
        } catch (error) {
            console.error('Agent Execution Loop Error:', error);
        }
    }

    async sendText(jid: string, text: string) {
        try {
            this.rememberOutgoingMessage(jid, text);
            await this.socket.sendMessage(jid, { text });
        } catch (error) {
            console.error(`Failed to send message for tenant ${this.tenantId}:`, error);
            throw error;
        }
    }

    private isPulseAssistantThread(remoteJid: string) {
        const labelLooksAssistant = this.label.toLowerCase() === 'assistant';
        const connectedPhone = this.normalizeComparablePhone(this.connectedPhoneNumber);
        const remotePhone = this.normalizeComparablePhone(remoteJid);

        return (
            labelLooksAssistant ||
            connectedPhone === PULSE_ASSISTANT_PHONE ||
            (Boolean(connectedPhone) && connectedPhone === remotePhone) ||
            remotePhone === PULSE_ASSISTANT_PHONE
        );
    }

    private normalizeMessageTimestamp(timestamp: unknown) {
        if (timestamp == null) return new Date().toISOString();
        const numeric = Number(timestamp);
        if (Number.isFinite(numeric) && numeric > 0) {
            const millis = numeric > 1000000000000 ? numeric : numeric * 1000;
            return new Date(millis).toISOString();
        }
        return new Date().toISOString();
    }

    private async getGroupName(remoteJid: string) {
        try {
            if (this.socket.groupMetadata) {
                const metadata = await this.socket.groupMetadata(remoteJid);
                return metadata?.subject || remoteJid;
            }
        } catch (error) {
            console.warn(`Failed to fetch WhatsApp group metadata for ${remoteJid}:`, error);
        }

        return remoteJid;
    }

    private rememberOutgoingMessage(jid: string, text: string) {
        const key = this.messageKey(jid, text);
        this.recentOutgoingMessages.set(key, Date.now());

        for (const [entryKey, timestamp] of this.recentOutgoingMessages.entries()) {
            if (Date.now() - timestamp > 30000) {
                this.recentOutgoingMessages.delete(entryKey);
            }
        }
    }

    private isRecentOutgoingMessage(jid: string, text: string) {
        const key = this.messageKey(jid, text);
        const timestamp = this.recentOutgoingMessages.get(key);
        if (!timestamp) return false;

        if (Date.now() - timestamp > 30000) {
            this.recentOutgoingMessages.delete(key);
            return false;
        }

        return true;
    }

    private messageKey(jid: string, text: string) {
        return `${this.normalizeJid(jid)}:${String(text || '').trim()}`;
    }

    private normalizeJid(value?: string | null) {
        const jid = String(value || '').trim();
        const suffixIndex = jid.indexOf('@');
        const separatorIndex = jid.indexOf(':');

        if (separatorIndex >= 0 && suffixIndex > separatorIndex) {
            return `${jid.slice(0, separatorIndex)}${jid.slice(suffixIndex)}`;
        }

        return jid;
    }

    private normalizeComparablePhone(value?: string | null) {
        return String(value || '').split('').filter((c) => c >= '0' && c <= '9').join('').slice(-10);
    }

    async sendMedia(jid: string, file: WhatsAppMediaFile) {
        try {
            const buffer = this.mediaBufferFromDataUrl(file.data);
            const fileName = file.fileName || 'attachment';
            const mimetype = file.mimeType || 'application/octet-stream';
            const caption = file.caption?.trim();

            if (mimetype.startsWith('image/')) {
                await this.socket.sendMessage(jid, { image: buffer, mimetype, fileName, caption });
                return;
            }

            if (mimetype.startsWith('video/')) {
                await this.socket.sendMessage(jid, { video: buffer, mimetype, fileName, caption });
                return;
            }

            if (mimetype.startsWith('audio/')) {
                await this.socket.sendMessage(jid, { audio: buffer, mimetype, fileName, ptt: false });
                return;
            }

            await this.socket.sendMessage(jid, { document: buffer, mimetype, fileName, caption });
        } catch (error) {
            console.error(`Failed to send media for tenant ${this.tenantId}:`, error);
            throw error;
        }
    }

    private mediaBufferFromDataUrl(data: string) {
        const base64 = data.includes(',') ? data.split(',').pop() || '' : data;
        return Buffer.from(base64, 'base64');
    }

    async getGroups() {
        if (this.socket.groupFetchAllParticipating) {
            const groups = await this.socket.groupFetchAllParticipating();
            return Object.values(groups).map((g: any) => ({
                id: g.id,
                name: g.subject || g.name || g.id,
                participantsCount: Array.isArray(g.participants) ? g.participants.length : 0,
            }));
        }

        const chats = this.socket.store?.chats?.chats || [];
        const groups = Array.isArray(chats)
            ? chats.filter((chat: any) => chat.id.endsWith('@g.us'))
            : [];
        return groups.map((g: any) => ({ id: g.id, name: g.name || g.subject || g.id, participantsCount: 0 }));
    }

    getSessionLabel() {
        return this.label;
    }

    async disconnect() {
        if (this.socket) {
            await this.socket.logout();
            if (fs.existsSync(this.sessionPath)) {
                fs.rmSync(this.sessionPath, { recursive: true, force: true });
            }
            this.updateSessionStatus('disconnected');
        }
    }
}
