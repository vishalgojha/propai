export function normalizePhoneFromJid(value?: string | null) {
    const jid = String(value || '').trim().toLowerCase();
    if (!jid) return '';

    const localPart = jid.split('@')[0] || '';
    const deviceSeparatorIndex = localPart.indexOf(':');
    const phoneCandidate = deviceSeparatorIndex >= 0 ? localPart.slice(0, deviceSeparatorIndex) : localPart;
    const digits = phoneCandidate.replace(/\D/g, '');

    if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
    if (/^[6-9]\d{9}$/.test(digits)) return digits;
    if (jid.endsWith('@lid') && digits.length >= 10) return digits;

    return '';
}
