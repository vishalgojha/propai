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

export async function getConversationHistory(phoneNumber: string, sessionId?: string): Promise<ConversationMessage[]> {
    const conversationKey = normalizeConversationKey(phoneNumber);
    if (!conversationKey) {
        return [];
    }

    let query = getConversationClient()
        .from('conversations')
        .select('role, content, created_at')
        .eq('phone_number', conversationKey)
        .order('created_at', { ascending: false })
        .limit(15);

    if (sessionId) {
        query = query.eq('session_id', sessionId);
    } else {
        query = query.is('session_id', null);
    }

    const { data, error } = await query;

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

export async function saveToHistory(phoneNumber: string, userMessage: string, assistantReply: string, sessionId?: string) {
    const conversationKey = normalizeConversationKey(phoneNumber);
    if (!conversationKey) {
        return;
    }

    const rowBase = { phone_number: conversationKey };
    if (sessionId) {
        (rowBase as any).session_id = sessionId;
    }

    const rows = [
        { ...rowBase, role: 'user' as const, content: userMessage },
        { ...rowBase, role: 'assistant' as const, content: assistantReply },
    ];

    const { error } = await getConversationClient()
        .from('conversations')
        .insert(rows);

    if (error) {
        console.error('[ConversationMemory] Failed to save history', error);
    }
}

export async function getConversationMessageCount(phoneNumber: string, sessionId?: string) {
    const conversationKey = normalizeConversationKey(phoneNumber);
    if (!conversationKey) {
        return 0;
    }

    let query = getConversationClient()
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('phone_number', conversationKey);

    if (sessionId) {
        query = query.eq('session_id', sessionId);
    } else {
        query = query.is('session_id', null);
    }

    const { count, error } = await query;

    if (error) {
        console.error('[ConversationMemory] Failed to count history', error);
        return 0;
    }

    return count || 0;
}

export async function clearConversationHistory(phoneNumber: string, sessionId?: string) {
    const conversationKey = normalizeConversationKey(phoneNumber);
    if (!conversationKey) {
        return;
    }

    let query = getConversationClient()
        .from('conversations')
        .delete()
        .eq('phone_number', conversationKey);

    if (sessionId) {
        query = query.eq('session_id', sessionId);
    } else {
        query = query.is('session_id', null);
    }

    const { error } = await query;

    if (error) {
        console.error('[ConversationMemory] Failed to clear history', error);
    }
}

export function normalizeConversationPhoneNumber(phoneNumber: string) {
    return normalizeConversationKey(phoneNumber);
}
