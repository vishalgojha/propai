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
}

export class WhatsAppClient {
    private socket: any;
    private tenantId: string;
    private onQR: (qr: string) => void;
    private onConnectionUpdate: (status: string) => void;
    private sessionPath: string;
    private isConnecting: boolean = false;

    constructor(options: WhatsAppClientOptions) {
        if (!/^[a-z0-9-]+$/i.test(options.tenantId)) {
            throw new Error('Invalid tenantId format');
        }
        this.tenantId = options.tenantId;
        this.onQR = options.onQR;
        this.onConnectionUpdate = options.onConnectionUpdate;
        this.sessionPath = path.join(__dirname, `../../sessions/${this.tenantId}`);
    }

    async connect() {
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

            this.socket.ev.on('connection.update', async (update: any) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.onQR(qr);
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Connection closed for tenant', this.tenantId, 'due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                    if (shouldReconnect) {
                        this.connect();
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

            this.socket.ev.on('messages.upsert', async (m) => {
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

            // Trigger Listing Parser if group is monitored
            await this.parseListing(remoteJid, text);
        } catch (error) {
            console.error(`Supabase error saving message for ${this.tenantId}:`, error);
        }
    }

    private async parseListing(remoteJid: string, text: string) {
        const { data: config } = await supabase
            .from('group_configs')
            .select('behavior')
            .eq('group_id', remoteJid)
            .single();

        if (config?.behavior !== 'Listen') return; // Only parse if monitoring

        try {
            const prompt = `Extract real estate listing data from this text. Return ONLY a JSON object with these fields: bhk, location, price, carpet_area, furnishing, possession_date, contact_number. If a field is missing, set it to null. Text: "${text}"`;
            
            // Use the AI service via a direct call or API
            const response = await fetch('http://localhost:3001/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, modelPreference: 'Local' })
            });
            const result = await response.json();
            
            const structuredData = JSON.parse(result.text);
            
            // Confidence check: basic check if at least 2 fields are found
            const fieldCount = Object.values(structuredData).filter(v => v !== null).length;
            
            if (fieldCount >= 2) {
                await supabase.from('listings').insert({
                    tenant_id: this.tenantId,
                    source_group_id: remoteJid,
                    structured_data: structuredData,
                    raw_text: text,
                    status: 'Active'
                });
            } else {
                // Low confidence: mark for review (can be a separate table or a flag)
                console.log(`Low confidence listing for ${this.tenantId}, marking for review.`);
            }
        } catch (error) {
            console.error(`Listing parser error for ${this.tenantId}:`, error);
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
}

    }

        this.tenantId = options.tenantId;
        this.onQR = options.onQR;
        this.onConnectionUpdate = options.onConnectionUpdate;
        this.sessionPath = path.join(__dirname, `../../sessions/${this.tenantId}`);
    }

    async connect() {
        const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        this.socket = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
        });

        this.socket.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.onQR(qr);
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                if (shouldReconnect) {
                    this.connect();
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

        this.socket.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            const remoteJid = msg.key.remoteJid || '';

            await this.saveMessage(remoteJid, messageText);
        });
    }

    private async updateSessionStatus(status: string) {
        await supabase
            .from('whatsapp_sessions')
            .upsert({ 
                tenant_id: this.tenantId, 
                status, 
                updated_at: new Date().toISOString() 
            }, { onConflict: 'tenant_id' });
    }

    private async saveMessage(remoteJid: string, text: string) {
        await supabase
            .from('messages')
            .insert({ 
                tenant_id: this.tenantId, 
                remote_jid: remoteJid, 
                message_text: text 
            });
    }

    async disconnect() {
        if (this.socket) {
            await this.socket.logout();
            // Clean up session folder
            if (fs.existsSync(this.sessionPath)) {
                fs.rmSync(this.sessionPath, { recursive: true, force: true });
            }
            this.updateSessionStatus('disconnected');
        }
    }
}
