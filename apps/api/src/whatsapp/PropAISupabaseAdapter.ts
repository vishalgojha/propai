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
        const { error } = await db
            .from('whatsapp_sessions')
            .upsert({
                session_id: sessionId,
                tenant_id: persistedTenantId,
                label: input.label,
                owner_name: input.ownerName ?? null,
                session_data: {
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
            const gateResult = await this.runPriceGate(input.text);

            if (!gateResult.shouldParse) {
                await whatsappHealthService.recordMessageMetrics({
                    tenantId: input.tenantId,
                    sessionLabel: input.label,
                    remoteJid: input.remoteJid,
                    parsed: false,
                    timestamp: input.timestamp,
                });
                return { id: rawDumpId };
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
                    gate_status: 'passed',
                    rejection_reason: null,
                });

            if (rawDumpError) {
                console.error('[PropAISupabaseAdapter] Failed to insert into raw_dump', rawDumpError);
            }

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

            const messageRecord = data || {
                id: rawDumpId,
                remote_jid: input.remoteJid,
                sender: input.sender ?? undefined,
                text: input.text,
                timestamp: input.timestamp ?? new Date().toISOString(),
            };

            if (error) {
                console.warn('[PropAISupabaseAdapter] Failed to persist inbound message row, falling back to direct stream ingest.', error);
            }

            const streamItem = await channelService.ingestMessage(input.tenantId, messageRecord);
            await whatsappHealthService.recordMessageMetrics({
                tenantId: input.tenantId,
                sessionLabel: input.label,
                remoteJid: input.remoteJid,
                parsed: Boolean(streamItem),
                timestamp: input.timestamp,
            });

            return { id: String(messageRecord.id) };
        } catch (error) {
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
        ];

        return cues.some((cue) => normalized.includes(cue));
    }

    private async runPriceGate(text: string): Promise<PriceGateResult> {
        if (this.looksLikeRequirement(text)) {
            return {
                hasPrice: false,
                isRequirement: true,
                shouldParse: true,
                reason: 'requirement_message',
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
                'Google',
                undefined,
                undefined,
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
            console.error('[PropAISupabaseAdapter] Price gate AI call failed, defaulting to closed', error);
            return {
                hasPrice: false,
                isRequirement: false,
                shouldParse: false,
                reason: 'gate_failed_closed',
            };
        }
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
