import crypto from 'crypto';

export type AuditAction =
    | 'subscription_update'
    | 'subscription_cancel'
    | 'trial_extended'
    | 'impersonation_created'
    | 'impersonation_revoked'
    | 'group_updated'
    | 'system_session_restart';

export type AuditEvent = {
    id: string;
    action: AuditAction;
    adminId: string;
    adminEmail: string;
    targetId?: string;
    targetEmail?: string;
    payload: Record<string, unknown>;
    timestamp: number;
};

const MAX_EVENTS = 500;
const log: AuditEvent[] = [];

export function recordAuditEvent(params: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
    const event: AuditEvent = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...params,
    };

    log.unshift(event);

    if (log.length > MAX_EVENTS) {
        log.splice(MAX_EVENTS);
    }

    return event;
}

export function getAuditLog(limit = 100): AuditEvent[] {
    return log.slice(0, Math.min(limit, MAX_EVENTS));
}
