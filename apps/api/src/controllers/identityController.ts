import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { pushRecentAction } from '../services/identityService';
import { emailNotificationService } from '../services/emailNotificationService';

const db = supabaseAdmin ?? supabase;

function normalizePhone(value?: string | null) {
    return String(value || '').replace(/\D/g, '');
}

function splitFullName(fullName?: string | null) {
    const normalized = String(fullName || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return { first_name: '', last_name: '' };
    }

    const [first_name = '', ...rest] = normalized.split(' ');
    return {
        first_name,
        last_name: rest.join(' ').trim(),
    };
}

function buildFullName(firstName?: string | null, lastName?: string | null) {
    return [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ');
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

    if (!data) {
        return res.json({ data: null });
    }

    const derivedNames = splitFullName((data as Record<string, unknown>).full_name as string | null | undefined);
    res.json({
        data: {
            ...data,
            first_name: derivedNames.first_name,
            last_name: derivedNames.last_name,
        },
    });
};

export const saveOnboarding = async (req: Request, res: Response) => {
    const tenantId = req.user?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const teamMembers = Array.isArray(req.body?.team_members) ? req.body.team_members : null;
    if (teamMembers) {
        const seen = new Set<string>();
        for (const member of teamMembers) {
            const normalizedPhone = normalizePhone(member?.mobile);
            if (!normalizedPhone) {
                continue;
            }

            if (seen.has(normalizedPhone)) {
                return res.status(400).json({ error: 'Duplicate team member mobile numbers are not allowed' });
            }

            seen.add(normalizedPhone);
        }
    }

    const { data: existing } = await db
        .from('broker_identity')
        .select('broker_id')
        .eq('broker_id', tenantId)
        .maybeSingle();

    const now = new Date().toISOString();
    const normalizedFirstName = String(req.body?.first_name || '').trim();
    const normalizedLastName = String(req.body?.last_name || '').trim();
    const normalizedFullName = buildFullName(normalizedFirstName, normalizedLastName) || String(req.body?.full_name || '').trim() || null;
    const { first_name: _ignoredFirstName, last_name: _ignoredLastName, ...body } = req.body || {};

    const payload: Record<string, unknown> = {
        broker_id: tenantId,
        ...body,
        full_name: normalizedFullName,
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

    if (req.body?.onboarding_completed === true) {
        const { data: profile } = await db
            .from('profiles')
            .select('email, full_name')
            .eq('id', tenantId)
            .maybeSingle();
        if (profile?.email) {
            void emailNotificationService.sendWelcomeEmail({
                to: profile.email,
                fullName: profile.full_name,
            });
        }
    }

    res.json({ data });
};
