/**
 * Normalise a WhatsApp JID or raw string to a valid Indian mobile number.
 * Returns 12-digit string (91XXXXXXXXXX) or null if invalid.
 */
export function normaliseIndianPhone(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }

    const stripped = String(raw).split('@')[0].replace(/\D/g, '');

    if (/^91[6-9]\d{9}$/.test(stripped)) {
        return stripped;
    }

    if (/^[6-9]\d{9}$/.test(stripped)) {
        return `91${stripped}`;
    }

    console.warn(`[phone] Discarded invalid number: ${raw} → stripped: ${stripped}`);
    return null;
}
