export type ProcessRole = 'all' | 'api' | 'whatsapp';

export function resolveProcessRole(value?: string | null): ProcessRole {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'api') {
        return 'api';
    }

    if (normalized === 'whatsapp' || normalized === 'worker' || normalized === 'ingestion') {
        return 'whatsapp';
    }

    return 'all';
}

export function shouldRunApiSurface(role: ProcessRole) {
    return role === 'all' || role === 'api';
}

export function shouldRunWhatsAppRuntime(role: ProcessRole) {
    return role === 'all' || role === 'whatsapp';
}

