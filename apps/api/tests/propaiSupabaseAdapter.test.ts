import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PropAISupabaseAdapter } from '../src/whatsapp/PropAISupabaseAdapter';

const { insertMessages, insertRawDump } = vi.hoisted(() => ({
    insertMessages: vi.fn(),
    insertRawDump: vi.fn(),
}));

const { mockDb } = vi.hoisted(() => ({
    mockDb: {
        from: vi.fn((table: string) => {
            if (table === 'messages') {
                return {
                    insert: insertMessages,
                };
            }

            if (table === 'raw_dump') {
                return {
                    insert: insertRawDump,
                };
            }

            throw new Error(`Unexpected table: ${table}`);
        }),
    },
}));

const { ingestMessage, recordMessageMetrics, logEvent, aiChat } = vi.hoisted(() => ({
    ingestMessage: vi.fn(),
    recordMessageMetrics: vi.fn(),
    logEvent: vi.fn(),
    aiChat: vi.fn(),
}));

vi.mock('../src/config/supabase', () => ({
    supabase: mockDb,
    supabaseAdmin: mockDb,
}));

vi.mock('../src/services/channelService', () => ({
    channelService: {
        ingestMessage,
    },
}));

vi.mock('../src/services/whatsappHealthService', () => ({
    whatsappHealthService: {
        recordMessageMetrics,
    },
}));

vi.mock('../src/services/sessionEventService', () => ({
    sessionEventService: {
        log: logEvent,
    },
}));

vi.mock('../src/services/aiService', () => ({
    aiService: {
        chat: aiChat,
    },
}));

describe('PropAISupabaseAdapter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        insertMessages.mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: {
                        id: 'message-row-1',
                        remote_jid: '1203630@g.us',
                        sender: 'Broker A',
                        text: 'Good morning team',
                        timestamp: '2026-05-15T06:30:00.000Z',
                    },
                    error: null,
                }),
            }),
        });
        insertRawDump.mockResolvedValue({ error: null });
        aiChat.mockResolvedValue({
            text: JSON.stringify({
                has_price: false,
                is_requirement: false,
                should_parse: false,
                reason: 'no_price_detected',
            }),
        });
        ingestMessage.mockResolvedValue(null);
        recordMessageMetrics.mockResolvedValue(undefined);
        logEvent.mockResolvedValue(undefined);
    });

    it('persists inbound messages even when the stream parser gate rejects them', async () => {
        const adapter = new PropAISupabaseAdapter();

        const result = await adapter.saveInboundMessage({
            tenantId: 'tenant-1',
            label: 'main-phone',
            remoteJid: '1203630@g.us',
            text: 'Good morning team',
            sender: 'Broker A',
            timestamp: '2026-05-15T06:30:00.000Z',
            rawMessage: {},
        } as any);

        expect(mockDb.from).toHaveBeenCalledWith('messages');
        expect(insertMessages).toHaveBeenCalledWith(expect.objectContaining({
            tenant_id: 'tenant-1',
            remote_jid: '1203630@g.us',
            text: 'Good morning team',
            sender: 'Broker A',
        }));
        expect(mockDb.from).toHaveBeenCalledWith('raw_dump');
        expect(insertRawDump).toHaveBeenCalledWith(expect.objectContaining({
            gate_status: 'rejected',
            rejection_reason: 'no_price_detected',
        }));
        expect(ingestMessage).not.toHaveBeenCalled();
        expect(recordMessageMetrics).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-1',
            parsed: false,
        }));
        expect(result).toEqual({ id: 'message-row-1' });
    });
});
