type LiveMonitorDirection = 'inbound' | 'outbound';

type LiveMonitorMessage = {
    id: string;
    tenantId: string;
    sessionLabel?: string | null;
    remoteJid: string;
    sender?: string | null;
    text: string;
    timestamp: string;
    direction: LiveMonitorDirection;
};

type LiveMonitorGroup = {
    id: string;
    name: string;
    participantsCount?: number;
};

type LiveMonitorChatState = {
    title?: string;
    participantsCount?: number;
    messages: LiveMonitorMessage[];
};

const MAX_MESSAGES_PER_CHAT = 250;
const MAX_CHATS_PER_SESSION = 400;

function buildSessionKey(tenantId: string, sessionLabel?: string | null) {
    return `${tenantId}:${String(sessionLabel || 'default')}`;
}

function normalizePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits : null;
}

function buildFallbackTitle(remoteJid: string, sender?: string | null) {
    if (remoteJid.endsWith('@g.us')) {
        return 'WhatsApp group';
    }

    const normalizedSender = String(sender || '').trim();
    if (normalizedSender && !normalizedSender.includes('@')) {
        return normalizedSender;
    }

    const phone = normalizePhone(remoteJid.split('@')[0]);
    return phone ? `+${phone}` : 'Direct contact';
}

class LiveMonitorService {
    private readonly sessions = new Map<string, Map<string, LiveMonitorChatState>>();

    private getSessionMaps(tenantId: string, sessionLabel?: string | null) {
        if (sessionLabel) {
            const scoped = this.sessions.get(buildSessionKey(tenantId, sessionLabel));
            return scoped ? [scoped] : [];
        }

        return Array.from(this.sessions.entries())
            .filter(([key]) => key.startsWith(`${tenantId}:`))
            .map(([, chats]) => chats);
    }

    recordMessage(input: {
        tenantId: string;
        sessionLabel?: string | null;
        remoteJid: string;
        sender?: string | null;
        text?: string | null;
        timestamp?: string | null;
        direction: LiveMonitorDirection;
        title?: string | null;
    }) {
        const remoteJid = String(input.remoteJid || '').trim();
        const text = String(input.text || '').trim();
        if (!input.tenantId || !remoteJid || !text) {
            return;
        }

        const sessionKey = buildSessionKey(input.tenantId, input.sessionLabel);
        const chats = this.sessions.get(sessionKey) || new Map<string, LiveMonitorChatState>();
        const existing = chats.get(remoteJid) || { messages: [] };
        const message: LiveMonitorMessage = {
            id: `${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
            tenantId: input.tenantId,
            sessionLabel: input.sessionLabel || null,
            remoteJid,
            sender: input.sender || null,
            text,
            timestamp: input.timestamp || new Date().toISOString(),
            direction: input.direction,
        };

        existing.title = String(input.title || existing.title || buildFallbackTitle(remoteJid, input.sender)).trim();
        existing.messages.push(message);
        if (existing.messages.length > MAX_MESSAGES_PER_CHAT) {
            existing.messages.splice(0, existing.messages.length - MAX_MESSAGES_PER_CHAT);
        }

        chats.set(remoteJid, existing);
        while (chats.size > MAX_CHATS_PER_SESSION) {
            const oldestKey = chats.keys().next().value;
            if (!oldestKey) break;
            chats.delete(oldestKey);
        }

        this.sessions.set(sessionKey, chats);
    }

    syncGroups(input: { tenantId: string; sessionLabel?: string | null; groups: LiveMonitorGroup[] }) {
        const sessionKey = buildSessionKey(input.tenantId, input.sessionLabel);
        const chats = this.sessions.get(sessionKey) || new Map<string, LiveMonitorChatState>();

        for (const group of input.groups || []) {
            const groupId = String(group.id || '').trim();
            if (!groupId) continue;

            const existing = chats.get(groupId) || { messages: [] };
            existing.title = String(group.name || existing.title || 'WhatsApp group').trim();
            existing.participantsCount = typeof group.participantsCount === 'number'
                ? group.participantsCount
                : existing.participantsCount;
            chats.set(groupId, existing);
        }

        this.sessions.set(sessionKey, chats);
    }

    getSessionRows(tenantId: string, sessionLabel?: string | null) {
        const chatMaps = this.getSessionMaps(tenantId, sessionLabel);
        if (chatMaps.length === 0) {
            return [];
        }

        return chatMaps
            .flatMap((chats) => Array.from(chats.entries()).flatMap(([remoteJid, state]) =>
                state.messages.map((message) => ({
                    id: message.id,
                    remote_jid: remoteJid,
                    sender: message.sender || null,
                    text: message.text,
                    timestamp: message.timestamp,
                    direction: message.direction,
                    title: state.title || null,
                    participantsCount: state.participantsCount,
                })),
            ))
            .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());
    }

    getChatRows(tenantId: string, chatId: string, sessionLabel?: string | null, before?: string | null, limit?: number) {
        const beforeTime = before ? new Date(before).getTime() : null;
        const rows = this.getSessionMaps(tenantId, sessionLabel)
            .map((chats) => chats.get(chatId))
            .filter((state): state is LiveMonitorChatState => Boolean(state))
            .flatMap((state) => state.messages)
            .filter((message) => beforeTime === null || new Date(message.timestamp || 0).getTime() < beforeTime)
            .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());

        return typeof limit === 'number' ? rows.slice(0, limit) : rows;
    }

    getChatMeta(tenantId: string, remoteJid: string, sessionLabel?: string | null) {
        for (const chats of this.getSessionMaps(tenantId, sessionLabel)) {
            const state = chats.get(remoteJid);
            if (state) {
                return state;
            }
        }

        return null;
    }
}

export const liveMonitorService = new LiveMonitorService();
