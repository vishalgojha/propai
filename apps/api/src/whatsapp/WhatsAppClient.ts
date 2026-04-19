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

export interface WhatsAppClientOptions {
    tenantId: string;
    onQR: (qr: string) => void;
    onConnectionUpdate: (status: string) => void;
    label?: string;
    ownerName?: string;
}

export class WhatsAppClient {
    private socket: any;
    private tenantId: string;
    private onQR: (qr: string) => void;
    private onConnectionUpdate: (status: string) => void;
    private sessionPath: string;
    private isConnecting: boolean = false;
    private label: string;
    private ownerName: string | undefined;

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
                    this.updateSessionStatus('connected');
                    this.onConnectionUpdate('connected');
                }
            });

            this.socket.ev.on('creds.update', saveCreds);

            this.socket.ev.on('messages.upsert', async (m: any) => {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;

                const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                const remoteJid = msg.key.remoteJid || '';

                await this.saveMessage(remoteJid, messageText);
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
            await supabase
                .from('whatsapp_sessions')
                .upsert({ 
                    tenant_id: this.tenantId, 
                    status, 
                    updated_at: new Date().toISOString() 
                }, { onConflict: 'tenant_id' });
        } catch (error) {
            console.error(`Supabase error updating status for ${this.tenantId}:`, error);
        }
    }

    private async saveMessage(remoteJid: string, text: string) {
        try {
            await supabase
                .from('messages')
                .insert({ 
                    tenant_id: this.tenantId, 
                    remote_jid: remoteJid, 
                    message_text: text 
                });

            await this.handleIncomingMessage(remoteJid, text);
        } catch (error) {
            console.error(`Supabase error saving message for ${this.tenantId}:`, error);
        }
    }

    private async handleIncomingMessage(remoteJid: string, text: string) {
        // 1. Check for verification replies first
        if (text.toUpperCase() === 'YES') {
            try {
                const phone = remoteJid.split('@')[0];
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('phone', phone)
                    .single();

                if (profile) {
                    await supabase
                        .from('profiles')
                        .update({ phone_verified: true })
                        .eq('id', profile.id);
                    
                    await this.sendText(remoteJid, "Verified! ✅ You now have full access to PropAI Sync. Welcome aboard!");
                    return;
                }
            } catch (e) {
                console.error('Verification reply error:', e);
            }
        }

        // 2. Basic filters
        if (text.length < 20) return;
        if (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu) && text.replace(/[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu, '').length === 0) return;
        
        const isGroup = remoteJid.endsWith('@g.us');

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

        this.triggerAgent(remoteJid, text);
    }

    private async triggerAgent(remoteJid: string, text: string) {
        try {
            const { AgentExecutor } = require('../services/AgentExecutor');
            const executor = new AgentExecutor();
            const response = await executor.processMessage(this.tenantId, remoteJid, text);
            
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
            await this.socket.sendMessage(jid, { text });
        } catch (error) {
            console.error(`Failed to send message for tenant ${this.tenantId}:`, error);
            throw error;
        }
    }

    async getGroups() {
        const groups = this.socket.store.chats.chats.filter((chat: any) => chat.id.endsWith('@g.us'));
        return groups.map((g: any) => ({ id: g.id, name: g.name }));
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
