import crypto from 'crypto';

export type ImpersonationSession = {
    token: string;
    partnerId: string;
    partnerEmail: string;
    partnerFullName: string | null;
    partnerRole: string;
    tenantId: string;
    adminId: string;
    adminEmail: string;
    createdAt: number;
    expiresAt: number;
};

const TTL_MS = 60 * 60 * 1000; // 1 hour
const store = new Map<string, ImpersonationSession>();

export function createImpersonationToken(params: Omit<ImpersonationSession, 'token' | 'createdAt' | 'expiresAt'>): string {
    const token = `imp_${crypto.randomUUID()}`;
    const now = Date.now();
    store.set(token, { ...params, token, createdAt: now, expiresAt: now + TTL_MS });
    return token;
}

export function resolveImpersonationToken(token: string): ImpersonationSession | null {
    const session = store.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
        store.delete(token);
        return null;
    }
    return session;
}

export function revokeImpersonationToken(token: string): void {
    store.delete(token);
}

export function listActiveImpersonations(): ImpersonationSession[] {
    const now = Date.now();
    const expired: string[] = [];
    const active: ImpersonationSession[] = [];
    store.forEach((session, token) => {
        if (session.expiresAt < now) {
            expired.push(token);
        } else {
            active.push(session);
        }
    });
    expired.forEach((token) => store.delete(token));
    return active;
}
