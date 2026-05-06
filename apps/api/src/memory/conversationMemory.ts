import { supabase, supabaseAdmin } from '../config/supabase';

type ConversationRole = 'user' | 'assistant';

export type ConversationMessage = {
    role: ConversationRole;
    content: string;
};

function normalizeConversationKey(phoneNumber: string) {
    const raw = String(phoneNumber || '').trim();
    if (!raw) {
        return '';
    }

    const identifier = raw.split('@')[0].trim();
    const digitsOnly = identifier.split('').filter(c => c >= '0' && c <= '9').join('');
    return digitsOnly || identifier.toLowerCase();
}

function getConversationClient() {
    return supabaseAdmin ?? supabase;
}

export async function getConversationHistory(phoneNumber: string): Promise<ConversationMessage[]> {
    const conversationKey = normalizeConversationKey(phoneNumber);
    if (!conversationKey) {
        return [];
    }

    const { data, error } = await getConversationClient()
        .from('conversations')
        .select('role, content, created_at')
        .eq('phone_number', conversationKey)
        .order('created_at', { ascending: false })
        .limit(15);

    if (error) {
        console.error('[ConversationMemory] Failed to fetch history', error);
        return [];
    }

    return (data || [])
        .slice()
        .reverse()
        .map((row: any) => ({
            role: row.role,
            content: row.content,
        }));
}

export async function saveToHistory(phoneNumber: string, userMessage: string, assistantReply: string) {
    const conversationKey = normalizeConversationKey(phoneNumber);
    if (!conversationKey) {
        return;
    }

    const rows = [
        { phone_number: conversationKey, role: 'user' as const, content: userMessage },
        { phone_number: conversationKey, role: 'assistant' as const, content: assistantReply },
    ];

    const { error } = await getConversationClient()
        .from('conversations')
        .insert(rows);

    if (error) {
        console.error('[ConversationMemory] Failed to save history', error);
    }
}

export async function getConversationMessageCount(phoneNumber: string) {
    const conversationKey = normalizeConversationKey(phoneNumber);
    if (!conversationKey) {
        return 0;
    }

    const { count, error } = await getConversationClient()
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('phone_number', conversationKey);

    if (error) {
        console.error('[ConversationMemory] Failed to count history', error);
        return 0;
    }

    return count || 0;
}

export function normalizeConversationPhoneNumber(phoneNumber: string) {
    return normalizeConversationKey(phoneNumber);
}
