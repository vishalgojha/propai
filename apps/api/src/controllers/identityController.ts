import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { pushRecentAction } from '../services/identityService';
import { emailNotificationService } from '../services/emailNotificationService';

const db = supabaseAdmin ?? supabase;

type LinkedBrokerActivity = {
    phone: string;
    user_id?: string | null;
    name?: string | null;
    agency?: string | null;
    localities?: Array<{ locality: string; count: number; last_seen: string }>;
    listing_count?: number;
    requirement_count?: number;
    total_messages?: number;
    last_active?: string | null;
};

const normalizePhone = (value: unknown): string | null => {
    const digits = String(value || '').replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? digits : null;
};

const mergeOnboardingLocalities = (
    existing: unknown,
    onboardingLocalities: unknown,
    now: string,
): Array<{ locality: string; count: number; last_seen: string }> => {
    const merged = new Map<string, { locality: string; count: number; last_seen: string }>();

    if (Array.isArray(existing)) {
        for (const entry of existing) {
            const locality = typeof entry?.locality === 'string' ? entry.locality.trim() : '';
            if (!locality) continue;
            merged.set(locality.toLowerCase(), {
                locality,
                count: typeof entry?.count === 'number' ? entry.count : 0,
                last_seen: typeof entry?.last_seen === 'string' && entry.last_seen ? entry.last_seen : now,
            });
        }
    }

    if (Array.isArray(onboardingLocalities)) {
        for (const entry of onboardingLocalities) {
            const locality = String(entry || '').trim();
            if (!locality) continue;
            const key = locality.toLowerCase();
            const current = merged.get(key);
            if (current) {
                merged.set(key, { ...current, locality });
                continue;
            }
            merged.set(key, { locality, count: 0, last_seen: now });
        }
    }

    return Array.from(merged.values());
};

async function syncBrokerActivityProfile(params: {
    tenantId: string;
    onboarding: Record<string, unknown>;
    profile: { full_name?: string | null; phone?: string | null } | null;
}) {
    const { tenantId, onboarding, profile } = params;
    const phone = normalizePhone(onboarding.mobile || onboarding.phone || profile?.phone);
    if (!phone) return;

    const now = new Date().toISOString();
    const { data: existing, error: existingError } = await db
        .from('broker_activity')
        .select('phone, name, agency, localities, first_seen, listing_count, requirement_count, total_messages, monthly_activity, groups, avg_price_listing, avg_price_requirement')
        .eq('phone', phone)
        .maybeSingle();

    if (existingError) {
        console.error('[Onboarding] Failed to load broker activity', existingError);
        return;
    }

    const fullName = String(onboarding.full_name || profile?.full_name || existing?.name || '').trim() || null;
    const agency = String(onboarding.agency_name || existing?.agency || '').trim() || null;
    const localities = mergeOnboardingLocalities(existing?.localities, onboarding.localities, now);

    const payload: Record<string, unknown> = {
        phone,
        user_id: tenantId,
        name: fullName,
        agency,
        localities,
        updated_at: now,
    };

    if (!existing?.first_seen) {
        payload.first_seen = now;
    }

    const { error } = await db
        .from('broker_activity')
        .upsert(payload, { onConflict: 'phone' });

    if (error) {
        console.error('[Onboarding] Failed to sync broker activity', error);
    }
}

async function getLinkedBrokerActivity(tenantId: string): Promise<LinkedBrokerActivity | null> {
    const byUserResult = await db
        .from('broker_activity')
        .select('phone, user_id, name, agency, localities, listing_count, requirement_count, total_messages, last_active')
        .eq('user_id', tenantId)
        .maybeSingle();

    if (byUserResult.error) {
        console.error('[Identity] Failed to load linked broker activity by user', byUserResult.error);
        return null;
    }

    if (byUserResult.data) {
        return byUserResult.data as LinkedBrokerActivity;
    }

    const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('phone')
        .eq('id', tenantId)
        .maybeSingle();

    if (profileError) {
        console.error('[Identity] Failed to load profile phone', profileError);
        return null;
    }

    const phone = normalizePhone(profile?.phone);
    if (!phone) return null;

    const byPhoneResult = await db
        .from('broker_activity')
        .select('phone, user_id, name, agency, localities, listing_count, requirement_count, total_messages, last_active')
        .eq('phone', phone)
        .maybeSingle();

    if (byPhoneResult.error) {
        console.error('[Identity] Failed to load linked broker activity by phone', byPhoneResult.error);
        return null;
    }

    return (byPhoneResult.data as LinkedBrokerActivity | null) || null;
}

export const getOnboarding = async (req: Request, res: Response) => {
    const tenantId = req.user?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await db
        .from('broker_identity')
        .select('*')
        .eq('broker_id', tenantId)
        .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    const brokerActivity = await getLinkedBrokerActivity(tenantId);

    res.json({ data: data || null, brokerActivity });
};

export const saveOnboarding = async (req: Request, res: Response) => {
    const tenantId = req.user?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: existing } = await db
        .from('broker_identity')
        .select('broker_id')
        .eq('broker_id', tenantId)
        .maybeSingle();

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
        broker_id: tenantId,
        ...req.body,
        updated_at: now,
    };

    if (!existing) {
        payload.created_at = now;
    }

    const { data, error } = await db
        .from('broker_identity')
        .upsert(payload, { onConflict: 'broker_id' })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    void pushRecentAction(tenantId, 'Completed onboarding step');

    const { data: profile } = await db
        .from('profiles')
        .select('email, full_name, phone')
        .eq('id', tenantId)
        .maybeSingle();

    await syncBrokerActivityProfile({
        tenantId,
        onboarding: data || payload,
        profile: profile || null,
    });

    if (req.body?.onboarding_completed === true) {
        if (profile?.email) {
            void emailNotificationService.sendWelcomeEmail({
                to: profile.email,
                fullName: profile.full_name,
            });
        }
    }

    const brokerActivity = await getLinkedBrokerActivity(tenantId);

    res.json({ data, brokerActivity });
};
