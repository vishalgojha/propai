import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin ?? supabase;

type PhoneProfileRow = {
    id: string;
    phone?: string | null;
    phone_verified?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
};

export type PhoneOwnershipSnapshot = {
    phone: string;
    matchingProfiles: PhoneProfileRow[];
    canonicalOwnerId: string | null;
    canonicalOwnerVerified: boolean;
    hasConflict: boolean;
};

export function normalizePhone(value?: string | null) {
    return String(value || '').split('').filter((c) => c >= '0' && c <= '9').join('');
}

function compareProfiles(left: PhoneProfileRow, right: PhoneProfileRow) {
    const leftVerified = Boolean(left.phone_verified);
    const rightVerified = Boolean(right.phone_verified);

    if (leftVerified !== rightVerified) {
        return leftVerified ? -1 : 1;
    }

    const leftCreated = new Date(String(left.created_at || left.updated_at || 0)).getTime();
    const rightCreated = new Date(String(right.created_at || right.updated_at || 0)).getTime();

    if (leftCreated !== rightCreated) {
        return leftCreated - rightCreated;
    }

    return String(left.id || '').localeCompare(String(right.id || ''));
}

export async function getPhoneOwnership(phone?: string | null): Promise<PhoneOwnershipSnapshot | null> {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return null;
    }

    const nationalNumber = normalizedPhone.slice(-10);
    const phoneVariants = [...new Set([
        normalizedPhone,
        nationalNumber,
        `+${normalizedPhone}`,
        `+${nationalNumber}`,
        normalizedPhone.length === 10 ? `91${normalizedPhone}` : '',
        normalizedPhone.length === 10 ? `+91${normalizedPhone}` : '',
    ].filter(Boolean))];

    const { data, error } = await db
        .from('profiles')
        .select('id, phone, phone_verified, created_at, updated_at')
        .or(phoneVariants.map((value) => `phone.eq.${value}`).join(','))
        .order('created_at', { ascending: true });

    if (error) {
        throw error;
    }

    const matchingProfiles = ((data || []) as PhoneProfileRow[])
        .filter((profile) => normalizePhone(profile.phone).slice(-10) === nationalNumber)
        .sort(compareProfiles);

    const canonicalOwner = matchingProfiles[0] || null;

    return {
        phone: normalizedPhone,
        matchingProfiles,
        canonicalOwnerId: canonicalOwner?.id || null,
        canonicalOwnerVerified: Boolean(canonicalOwner?.phone_verified),
        hasConflict: matchingProfiles.length > 1,
    };
}

export async function markPhoneVerifiedForUser(userId: string, phone?: string | null) {
    const normalizedPhone = normalizePhone(phone);
    if (!userId || !normalizedPhone) {
        return null;
    }

    const ownership = await getPhoneOwnership(normalizedPhone);
    if (!ownership) {
        return null;
    }

    const isCanonicalOwner = ownership.canonicalOwnerId === userId;

    const { data, error } = await db
        .from('profiles')
        .update({
            phone_verified: isCanonicalOwner,
            verification_token: null,
        })
        .eq('id', userId)
        .select('id, full_name, phone, email, phone_verified')
        .maybeSingle();

    if (error) {
        throw error;
    }

    return {
        profile: data || null,
        ownership: {
            ...ownership,
            canonicalOwnerId: ownership.canonicalOwnerId || userId,
            canonicalOwnerVerified: isCanonicalOwner || ownership.canonicalOwnerVerified,
            isCanonicalOwner,
        },
    };
}
