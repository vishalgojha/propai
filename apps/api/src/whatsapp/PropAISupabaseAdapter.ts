import crypto from 'crypto';
import type {
    IncomingMessageRecord,
    SessionRecord,
    SessionStatusUpdate,
    WhatsAppStorageAdapter,
} from '@vishalgojha/whatsapp-baileys-runtime';
import { supabase, supabaseAdmin } from '../config/supabase';
import { channelService } from '../services/channelService';
import { aiService } from '../services/aiService';
import { whatsappHealthService } from '../services/whatsappHealthService';
import { sessionEventService } from '../services/sessionEventService';
import { whatsappThreadService } from '../services/whatsappThreadService';
import { classifyBrokerMessage } from '../utils/brokerMessageClassifier';

const db = supabaseAdmin ?? supabase;

type PriceGateResult = {
    hasPrice: boolean;
    isRequirement: boolean;
    shouldParse: boolean;
    reason: string;
};

function isLikelyRealEstateDirectMessage(text: string) {
    const lower = String(text || '').trim().toLowerCase();
    if (!lower) {
        return false;
    }

    const keywords = [
        'bhk', 'flat', 'rent', 'rental', 'sale', 'resale', 'lease', 'buy', 'sell',
        'property', 'properties', 'listing', 'requirement', 'client', 'budget', 'deposit',
        'office', 'shop', 'warehouse', 'commercial', 'residential', 'broker', 'builder',
        'carpet', 'sqft', 'sq ft', 'area', 'possession', 'furnished', 'parking', 'society',
    ];

    return keywords.some((keyword) => lower.includes(keyword));
}

export class PropAISupabaseAdapter implements WhatsAppStorageAdapter {
    async saveSessionStatus(input: SessionStatusUpdate): Promise<void> {
        const sessionId = `${input.tenantId}:${input.label}`;
        const persistedTenantId = input.tenantId === 'system' ? null : input.tenantId;
        const sessionStatus = input as SessionStatusUpdate & { lidJid?: string | null };

        const { data: existing } = await db
            .from('whatsapp_sessions')
            .select('session_data')
            .eq('session_id', sessionId)
            .maybeSingle();

        const existingData = (existing?.session_data && typeof existing.session_data === 'object')
            ? existing.session_data as Record<string, unknown>
            : {};

        const { error } = await db
            .from('whatsapp_sessions')
            .upsert({
                session_id: sessionId,
                tenant_id: persistedTenantId,
                label: input.label,
                owner_name: input.ownerName ?? null,
                session_data: {
                    ...existingData,
                    phoneNumber: input.phoneNumber ?? null,
                    ownerName: input.ownerName ?? null,
                    label: input.label,
                    lidJid: sessionStatus.lidJid ?? null,
                },
                status: input.status,
                last_sync: input.lastSync ?? new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'session_id' });

        if (error) {
            throw error;
        }
    }

    async saveInboundMessage(input: IncomingMessageRecord): Promise<{ id?: string } | void> {
        return this.persistMessage(input, { runGate: true, ingestStream: true, recordMetrics: true });
    }

    async saveHistoryMessage(input: IncomingMessageRecord): Promise<{ id?: string } | void> {
        return this.persistMessage(input, { runGate: false, ingestStream: false, recordMetrics: false });
    }

