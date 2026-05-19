import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin ?? supabase;

type MessageStatusInput = {
    eventId: string;
    tenantId: string;
    sessionLabel?: string | null;
    messageId: string;
    chatId: string;
    state: 'sent' | 'server_ack' | 'delivered' | 'read' | 'played' | 'failed';
    timestamp: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    rawPayload?: Record<string, unknown> | null;
};

class WabroMessageStatusService {
    async record(input: MessageStatusInput) {
        try {
            const { error } = await db
                .from('wabro_message_status_events')
                .upsert({
                    event_id: input.eventId,
                    tenant_id: input.tenantId,
                    session_label: input.sessionLabel || null,
                    message_id: input.messageId,
                    chat_id: input.chatId,
                    state: input.state,
                    status_timestamp: input.timestamp,
                    error_code: input.errorCode || null,
                    error_message: input.errorMessage || null,
                    raw_payload: input.rawPayload || null,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'event_id' });

            if (error) {
                throw error;
            }
        } catch (error) {
            console.error('[WabroMessageStatusService] Failed to persist status event', error);
        }
    }
}

export const wabroMessageStatusService = new WabroMessageStatusService();
