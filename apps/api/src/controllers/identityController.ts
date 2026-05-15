import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { pushRecentAction } from '../services/identityService';
import { emailNotificationService } from '../services/emailNotificationService';

const db = supabaseAdmin ?? supabase;

export const getOnboarding = async (req: Request, res: Response) => {
    const tenantId = req.user?.id;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await db
        .from('broker_identity')
        .select('*')
        .eq('broker_id', tenantId)
        .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ data: data || null });
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