    private async persistMessage(
        input: IncomingMessageRecord,
        options: {
            runGate: boolean;
            ingestStream: boolean;
            recordMetrics: boolean;
        },
    ): Promise<{ id?: string } | void> {
        const rawMessage = (input.rawMessage || {}) as any;
        const rawDumpId = crypto.randomUUID();

        try {
            const gateResult = options.runGate
                ? await this.runPriceGate(input.text, input.tenantId)
                : {
                    hasPrice: false,
                    isRequirement: false,
                    shouldParse: true,
                    reason: 'history_sync',
                };
            const timestamp = input.timestamp ?? new Date().toISOString();
            const { data: existingMessage } = await db
                .from('messages')
                .select('id, session_label, remote_jid, sender, text, timestamp')
                .eq('tenant_id', input.tenantId)
                .eq('remote_jid', input.remoteJid)
                .eq('text', input.text)
                .eq('timestamp', timestamp)
                .maybeSingle();

            let messageRecord = existingMessage || null;
            if (!messageRecord) {
                const { data, error } = await db
                    .from('messages')
                    .insert({
                        tenant_id: input.tenantId,
                        session_label: input.label || 'workspace',
                        remote_jid: input.remoteJid,
                        text: input.text,
                        sender: input.sender ?? undefined,
                        timestamp,
                    })
                    .select('id, session_label, remote_jid, sender, text, timestamp')
                    .single();

                messageRecord = data || {
                    id: rawDumpId,
                    session_label: input.label || 'workspace',
                    remote_jid: input.remoteJid,
                    sender: input.sender ?? undefined,
                    text: input.text,
                    timestamp,
                };

                if (error) {
                    console.warn('[PropAISupabaseAdapter] Failed to persist inbound message row, continuing with direct handling.', error);
                }
            }

            if (existingMessage) {
                return { id: String(existingMessage.id || rawDumpId) };
            }

            const isDirectChat = !String(input.remoteJid || '').endsWith('@g.us');
            if (!isDirectChat || isLikelyRealEstateDirectMessage(input.text)) {
                await whatsappThreadService.upsertFromMessage({
                    tenantId: input.tenantId,
                    sessionLabel: input.label,
                    remoteJid: input.remoteJid,
                    sender: input.sender ?? undefined,
                    text: input.text,
                    timestamp,
                });
            }

            const { error: rawDumpError } = await db
                .from('raw_dump')
                .insert({
                    id: rawDumpId,
                    workspace_id: input.tenantId,
                    session_id: input.label,
                    group_jid: input.remoteJid,
                    sender_jid: input.sender ?? null,
                    raw_text: input.text,
                    received_at: timestamp,
                    gate_status: gateResult.shouldParse ? 'passed' : 'rejected',
                    rejection_reason: gateResult.shouldParse ? null : gateResult.reason || 'price_gate_rejected',
                });

            if (rawDumpError) {
                console.error('[PropAISupabaseAdapter] Failed to insert into raw_dump', rawDumpError);
            }

            if (!gateResult.shouldParse) {
                void sessionEventService.log(input.tenantId, 'parse_failed', {
                    remoteJid: input.remoteJid,
                    label: input.label,
                    reason: gateResult.reason || 'price_gate_rejected',
                });
                if (options.recordMetrics) {
                    await whatsappHealthService.recordMessageMetrics({
                        tenantId: input.tenantId,
                        sessionLabel: input.label,
                        remoteJid: input.remoteJid,
                        parsed: false,
                        countReceived: false,
                        timestamp: input.timestamp,
                    });
                }
                return { id: String(messageRecord.id || rawDumpId) };
            }

            let streamItem: unknown = null;
            if (options.ingestStream) {
                streamItem = await channelService.ingestMessage(input.tenantId, messageRecord);
                if (streamItem) {
                    void sessionEventService.log(input.tenantId, 'parse_success', {
                        remoteJid: input.remoteJid,
                        label: input.label,
                        streamItemId: typeof streamItem === 'object' && 'id' in streamItem ? (streamItem as any).id : undefined,
                    });
                } else {
                    void sessionEventService.log(input.tenantId, 'parse_failed', {
                        remoteJid: input.remoteJid,
                        label: input.label,
                        reason: 'ingest_returned_null',
                    });
                }
            }
            if (options.recordMetrics) {
                await whatsappHealthService.recordMessageMetrics({
                    tenantId: input.tenantId,
                    sessionLabel: input.label,
                    remoteJid: input.remoteJid,
                    parsed: options.ingestStream ? Boolean(streamItem) : true,
                    countReceived: false,
                    timestamp: input.timestamp,
                });
            }

            return { id: String(messageRecord.id) };
        } catch (error) {
            void sessionEventService.log(input.tenantId, 'parse_failed', {
                remoteJid: input.remoteJid,
                label: input.label,
                reason: error instanceof Error ? error.message.slice(0, 100) : 'unknown_error',
            });
            if (options.recordMetrics) {
                await whatsappHealthService.recordMessageMetrics({
                    tenantId: input.tenantId,
                    sessionLabel: input.label,
                    remoteJid: input.remoteJid,
                    parsed: false,
                    failed: true,
                    countReceived: false,
                    timestamp: input.timestamp,
                });
            }
            throw error;
        }
    }

    private looksLikeRequirement(text: string) {
        return classifyBrokerMessage(text).intent === 'requirement';
    }

