import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { getErrorMessage } from '../utils/controllerHelpers';

const db = supabaseAdmin!;

export const listDmContacts = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const label = typeof req.query.label === 'string' ? req.query.label : null;

        let query = db
            .from('dm_contacts')
            .select('*')
            .eq('tenant_id', context.workspaceOwnerId)
            .order('updated_at', { ascending: false });

        if (label && ['realtor', 'client', 'none'].includes(label)) {
            query = query.eq('label', label);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, contacts: data || [] });
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error, 'Failed to list DM contacts') });
    }
};

export const tagDmContact = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const { remoteJid, label, name } = req.body;

        if (!remoteJid) {
            res.status(400).json({ error: 'remoteJid is required' });
            return;
        }

        if (!['none', 'realtor', 'client'].includes(label)) {
            res.status(400).json({ error: 'label must be one of: none, realtor, client' });
            return;
        }

        const phone = String(remoteJid).split('@')[0]?.replace(/[^0-9]/g, '') || null;

        const { data, error } = await db
            .from('dm_contacts')
            .upsert({
                tenant_id: context.workspaceOwnerId,
                remote_jid: remoteJid,
                label,
                name: name || null,
                phone,
                tagged_by: (req.user as any)?.id || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,remote_jid' })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, contact: data });
    } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error, 'Failed to tag DM contact') });
    }
};
