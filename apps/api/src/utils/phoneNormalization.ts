export function normalizeIndianPhoneNumber(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') {
        return null;
    }

    let digits = raw.replace(/\D/g, '');

    if (!digits) {
        return null;
    }

    if (digits.startsWith('0091') && digits.length === 14) {
        digits = digits.slice(4);
    } else if (digits.startsWith('91') && digits.length === 12) {
        digits = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
        digits = digits.slice(1);
    }

    if (digits.length !== 10) {
        return null;
    }

    if (!/^[6-9]\d{9}$/.test(digits)) {
        return null;
    }

    return digits;
}

export function toIndianWhatsAppNumber(raw: string | null | undefined): string | null {
    const normalized = normalizeIndianPhoneNumber(raw);
    return normalized ? `91${normalized}` : null;
}
