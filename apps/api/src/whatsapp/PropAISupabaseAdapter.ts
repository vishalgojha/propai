import crypto from 'crypto';

const extractPhoneFromJid = (jid: string | null): string | null => {
    if (!jid) return null;
    const digits = jid.split('@')[0].split('').filter(c => c >= '0' && c <= '9').join('');
    return digits.length >= 10 ? digits.slice(-10) : null;
};

import type {
    IncomingMessageRecord,
    SessionRecord,
    SessionStatusUpdate,
    WhatsAppStorageAdapter,
} from '@vishalgojha/whatsapp-baileys-runtime';
import { supabase, supabaseAdmin } from '../config/supabase';
import { channelService } from '../services/channelService';
import { whatsappHealthService } from '../services/whatsappHealthService';
import { sessionEventService } from '../services/sessionEventService';
import { whatsappMirrorService } from '../services/whatsappMirrorService';

const db = supabaseAdmin ?? supabase;

type PriceGateResult = {
    hasPrice: boolean;
    isRequirement: boolean;
    shouldParse: boolean;
    reason: string;
};

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
        const rawMessage = (input.rawMessage || {}) as any;
        const rawDumpId = crypto.randomUUID();

        try {
            const gateResult = await this.runPriceGate(input.text, input.tenantId);

            const { data, error } = await db
                .from('messages')
                .insert({
                    tenant_id: input.tenantId,
                    remote_jid: input.remoteJid,
                    text: input.text,
                    sender: input.sender ?? undefined,
                    timestamp: input.timestamp ?? new Date().toISOString(),
                })
                .select('id, remote_jid, sender, text, timestamp')
                .single();

            const senderJid = (rawMessage?.key?.participant as string | undefined) || input.sender || null;
            const messageRecord = data || {
                id: rawDumpId,
                remote_jid: input.remoteJid,
                sender: input.sender ?? undefined,
                sender_jid: senderJid,
                sender_phone: extractPhoneFromJid(senderJid),
                text: input.text,
                timestamp: input.timestamp ?? new Date().toISOString(),
            };

            await whatsappMirrorService.persistMessage({
                tenantId: input.tenantId,
                sessionLabel: input.label,
                remoteJid: input.remoteJid,
                senderJid: (rawMessage?.key?.participant as string | undefined) || input.sender || null,
                senderName: input.sender ?? null,
                text: input.text,
                timestamp: input.timestamp ?? new Date().toISOString(),
                direction: input.fromMe ? 'outbound' : 'inbound',
                messageKey: typeof rawMessage?.key?.id === 'string' ? rawMessage.key.id : null,
                rawPayload: rawMessage,
            }).catch((mirrorError) => {
                console.error('[PropAISupabaseAdapter] Failed to persist mirror message', mirrorError);
            });

            if (error) {
                console.warn('[PropAISupabaseAdapter] Failed to persist inbound message row, continuing with direct handling.', error);
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
                    received_at: input.timestamp ?? new Date().toISOString(),
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
                await whatsappHealthService.recordMessageMetrics({
                    tenantId: input.tenantId,
                    sessionLabel: input.label,
                    remoteJid: input.remoteJid,
                    parsed: false,
                    timestamp: input.timestamp,
                });
                return { id: String(messageRecord.id || rawDumpId) };
            }

            const streamItem = await channelService.ingestMessage(input.tenantId, messageRecord);
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
            await whatsappHealthService.recordMessageMetrics({
                tenantId: input.tenantId,
                sessionLabel: input.label,
                remoteJid: input.remoteJid,
                parsed: Boolean(streamItem),
                timestamp: input.timestamp,
            });

            return { id: String(messageRecord.id) };
        } catch (error) {
            void sessionEventService.log(input.tenantId, 'parse_failed', {
                remoteJid: input.remoteJid,
                label: input.label,
                reason: error instanceof Error ? error.message.slice(0, 100) : 'unknown_error',
            });
            await whatsappHealthService.recordMessageMetrics({
                tenantId: input.tenantId,
                sessionLabel: input.label,
                remoteJid: input.remoteJid,
                parsed: false,
                failed: true,
                timestamp: input.timestamp,
            });
            throw error;
        }
    }

    private looksLikeRequirement(text: string) {
        const normalized = String(text || '').toLowerCase();
        const cues = [
            'requirement',
            'required',
            'looking for',
            'need ',
            'needed',
            'wanted',
            'client wants',
            'buyer wants',
            'tenant wants',
            'requirement:',
            'requirements:',
        ];

        return cues.some((cue) => normalized.includes(cue));
    }

    private hasPriceHeuristic(text: string): boolean {
        const lower = String(text || '').toLowerCase();
        const pricePatterns = [
            /(?:rs\.?\s*|inr\s*|₹\s*)?\d{4,}/i,
            /(?:rent|rental|lease|price|budget|cost|rate|value|worth|amount|paying|monthly|per\s*month|pm\s*[./])/i,
            /(?:crore?|cr\.?|lakh?|lac\.?|k\b| thousand| lpa| lac per)/i,
            /[6-9]\d{3,}\s*(?:crore?|cr\.?|lakh?|lac\.?|k\b)/i,
        ];
        return pricePatterns.some((p) => p.test(lower));
    }

    private async runPriceGate(text: string, tenantId?: string): Promise<PriceGateResult> {
        if (this.looksLikeRequirement(text)) {
            return {
                hasPrice: false,
                isRequirement: true,
                shouldParse: true,
                reason: 'requirement_message',
            };
        }

        const hasPrice = this.hasPriceHeuristic(text);
        return {
            hasPrice,
            isRequirement: false,
            shouldParse: true,
            reason: hasPrice ? 'priced_listing' : 'no_price_detected',
        };
    }

    async loadPersistedSessions(): Promise<SessionRecord[]> {
        const { data, error } = await db
            .from('whatsapp_sessions')
            .select('tenant_id, label, owner_name, session_data, status')
            .in('status', ['connecting', 'connected'])
            .order('last_sync', { ascending: false });

        if (error) {
            throw error;
        }

        return (data || [])
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

        const { error } = await db
            .from('whatsapp_sessions')
            .update({
                status: 'disconnected',
                creds: null,
                keys: null,
                updated_at: new Date().toISOString(),
                last_sync: new Date().toISOString(),
            })
            .eq('session_id', sessionId);

        if (error) {
            throw error;
        }
    }
}