    private async runPriceGate(text: string, tenantId?: string): Promise<PriceGateResult> {
        const classified = classifyBrokerMessage(text);

        if (classified.intent === 'ignore') {
            return {
                hasPrice: false,
                isRequirement: false,
                shouldParse: false,
                reason: classified.reasons[0] || 'ignored_message',
            };
        }

        if (classified.intent === 'requirement') {
            return {
                hasPrice: classified.hasPrice,
                isRequirement: true,
                shouldParse: true,
                reason: 'requirement_message',
            };
        }

        if (classified.intent === 'listing' || (classified.intent === 'unknown' && !classified.shouldParse && !classified.hasPrice && classified.confidence !== 'low')) {
            return {
                hasPrice: classified.hasPrice,
                isRequirement: false,
                shouldParse: classified.shouldParse,
                reason: classified.hasPrice ? 'priced_listing' : (classified.reasons[0] || 'no_price_detected'),
            };
        }

        try {
            const response = await aiService.chat(
                `Check this real-estate WhatsApp message and return JSON only.

Return:
{
  "has_price": boolean,
  "is_requirement": boolean,
  "should_parse": boolean,
  "reason": "priced_listing" | "requirement_message" | "no_price_detected"
}

Rules:
- A buyer requirement can still be parsed even if it does not include a price.
- A property listing must have an explicit price, rent, budget, or amount to be parsed.
- If it is a listing and no clear price is present, set should_parse to false.

Message:
"""
${text}
"""`,
                'Auto',
                undefined,
                tenantId,
                'You are a price gate for real-estate WhatsApp messages. Return ONLY valid JSON.'
            );
            const result = JSON.parse(response.text.trim());
            const hasPrice = Boolean(result?.has_price);
            const isRequirement = Boolean(result?.is_requirement);
            return {
                hasPrice,
                isRequirement,
                shouldParse: Boolean(result?.should_parse ?? (hasPrice || isRequirement)),
                reason: String(result?.reason || (hasPrice ? 'priced_listing' : isRequirement ? 'requirement_message' : 'no_price_detected')),
            };
        } catch (error) {
            console.error('[PropAISupabaseAdapter] Price gate AI call failed, defaulting to open (parse allowed)', error);
            return {
                hasPrice: false,
                isRequirement: false,
                shouldParse: true,
                reason: 'gate_failed_open',
            };
        }
    }

    async loadPersistedSessions(): Promise<SessionRecord[]> {
        const { data, error } = await db
            .from('whatsapp_sessions')
            .select('tenant_id, label, owner_name, session_data, status, creds, keys')
            .order('last_sync', { ascending: false });

        if (error) {
            throw error;
        }

        return (data || [])
            .filter((session: any) => {
                if (!session?.tenant_id || session.tenant_id === 'system') {
                    return false;
                }

                if (session.status === 'connected' || session.status === 'connecting') {
                    return true;
                }

                return Boolean(session.creds && session.keys);
            })
            .filter((session: any) => session?.tenant_id && session.tenant_id !== 'system')
            .map((session: any) => ({
                tenantId: session.tenant_id,
                label: session.label,
                ownerName: session.owner_name || session.session_data?.ownerName || null,
                phoneNumber: session.session_data?.phoneNumber || null,
                status: session.status,
            }));
    }

    async deleteSession(input: { tenantId: string; label: string }): Promise<void> {
        const sessionId = `${input.tenantId}:${input.label}`;
        const { data: existing } = await db
            .from('whatsapp_sessions')
            .select('session_data')
            .eq('session_id', sessionId)
            .maybeSingle();
        const existingData = (existing?.session_data && typeof existing.session_data === 'object')
            ? existing.session_data as Record<string, unknown>
            : {};

        const { error } = await db
            .from('whatsapp_sessions')
            .update({
                status: 'disconnected',
                creds: null,
                keys: null,
                session_data: {
                    ...existingData,
                    pendingConnect: null,
                    connectionArtifact: null,
                    connectionArtifactUpdatedAt: null,
                    qr: null,
                    qrUpdatedAt: null,
                    disconnectReason: null,
                    autoReconnectBlocked: false,
                    autoReconnectBlockedAt: null,
                },
                updated_at: new Date().toISOString(),
                last_sync: new Date().toISOString(),
            })
            .eq('session_id', sessionId);

        if (error) {
            throw error;
        }
    }
}
